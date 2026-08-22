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

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime, State};

use super::context;
use super::contract::{
	Bot, BotHistoryEntry, BotIdentity, Chat, ContextCheckpoint, McpServer, NewAssistantMessage,
	NewTurn, NewUserMessage, RuntimeSession, Skill, SkillDraft, TerminalCompletion, TranscriptPage,
	TranscriptStoreError,
};
use crate::agent::contract::AgentCommand;
use crate::attachments;
use crate::avatars;
use crate::bundles;
use crate::db;
use crate::db::repositories::conversations::Bot as StoredBot;
use crate::db::repositories::messages::MessagePageQuery;
use crate::db::repositories::runtime_context::ParticipantKey;

/// The database, or why the launch never got one. Borrowed rather than cloned:
/// [`db::DatabaseState`] owns the outcome for the whole run.
fn ready(state: &db::DatabaseState) -> Result<&db::Database, TranscriptStoreError> {
	state.as_ref().map_err(|failure| TranscriptStoreError::Unavailable { failure: failure.into() })
}

/// The bot's plugin bundle, laid down again from the row that was just written.
///
/// A disk that would not take it fails the save it belongs to, and the caller puts the
/// row back: the bundle is what the process is really started on and what the brief is
/// read back from, so a save reported as done over a bundle still holding the old body
/// would leave the bot answering by it — silently, and for good.
///
/// The listing is not held to the same standard: a marketplace that could not be
/// rewritten costs a reader one gesture, and the next write of any bot restores it.
///
/// The answer style comes from the identity the caller submitted rather than from the
/// row, because no column holds it: the agent file is where it lives, and this write
/// is the only one that moves it — see [`bundles::write_styled`].
async fn write_bundle(
	root: Option<&Path>,
	database: &db::Database,
	bot: &StoredBot,
	output_style: &str,
) -> Result<(), TranscriptStoreError> {
	if let Some(root) = root {
		bundles::write_styled(root, bot, output_style).map_err(|error| {
			TranscriptStoreError::UnwritableBundle { detail: error.to_string() }
		})?;
	}
	list_bundles(root, database).await;
	Ok(())
}

/// The bundle of a bot that is gone, and the listing that stops naming it.
async fn forget_bundle(root: Option<&Path>, database: &db::Database, bot_id: &str) {
	if let Some(root) = root {
		bundles::remove(root, bot_id);
	}
	list_bundles(root, database).await;
}

/// The marketplace every bundle is listed in, rebuilt from the roster after anything
/// that changes it — one gesture for a reader who wants their bots somewhere else,
/// instead of one install per directory.
///
/// Every bot on the roster is laid down before it is listed: a bundle a session has
/// not written yet — a bot from before there were any — would otherwise be named by
/// an entry pointing at a directory that is not there, which is a marketplace a
/// reader cannot add.
/// Every bundle this install holds, laid down and listed once the launch has a
/// database. A reader who never opens the settings panel still has a marketplace to
/// add, and a bundle a hand took away between two launches is back before the bot is
/// spoken to.
///
/// The app's own plugin is written first, and without a database: it is the host's own
/// text rather than a projection of anything stored, every session loads it beside the
/// bot's, and this is the one write it has — see [`bundles::system`].
pub async fn list_bundles_at_launch<R: Runtime>(app: &AppHandle<R>) {
	if let Some(path) = bundles::system::path(app) {
		let _ = bundles::system::write(&path);
	}
	let state = app.state::<db::DatabaseState>();
	let Ok(database) = state.inner().as_ref() else {
		return;
	};
	list_bundles(bundles::root(app).as_deref(), database).await;
}

async fn list_bundles(root: Option<&Path>, database: &db::Database) {
	let Some(root) = root else {
		return;
	};
	if let Ok(roster) = database.conversations().bots().await {
		for bot in &roster {
			let _ = bundles::ensure(root, bot);
		}
		let _ = bundles::write_marketplace(root, &roster);
	}
}

/// The brief this write lays down, resolved against the file the bot really runs on:
/// a reader who changed it in the panel is writing a new one, and a reader who left
/// it alone is not writing over a body somebody edited on the disk.
///
/// A bot the file no longer holds, or a host with nowhere to keep bundles, submits
/// what it submitted: there is no disk to prefer.
fn reconciled_identity(
	root: Option<&Path>,
	previous: Option<&StoredBot>,
	identity: BotIdentity,
) -> BotIdentity {
	let (Some(root), Some(previous)) = (root, previous) else {
		return identity;
	};
	let instructions = bundles::reconciled(root, previous, &identity.instructions);
	BotIdentity { instructions, ..identity }
}

/// Every bot on the record, and nothing is seeded on the way: a launch reads the
/// roster it finds, so a user who deleted their last bot opens on none rather than
/// on one this build wrote back. Creating one is the only way a bot appears.
///
/// Every command answering a bot resolves the avatar directory first and projects
/// through it — see [`Bot::of`]. A path is a column until something says it names a
/// file inside that one directory, and that is the only place it is said.
#[tauri::command]
pub async fn conversation_bots<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let stored = ready(&state)?.conversations().bots().await?;
	Ok(stored.into_iter().map(|bot| Bot::of(bot, dir.as_deref(), bundle_root.as_deref())).collect())
}

/// A bot and the chat it will be spoken to in, written as one unit. The chat is
/// not in the answer — a caller asks for it the way every other caller does, and
/// finds the one this write already seated rather than creating it.
///
/// A word outside a closed vocabulary is refused before this runs: `avatarAnimal`
/// holds a fixed set and `avatarBlot` that set or `null`, and anything else fails
/// deserialization — the command is never entered and nothing reaches the file.
/// `model` is the exception, and free text on purpose: see [`Bot::model`].
#[tauri::command]
pub async fn conversation_create_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	identity: BotIdentity,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let output_style = identity.output_style.clone();
	let created = database.conversations().create_bot(identity.into()).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	if let Err(refusal) =
		write_bundle(bundle_root.as_deref(), database, &created, &output_style).await
	{
		// The bot exists for as long as this call is still failing. Taking it back is
		// what makes the refusal true: a row nothing can be started from is not a bot
		// the reader asked for, and it has said nothing yet for the deletion to cost.
		let _ = database.conversations().delete_bot(created.id).await;
		avatars::sweep_referenced(database, dir.as_deref()).await;
		return Err(refusal);
	}
	Ok(Bot::of(created, dir.as_deref(), bundle_root.as_deref()))
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
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let previous = database.conversations().bot(id.clone()).await?;
	let reconciled = reconciled_identity(bundle_root.as_deref(), previous.as_ref(), identity);
	let output_style = reconciled.output_style.clone();
	let updated = database.conversations().update_bot(id.clone(), reconciled.into()).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	if let Err(refusal) =
		write_bundle(bundle_root.as_deref(), database, &updated, &output_style).await
	{
		// The row moved and the bundle did not, which is the one state this whole
		// module exists to make impossible. It is put back as it was, so what the
		// reader is told and what the bot is are the same thing again.
		if let Some(previous) = previous {
			let _ = database.conversations().update_bot(id, previous.into()).await;
			avatars::sweep_referenced(database, dir.as_deref()).await;
		}
		return Err(refusal);
	}
	Ok(Bot::of(updated, dir.as_deref(), bundle_root.as_deref()))
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
	let database = ready(&state)?;
	let repository = database.conversations();
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
		avatars::sweep_referenced(database, Some(&dir)).await;
		return Err(rejection.into());
	}
	avatars::sweep_referenced(database, Some(&dir)).await;
	Ok(Bot::of(updated, Some(&dir), bundles::root(&app).as_deref()))
}

/// The bot, its chat and the whole transcript under it. The last bot may be
/// deleted like any other: what is left is a file with no bots and no
/// conversations, which is the state a fresh install comes up in.
/// The bot, its chat, the whole transcript under it — and the picture it was
/// wearing and the files attached to its conversations, which the two sweeps take
/// because the rows that referenced them are gone. Its plugin bundle goes with it:
/// nothing derives one any more, so nothing would ever write over it again.
#[tauri::command]
pub async fn conversation_delete_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let attachment_dir = attachments::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	database.conversations().delete_bot(id.clone()).await?;
	forget_bundle(bundle_root.as_deref(), database, &id).await;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	attachments::sweep_referenced(database, attachment_dir.as_deref()).await;
	Ok(())
}

/// Every skill in the bot's bundle, by the directory each lives in. A skill a hand
/// dropped in is one of them: nothing here asks who wrote a file, and the disk is
/// the whole record — no column holds a skill.
///
/// A host with nowhere to keep bundles has no skills to report, the same way it has
/// no brief to read: an empty list rather than a refusal.
#[tauri::command]
pub async fn conversation_bot_skills<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
) -> Result<Vec<Skill>, TranscriptStoreError> {
	let Some(root) = bundles::root(&app) else {
		return Ok(Vec::new());
	};
	Ok(bundles::skills(&root, &bot_id).into_iter().map(Skill::from).collect())
}

/// A new skill for the bot, written at the directory its name slugs to. It is not
/// carried into the bot's prompt until it is marked — see
/// [`conversation_set_bot_skill_preloaded`].
#[tauri::command]
pub async fn conversation_create_bot_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let root = writable_root(&app)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::create_skill(&root, &bot, &draft.into())).map(Skill::from)
}

/// What the skill says, replaced whole. Every frontmatter key this app does not own
/// is left where it was: a `SKILL.md` a hand or another tool wrote is edited, never
/// written again from a template.
///
/// A skill the host generated is refused — see [`refuse_system_skill`].
#[tauri::command]
pub async fn conversation_update_bot_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	skill_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let root = writable_root(&app)?;
	refuse_system_skill(&root, &bot_id, &skill_id)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::update_skill(&root, &bot, &skill_id, &draft.into())).map(Skill::from)
}

/// Whether the skill's body is carried into the bot's agent file, which is the whole
/// of how a skill reaches a promoted bot. Both marks move together — a carried skill
/// left model-invocable is fetched again over text already in the prompt — and the
/// agent file is rewritten, since this changes what the bot was told.
#[tauri::command]
pub async fn conversation_set_bot_skill_preloaded<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	skill_id: String,
	is_preloaded: bool,
) -> Result<Skill, TranscriptStoreError> {
	let root = writable_root(&app)?;
	refuse_system_skill(&root, &bot_id, &skill_id)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::set_skill_preloaded(&root, &bot, &skill_id, is_preloaded)).map(Skill::from)
}

/// The skill, taken away with its own directory and nothing outside it. A skill the
/// host generated stays — see [`refuse_system_skill`].
#[tauri::command]
pub async fn conversation_delete_bot_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	skill_id: String,
) -> Result<(), TranscriptStoreError> {
	let root = writable_root(&app)?;
	refuse_system_skill(&root, &bot_id, &skill_id)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::remove_skill(&root, &bot, &skill_id))
}

/// The three writes above, stopped before anything is written when they name a skill
/// this host generated: it is the bot's own memory rules, read-only from the settings
/// and rewritten by the bot through its own tools. The mark is read off the disk on
/// every call, so a file the bot has since rewritten answers for itself.
fn refuse_system_skill(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
) -> Result<(), TranscriptStoreError> {
	if bundles::is_system_skill(root, bot_id, skill_id) {
		return Err(TranscriptStoreError::SystemSkill { id: skill_id.to_owned() });
	}
	Ok(())
}

/// Every MCP server the bot's bundle declares, by the name each is declared under. A
/// `.mcp.json` a hand wrote is read the same way, and a host with nowhere to keep
/// bundles answers none rather than refusing — the same as the skills above.
#[tauri::command]
pub async fn conversation_bot_mcp_servers<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
) -> Result<Vec<McpServer>, TranscriptStoreError> {
	let Some(root) = bundles::root(&app) else {
		return Ok(Vec::new());
	};
	Ok(bundles::mcp_servers(&root, &bot_id).into_iter().map(McpServer::from).collect())
}

/// The server written under the name given, added or replaced. Every other server and
/// every key of the file this app does not own stay where they were.
///
/// A configuration that is not a JSON object is refused, and the refusal carries the
/// shape that was wrong rather than the value: a configuration is a command to run
/// and an environment that often holds a token, and neither belongs in a message that
/// leaves the host.
#[tauri::command]
pub async fn conversation_set_bot_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	name: String,
	config: serde_json::Value,
) -> Result<McpServer, TranscriptStoreError> {
	let root = writable_root(&app)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::set_mcp_server(&root, &bot, &name, &config)).map(McpServer::from)
}

/// The server taken out of the file, and the rest of it left as it was. The last one
/// going takes the file with it, and the manifest stops pointing at it.
#[tauri::command]
pub async fn conversation_delete_bot_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	name: String,
) -> Result<(), TranscriptStoreError> {
	let root = writable_root(&app)?;
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	bundled(bundles::remove_mcp_server(&root, &bot, &name))
}

/// Every write to the bot's bundle, newest first. It is read off the repository
/// inside the bundle, which is the whole record: no column holds a commit.
///
/// A host with nowhere to keep bundles has no history to report, the same way it
/// has no skills — an empty list rather than a refusal. A bundle whose repository
/// will not open is a refusal, because the writes did land and this is the one
/// place a reader can be told their account of them is missing.
#[tauri::command]
pub async fn conversation_bot_history<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let Some(root) = bundles::root(&app) else {
		return Ok(Vec::new());
	};
	read_history(&root, &bot_id)
}

/// What one write changed, as a unified diff against what came before it. The very
/// first write has nothing before it and reads as every file being added.
#[tauri::command]
pub async fn conversation_bot_history_diff<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
	commit_id: String,
) -> Result<String, TranscriptStoreError> {
	let root = writable_root(&app)?;
	recounted(bundles::diff(&root, &bot_id, &commit_id))
}

/// The write undone, as a new write on top rather than a past rewritten. The bundle
/// on the disk is laid down again from the result — it is what a session is really
/// started on — and the answer is the history as it now reads, so the caller has
/// the new write without a second round trip.
#[tauri::command]
pub async fn conversation_bot_revert<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
	commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let root = writable_root(&app)?;
	bundles::revert(&root, &bot_id, &commit_id)
		.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })?;
	read_history(&root, &bot_id)
}

/// The bundle's history in the frontend's vocabulary, for the two commands that
/// answer with it.
fn read_history(root: &Path, bot_id: &str) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	recounted(bundles::history(root, bot_id))
		.map(|entries| entries.into_iter().map(BotHistoryEntry::from).collect())
}

/// What the bundle's repository would not tell us, in the frontend's vocabulary.
/// Nothing on the disk is wrong when this lands: the writes are all there and the
/// account of them is not — the read counterpart of [`bundled`].
fn recounted<T>(outcome: Result<T, git2::Error>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnreadableHistory { detail: error.to_string() })
}

/// Where this install keeps bundles, for a write that has nowhere else to land. A
/// host with no application data directory is refused rather than answered: a skill
/// and a server are both files in a bundle, and there is no bundle to put one in.
fn writable_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TranscriptStoreError> {
	bundles::root(app).ok_or_else(|| TranscriptStoreError::UnwritableBundle {
		detail: "there is no application data directory to keep bundles in".to_owned(),
	})
}

/// The bot a bundle write is for, as the file holds it. Read for every write because
/// the files it lays down are generated from the row: a bot the file no longer holds
/// is refused before anything is written.
async fn bot_row(database: &db::Database, bot_id: &str) -> Result<StoredBot, TranscriptStoreError> {
	database
		.conversations()
		.bot(bot_id.to_owned())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.to_owned() })
}

/// What the disk would not take, in the frontend's vocabulary. A name none of the
/// bot's own skills or servers answers to lands here too: the file is not there to be
/// written, which for a caller holding a list one gesture out of date is the same
/// answer. So does a server configuration the bundle refused, which is a caller's to
/// fix by offering another shape.
fn bundled<T>(outcome: std::io::Result<T>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })
}

/// The slash commands a session announced, kept against the bot it answered for.
/// A child names them once its session is up and nowhere else, and it is only spawned by
/// a prompt — so a bot the reader has just opened, and every bot after a restart,
/// has no session of its own to ask. What the last one named is what the composer
/// offers until a new one names its own.
#[tauri::command]
pub async fn conversation_record_bot_commands(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	commands: Vec<AgentCommand>,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.conversations().record_bot_commands(bot_id, commands).await?)
}

/// What was last held for the bot, which is an empty list until a session of its
/// own has announced something.
#[tauri::command]
pub async fn conversation_bot_commands(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Vec<AgentCommand>, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().bot_commands(bot_id).await?)
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

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::repositories::conversations::AvatarAnimal;

	fn a_bot() -> StoredBot {
		StoredBot {
			id: "b1".to_owned(),
			name: "Bean".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: AvatarAnimal::Owl,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: "Answer briefly.".to_owned(),
			memory: String::new(),
			denied_tools: Vec::new(),
			created_at: 1,
		}
	}

	/// What the settings may not do to a skill marked as the host's, and what it may
	/// still do to every other one. The refusal names the skill, and it happens before
	/// any of the three commands reaches a write.
	///
	/// The mark is written here rather than generated: the host puts its own text in its
	/// own plugin now — see `bundles::system` — and this is a bundle that still carries
	/// one of the copies it used to write.
	#[test]
	fn a_write_from_the_settings_stops_at_a_skill_marked_as_the_hosts() {
		let root = std::env::temp_dir().join("opennest-commands-system-skill");
		let _ = fs::remove_dir_all(&root);
		let bot = a_bot();
		bundles::write(&root, &bot).expect("the bundle is written");
		let older = bundles::dir(&root, &bot.id).join("skills").join("remembering");
		fs::create_dir_all(&older).expect("the older directory is made");
		fs::write(
			older.join("SKILL.md"),
			"---\nname: remembering\nmetadata:\n  opennest:\n    system: true\n---\n\nOld rules.\n",
		)
		.expect("the older file lands");

		let skills = bundles::skills(&root, &bot.id);
		let system =
			skills.iter().find(|skill| skill.is_system).expect("the marked file reads back");

		assert_eq!(
			refuse_system_skill(&root, &bot.id, &system.id),
			Err(TranscriptStoreError::SystemSkill { id: system.id.clone() })
		);
		assert_eq!(refuse_system_skill(&root, &bot.id, "written-by-a-reader"), Ok(()));

		let _ = fs::remove_dir_all(&root);
	}
}
