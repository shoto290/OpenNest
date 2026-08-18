//! The durable transcript as the frontend reaches it.
//!
//! Every command here is one crossing and nothing else: it resolves the database,
//! hands the call to the repository that owns the rule, and answers in the
//! vocabulary of [`super::contract`]. No rule is restated at this layer — replays,
//! endings and identity are decided inside the transaction that writes them, and a
//! second copy of any of those checks up here would be a second answer for a
//! caller to have to reconcile.
//!
//! A host whose file never opened still runs, so nothing may assume there is a
//! database: every command reads the managed [`db::DatabaseState`] first and
//! answers [`TranscriptStoreError::Unavailable`] when there is none. The frontend
//! is told the transcript is not being written, and why, instead of being handed a
//! silent success it would go on appending to.

use std::path::Path;

use tauri::{AppHandle, Runtime, State};

use super::context;
use super::contract::{
	Bot, BotIdentity, Chat, ContextCheckpoint, NewAssistantMessage, NewTurn, NewUserMessage,
	RuntimeSession, TerminalCompletion, TranscriptPage, TranscriptStoreError,
};
use crate::avatars;
use crate::db;
use crate::db::repositories::conversations::ConversationsRepository;
use crate::db::repositories::messages::MessagePageQuery;
use crate::db::repositories::runtime_context::ParticipantKey;

/// The database, or why the launch never got one. Borrowed rather than cloned:
/// [`db::DatabaseState`] owns the outcome for the whole run.
fn ready(state: &db::DatabaseState) -> Result<&db::Database, TranscriptStoreError> {
	state.as_ref().map_err(|failure| TranscriptStoreError::Unavailable { failure: failure.into() })
}

/// Restores the one invariant the avatar directory has: it holds exactly the files
/// the `bots` table still points at. Run after anything that changes a bot, so a
/// replaced picture, a deleted bot and a file some earlier crash left behind are all
/// answered by the same call rather than by three that have to be remembered.
///
/// Silent by design. A sweep is housekeeping after a write that already landed —
/// telling a caller its bot was saved *and* that a leftover file could not be
/// removed would be handing it a failure it has nothing to do about.
async fn sweep_avatars(repository: &ConversationsRepository, dir: Option<&Path>) {
	let Some(dir) = dir else {
		return;
	};
	if let Ok(referenced) = repository.avatar_image_paths().await {
		avatars::sweep(dir, &referenced);
	}
}

/// Every command answering a bot resolves the avatar directory first and projects
/// through it — see [`Bot::of`]. A path is a column until something says it names a
/// file inside that one directory, and that is the only place it is said.
#[tauri::command]
pub async fn conversation_default_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Bot, TranscriptStoreError> {
	let stored = ready(&state)?.conversations().ensure_default_bot().await?;
	Ok(Bot::of(stored, avatars::dir(&app).as_deref()))
}

#[tauri::command]
pub async fn conversation_bots<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let stored = ready(&state)?.conversations().bots().await?;
	Ok(stored.into_iter().map(|bot| Bot::of(bot, dir.as_deref())).collect())
}

/// A bot and the chat it will be spoken to in, written as one unit. The chat is
/// not in the answer — a caller asks for it the way every other caller does, and
/// finds the one this write already seated rather than creating it.
///
/// A word outside a closed vocabulary is refused before this runs: `model`,
/// `avatarAnimal` and `avatarPose` each hold a fixed set, and anything else fails
/// deserialization — the command is never entered and nothing reaches the file.
#[tauri::command]
pub async fn conversation_create_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	identity: BotIdentity,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let repository = ready(&state)?.conversations();
	let created = repository.create_bot(identity.into()).await?;
	sweep_avatars(repository, dir.as_deref()).await;
	Ok(Bot::of(created, dir.as_deref()))
}

/// Who the bot is, replaced whole: every field of [`BotIdentity`] is written, so
/// one left out of the payload is a bot the caller only half described rather
/// than a field it meant to keep. What the bot was told and what it has said are
/// not touched.
/// The picture is part of the identity a caller replaces, so this is also how one
/// is taken off a bot: an identity written with no `avatarImagePath` leaves the
/// column empty, and the sweep that follows takes the file the bot was wearing with
/// it. A caller echoing back the path it was handed keeps the picture it already
/// had — that path is still what the column holds, so the file stays referenced.
#[tauri::command]
pub async fn conversation_update_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	identity: BotIdentity,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let repository = ready(&state)?.conversations();
	let updated = repository.update_bot(id, identity.into()).await?;
	sweep_avatars(repository, dir.as_deref()).await;
	Ok(Bot::of(updated, dir.as_deref()))
}

/// The picture a bot wears, from bytes the user picked.
///
/// The order is the whole of the correctness here, and it runs cheapest-refusal
/// first. The bytes are validated and normalised entirely in memory, so anything
/// this host will not store is refused before a directory is resolved or a name is
/// minted. The database comes next, so a host that never opened one refuses without
/// touching the disk either. Only then is the row pointed at the new name — *before*
/// the bytes are written, so nothing sweeping the directory in between can mistake a
/// file that is about to exist for one nobody references. The sweep runs last and
/// takes the picture this one replaced, which is what leaves exactly one file behind.
///
/// A write that fails after the row moved puts the column back and sweeps, so a
/// half-written file is not left referenced: the bot comes back wearing its animal
/// and the caller is told why, rather than the UI being pointed at broken bytes.
/// That costs the picture the bot had, which is the honest reading of a disk that
/// would not take the new one.
#[tauri::command]
pub async fn conversation_set_bot_avatar_image<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	bytes: Vec<u8>,
) -> Result<Bot, TranscriptStoreError> {
	let normalised = avatars::picture::normalised(&bytes)?;
	let repository = ready(&state)?.conversations();
	let dir = avatars::dir(&app).ok_or(avatars::Rejection::Unwritable {
		detail: "there is no application data directory to store avatars in".to_owned(),
	})?;
	let path = avatars::minted_path(&dir);
	// Lossy because a column is text and a path is not: the name is this host's own
	// UUID either way, so nothing here can arrive as bytes no encoding survives.
	let recorded = path.to_string_lossy().into_owned();
	let updated = repository.set_avatar_image_path(id.clone(), Some(recorded)).await?;
	if let Err(rejection) = avatars::write(&path, &normalised) {
		let _ = repository.set_avatar_image_path(id, None).await;
		sweep_avatars(repository, Some(&dir)).await;
		return Err(rejection.into());
	}
	sweep_avatars(repository, Some(&dir)).await;
	Ok(Bot::of(updated, Some(&dir)))
}

/// The bot, its chat and the whole transcript under it. The last bot may be
/// deleted like any other: what is left is a file with no bots and no
/// conversations, which is the state a fresh install comes up in.
/// The bot, its chat, the whole transcript under it — and the picture it was
/// wearing, which the sweep takes because the row that referenced it is gone.
#[tauri::command]
pub async fn conversation_delete_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let repository = ready(&state)?.conversations();
	repository.delete_bot(id).await?;
	sweep_avatars(repository, dir.as_deref()).await;
	Ok(())
}

#[tauri::command]
pub async fn conversation_main_chat(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Chat, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().ensure_chat(bot_id).await?.into())
}

/// Opens the run a Claude process is about to be started for, and hands back the
/// row it took in the participant's lineage. The runtime is scoped by what comes
/// back — its id and its `seq` — so the process has a place on the record before it
/// has a pid, and a launch that never comes up is still a run somebody can name.
///
/// The handover is the repository's, whole: the live row this one replaces is
/// rotated inside the same transaction, so a caller cannot leave a participant with
/// two live runs or with none. `reason` describes that replaced row and never this
/// one — why a run was rotated is the caller's policy, and `None` is the honest
/// answer for the first run of a lineage, which replaces nothing.
#[tauri::command]
pub async fn conversation_open_runtime_session(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	started_at: i64,
	reason: Option<String>,
) -> Result<RuntimeSession, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	Ok(ready(&state)?.runtime_context().open(participant, started_at, reason).await?.into())
}

/// The name the provider gave the process answering in a run, written down against
/// that run. It is Claude's and only ever Claude's: the row keeps the id this side
/// minted for it, and a caller naming a run by the provider's word for it would be
/// pointing a lineage at a process nothing here opened.
///
/// Write-once and only while the run is live, which is the repository's rule and
/// stays there: a callback repeating itself is the one write it already was, and a
/// second id — or any id once the run has been replaced — is a process talking
/// about a session this row no longer stands for.
#[tauri::command]
pub async fn conversation_record_provider_session(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	provider_session_id: String,
) -> Result<(), TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	Ok(ready(&state)?
		.runtime_context()
		.record_provider_session(participant, runtime_session_id, provider_session_id)
		.await?)
}

/// Everything a run about to take over has to be told, as one piece of text. The
/// prompt is named rather than sent: it is already on the record, and reading it
/// from there is what makes it the upper bound of its own context instead of
/// something appended beside a tail that may already hold it.
#[tauri::command]
pub async fn conversation_bounded_context(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	prompt_message_id: String,
) -> Result<String, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	context::bounded_context(ready(&state)?, participant, prompt_message_id).await
}

/// The recovery point a later context resumes from, folded and stored before the
/// run that produced the conversation is retired. `None` says there was nothing new
/// to fold, which is not a failure: the previous checkpoint already stands for
/// everything but the tail a context reads verbatim anyway.
#[tauri::command]
pub async fn conversation_capture_checkpoint(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: Option<String>,
	created_at: i64,
) -> Result<Option<ContextCheckpoint>, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	Ok(context::capture_checkpoint(ready(&state)?, participant, runtime_session_id, created_at)
		.await?
		.map(Into::into))
}

/// `before_seq` is exclusive, and `None` asks for the newest page: that is the end
/// a conversation is opened at, and the only one a reader can name before it holds
/// a single message.
#[tauri::command]
pub async fn conversation_message_page(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
) -> Result<TranscriptPage, TranscriptStoreError> {
	let query = MessagePageQuery { conversation_id: conversation_id.clone(), before_seq, limit };
	let page = ready(&state)?.messages().page_messages(query).await?;
	Ok(TranscriptPage::of(conversation_id, page))
}

#[tauri::command]
pub async fn conversation_start_turn(
	state: State<'_, db::DatabaseState>,
	turn: NewTurn,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().start_turn(turn.into()).await?)
}

#[tauri::command]
pub async fn conversation_complete_turn(
	state: State<'_, db::DatabaseState>,
	id: String,
	completed_at: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().complete_turn(id, completed_at).await?)
}

#[tauri::command]
pub async fn conversation_append_user_message(
	state: State<'_, db::DatabaseState>,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().append_user_message(message.into()).await?)
}

#[tauri::command]
pub async fn conversation_open_assistant_message(
	state: State<'_, db::DatabaseState>,
	message: NewAssistantMessage,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().open_assistant_message(message.into()).await?)
}

#[tauri::command]
pub async fn conversation_append_text(
	state: State<'_, db::DatabaseState>,
	id: String,
	delta: String,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().append_text(id, delta).await?)
}

#[tauri::command]
pub async fn conversation_finalize_message(
	state: State<'_, db::DatabaseState>,
	id: String,
	completion: TerminalCompletion,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().finalize_message(id, completion.into()).await?)
}
