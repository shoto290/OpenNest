use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime, State};

use super::context;
use super::contract::{
	Bot, BotHistoryEntry, BotIdentity, Chat, ContextCheckpoint, Conversation, McpServer,
	MessageReference, NewAssistantMessage, NewTurn, NewUserMessage, PinnedBubble, RuntimeSession,
	Skill, SkillDraft, TerminalCompletion, TranscriptPage, TranscriptStoreError,
};
use crate::agent::contract::AgentCommand;
use crate::attachments;
use crate::avatars;
use crate::bundles;
use crate::db;
use crate::db::repositories::conversations::{
	Bot as StoredBot, Conversation as StoredConversation, ConversationDraft, ConversationEdit,
};
use crate::db::repositories::messages::MessagePageQuery;
use crate::db::repositories::runtime_context::ParticipantKey;

const DUPLICATE_SUFFIX: &str = " copy";

fn ready(state: &db::DatabaseState) -> Result<&db::Database, TranscriptStoreError> {
	state.as_ref().map_err(|failure| TranscriptStoreError::Unavailable { failure: failure.into() })
}

async fn write_bundle(
	root: Option<&Path>,
	database: &db::Database,
	bot: &StoredBot,
	output_style: &str,
	permissions: &bundles::BotPermissions,
) -> Result<StoredBot, TranscriptStoreError> {
	let accepted = permissions.clone().accepted();
	let ruled = database.conversations().set_permissions(bot.id.clone(), accepted.clone()).await?;
	if let Some(root) = root {
		bundles::set_permissions(root, bot, &accepted).map_err(unwritable)?;
		bundles::write_styled(root, bot, output_style).map_err(unwritable)?;
	}
	list_bundles(root, database).await;
	Ok(ruled)
}

fn remember_bundle(
	root: Option<&Path>,
	bot: &StoredBot,
	memory: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(root) = root else {
		return Ok(());
	};
	bundles::write_remembered(root, bot, memory).map_err(unwritable)
}

fn unwritable(error: std::io::Error) -> TranscriptStoreError {
	TranscriptStoreError::UnwritableBundle { detail: error.to_string() }
}

async fn forget_bundle(root: Option<&Path>, database: &db::Database, bot_id: &str) {
	if let Some(root) = root {
		bundles::remove(root, bot_id);
	}
	list_bundles(root, database).await;
}

pub async fn list_bundles_at_launch<R: Runtime>(app: &AppHandle<R>) {
	if let Some(path) = bundles::system::path(app) {
		let _ = bundles::system::write(&path);
	}
	if let Some(path) = bundles::user::path(app) {
		let _ = bundles::user::lay_down(&path);
	}
	let state = app.state::<db::DatabaseState>();
	let Ok(database) = state.inner().as_ref() else {
		return;
	};
	lay_down_space_plugins(app, database).await;
	list_bundles(bundles::root(app).as_deref(), database).await;
}

async fn lay_down_space_plugins<R: Runtime>(app: &AppHandle<R>, database: &db::Database) {
	let Ok(spaces) = database.spaces().list().await else {
		return;
	};
	for space in &spaces {
		bundles::space::lay_down(app, &space.id);
	}
}

async fn list_bundles(root: Option<&Path>, database: &db::Database) {
	let Some(root) = root else {
		return;
	};
	if let Ok(roster) = database.conversations().bots(None).await {
		for bot in &roster {
			let _ = bundles::ensure(root, bot);
		}
		let _ = bundles::write_marketplace(root, &roster);
	}
}

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

#[tauri::command]
pub async fn conversation_bots<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: Option<String>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let stored = ready(&state)?.conversations().bots(space_id).await?;
	Ok(stored.into_iter().map(|bot| Bot::of(bot, dir.as_deref(), bundle_root.as_deref())).collect())
}

#[tauri::command]
pub async fn conversation_create_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	identity: BotIdentity,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let output_style = identity.output_style.clone();
	let permissions = identity.permissions.clone();
	let created = database.conversations().create_bot(identity.into(), space_id, None).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled =
		match write_bundle(bundle_root.as_deref(), database, &created, &output_style, &permissions)
			.await
		{
			Ok(ruled) => ruled,
			Err(refusal) => {
				let _ = database.conversations().delete_bot(created.id).await;
				avatars::sweep_referenced(database, dir.as_deref()).await;
				return Err(refusal);
			}
		};
	Ok(Bot::of(ruled, dir.as_deref(), bundle_root.as_deref()))
}

#[tauri::command]
pub async fn conversation_duplicate_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let source = database
		.conversations()
		.bot(bot_id.clone())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.clone() })?;
	let destination = space_id.unwrap_or_else(|| source.space_id.clone());
	let section = carried_section(&source, &destination);
	let taken: Vec<String> = database
		.conversations()
		.bots(Some(destination.clone()))
		.await?
		.into_iter()
		.map(|bot| bot.name)
		.collect();
	let identity =
		duplicated_identity(Bot::of(source, dir.as_deref(), bundle_root.as_deref()), &taken);
	let output_style = identity.output_style.clone();
	let permissions = identity.permissions.clone();
	let created =
		database.conversations().create_bot(identity.into(), Some(destination), section).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled = match duplicated_bundle(
		bundle_root.as_deref(),
		database,
		&bot_id,
		&created,
		&output_style,
		&permissions,
	)
	.await
	{
		Ok(ruled) => ruled,
		Err(refusal) => {
			let _ = database.conversations().delete_bot(created.id.clone()).await;
			forget_bundle(bundle_root.as_deref(), database, &created.id).await;
			avatars::sweep_referenced(database, dir.as_deref()).await;
			return Err(refusal);
		}
	};
	Ok(Bot::of(ruled, dir.as_deref(), bundle_root.as_deref()))
}

fn carried_section(source: &StoredBot, destination: &str) -> Option<String> {
	source.section_id.clone().filter(|_| source.space_id == destination)
}

async fn duplicated_bundle(
	root: Option<&Path>,
	database: &db::Database,
	source_id: &str,
	bot: &StoredBot,
	output_style: &str,
	permissions: &bundles::BotPermissions,
) -> Result<StoredBot, TranscriptStoreError> {
	if let Some(root) = root {
		bundles::inherit(root, source_id, &bot.id).map_err(|error| {
			TranscriptStoreError::UnwritableBundle { detail: error.to_string() }
		})?;
	}
	write_bundle(root, database, bot, output_style, permissions).await
}

fn duplicated_identity(source: Bot, taken: &[String]) -> BotIdentity {
	BotIdentity {
		name: unshared_name(format!("{}{DUPLICATE_SUFFIX}", source.name), taken),
		title: source.title,
		model: source.model,
		avatar_animal: source.avatar_animal,
		avatar_blot: source.avatar_blot,
		avatar_image_path: source.avatar_image_path,
		working_dir: source.working_dir,
		instructions: source.instructions,
		denied_tools: source.denied_tools,
		permissions: source.permissions,
		output_style: source.output_style,
	}
}

fn unshared_name(wanted: String, taken: &[String]) -> String {
	let carried = |name: &str| taken.iter().any(|held| held == name);
	if !carried(&wanted) {
		return wanted;
	}
	let mut number = 2;
	loop {
		let candidate = format!("{wanted} {number}");
		if !carried(&candidate) {
			return candidate;
		}
		number += 1;
	}
}

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
	let permissions = reconciled.permissions.clone();
	let updated = database.conversations().update_bot(id.clone(), reconciled.into()).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled =
		match write_bundle(bundle_root.as_deref(), database, &updated, &output_style, &permissions)
			.await
		{
			Ok(ruled) => ruled,
			Err(refusal) => {
				if let Some(previous) = previous {
					let _ = database.conversations().update_bot(id, previous.into()).await;
					avatars::sweep_referenced(database, dir.as_deref()).await;
				}
				return Err(refusal);
			}
		};
	Ok(Bot::of(ruled, dir.as_deref(), bundle_root.as_deref()))
}

#[tauri::command]
pub async fn conversation_set_bot_memory<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	memory: String,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let repository = database.conversations();
	let previous = repository.bot(id.clone()).await?;
	let learned = memory.trim().to_owned();
	let updated = repository.set_memory(id.clone(), learned.clone()).await?;
	if let Err(refusal) = remember_bundle(bundle_root.as_deref(), &updated, &learned) {
		if let Some(previous) = previous {
			let _ = repository.set_memory(id, previous.memory).await;
		}
		return Err(refusal);
	}
	Ok(Bot::of(updated, dir.as_deref(), bundle_root.as_deref()))
}

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

#[tauri::command]
pub async fn conversation_bot_history_diff<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
	commit_id: String,
) -> Result<String, TranscriptStoreError> {
	let root = writable_root(&app)?;
	recounted(bundles::diff(&root, &bot_id, &commit_id))
}

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

fn read_history(root: &Path, bot_id: &str) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	recounted(bundles::history(root, bot_id))
		.map(|entries| entries.into_iter().map(BotHistoryEntry::from).collect())
}

pub(crate) fn recounted<T>(outcome: Result<T, git2::Error>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnreadableHistory { detail: error.to_string() })
}

fn writable_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TranscriptStoreError> {
	bundles::root(app).ok_or_else(|| TranscriptStoreError::UnwritableBundle {
		detail: "there is no application data directory to keep bundles in".to_owned(),
	})
}

async fn bot_row(database: &db::Database, bot_id: &str) -> Result<StoredBot, TranscriptStoreError> {
	database
		.conversations()
		.bot(bot_id.to_owned())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.to_owned() })
}

pub(crate) fn bundled<T>(outcome: std::io::Result<T>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })
}

#[tauri::command]
pub async fn conversation_record_bot_commands(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	commands: Vec<AgentCommand>,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.conversations().record_bot_commands(bot_id, commands).await?)
}

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

#[tauri::command]
pub async fn conversation_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	section_id: Option<String>,
	title: String,
	bot_ids: Vec<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let draft = ConversationDraft { space_id, section_id, title, bot_ids };
	let created = ready(&state)?.conversations().create_conversation(draft).await?;
	Ok(drawn(&app, created))
}

#[tauri::command]
pub async fn conversation_list<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<Conversation>, TranscriptStoreError> {
	let dir = avatars::dir(&app);
	let stored = ready(&state)?.conversations().conversations(space_id).await?;
	Ok(stored.into_iter().map(|room| Conversation::of(room, dir.as_deref())).collect())
}

#[tauri::command]
pub async fn conversation_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	title: String,
	instructions: String,
	section_id: Option<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let edit = ConversationEdit { title, instructions, section_id };
	let updated = ready(&state)?.conversations().update_conversation(conversation_id, edit).await?;
	Ok(drawn(&app, updated))
}

#[tauri::command]
pub async fn conversation_delete(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.conversations().delete_conversation(conversation_id).await?)
}

#[tauri::command]
pub async fn conversation_add_participant<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let joined = ready(&state)?.conversations().add_participant(conversation_id, bot_id).await?;
	Ok(drawn(&app, joined))
}

#[tauri::command]
pub async fn conversation_remove_participant<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let left = ready(&state)?.conversations().remove_participant(conversation_id, bot_id).await?;
	Ok(drawn(&app, left))
}

#[tauri::command]
pub async fn conversation_set_lead<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let led = ready(&state)?.conversations().set_lead(conversation_id, bot_id).await?;
	Ok(drawn(&app, led))
}

fn drawn<R: Runtime>(app: &AppHandle<R>, room: StoredConversation) -> Conversation {
	Conversation::of(room, avatars::dir(app).as_deref())
}

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
pub async fn conversation_message_reference(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
) -> Result<Option<MessageReference>, TranscriptStoreError> {
	let database = ready(&state)?;
	let Some(stored) = database.messages().message(conversation_id.clone(), message_id).await?
	else {
		return Ok(None);
	};
	let run = context::run_behind(database, &stored).await?;
	Ok(Some(MessageReference::of(conversation_id, stored, run)))
}

#[tauri::command]
pub async fn conversation_pin_message(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
	pinned_at: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?
		.messages()
		.pin_message(conversation_id, message_id, block_index, pinned_at)
		.await?)
}

#[tauri::command]
pub async fn conversation_unpin_message(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().unpin_message(conversation_id, message_id, block_index).await?)
}

#[tauri::command]
pub async fn conversation_pinned_messages(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<PinnedBubble>, TranscriptStoreError> {
	let stored = ready(&state)?.messages().pinned_messages(conversation_id.clone()).await?;
	Ok(stored.into_iter().map(|pin| PinnedBubble::of(&conversation_id, pin)).collect())
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
	settled_text: Option<String>,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().finalize_message(id, completion.into(), settled_text).await?)
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::repositories::conversations::AvatarAnimal;

	fn a_bot() -> StoredBot {
		StoredBot {
			id: "b1".to_owned(),
			space_id: "personal".to_owned(),
			section_id: None,
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
			permissions: None,
			created_at: 1,
		}
	}

	#[test]
	fn a_copy_staying_home_keeps_the_section_and_one_leaving_lands_in_none() {
		let held = StoredBot { section_id: Some("n1".to_owned()), ..a_bot() };

		assert_eq!(carried_section(&held, "personal"), Some("n1".to_owned()));
		assert_eq!(carried_section(&held, "vocca"), None);
		assert_eq!(carried_section(&a_bot(), "personal"), None);
	}

	#[test]
	fn a_duplicate_is_the_source_under_a_name_that_says_where_it_came_from() {
		use crate::conversations::contract::{AvatarAnimal, AvatarBlot};

		let source = Bot {
			id: "b1".to_owned(),
			section_id: None,
			name: "Bean".to_owned(),
			title: "Bakes".to_owned(),
			model: "opus".to_owned(),
			avatar_animal: AvatarAnimal::Owl,
			avatar_blot: Some(AvatarBlot::Cyan),
			avatar_image_path: Some("/pictures/bean.png".to_owned()),
			working_dir: Some("/loaves".to_owned()),
			instructions: "Answer briefly.".to_owned(),
			memory: "They bake on Sundays.".to_owned(),
			denied_tools: vec!["Bash".to_owned()],
			changes_nothing: true,
			permissions: bundles::BotPermissions::unruled(true),
			output_style: "terse".to_owned(),
			created_at: 1,
		};

		assert_eq!(
			duplicated_identity(source.clone(), &["Bean".to_owned()]),
			BotIdentity {
				name: "Bean copy".to_owned(),
				title: source.title,
				model: source.model,
				avatar_animal: source.avatar_animal,
				avatar_blot: source.avatar_blot,
				avatar_image_path: source.avatar_image_path,
				working_dir: source.working_dir,
				instructions: source.instructions,
				denied_tools: source.denied_tools,
				permissions: source.permissions,
				output_style: source.output_style,
			}
		);
	}

	#[test]
	fn a_duplicate_takes_the_lowest_name_no_bot_carries() {
		let named = |names: &[&str]| {
			let taken: Vec<String> = names.iter().map(|name| (*name).to_owned()).collect();
			unshared_name("Bean copy".to_owned(), &taken)
		};

		assert_eq!(named(&["Bean"]), "Bean copy");
		assert_eq!(named(&["Bean", "Bean copy"]), "Bean copy 2");
		assert_eq!(named(&["Bean", "Bean copy", "Bean copy 2"]), "Bean copy 3");
		assert_eq!(named(&["Bean", "Bean copy", "Bean copy 3"]), "Bean copy 2");
		assert_eq!(named(&[]), "Bean copy");
	}

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
