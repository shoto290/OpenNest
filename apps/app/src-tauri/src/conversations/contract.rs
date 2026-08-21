//! The vocabulary the durable transcript crosses to the frontend in.
//!
//! Every type here mirrors one the repositories under [`crate::db::repositories`]
//! already hold, and mirrors it rather than deriving serde on the stored type on
//! purpose. [`crate::db::repositories::messages`] keeps its vocabulary
//! deliberately apart from what crosses this boundary, and this file is the other
//! half of that sentence: a field the frontend needs renamed, split off or left
//! out is renamed, split off or left out here, and the rows already on disk read
//! back exactly as they were written. A `#[serde(rename)]` on a stored enum would
//! have made the same change a migration.
//!
//! Its sibling [`crate::agent::contract`] already spells a `MessageRole` with the
//! same two words, and the two are kept apart for the same reason: the vocabulary of
//! a live session and the vocabulary of a durable transcript answer to different
//! boundaries, and sharing one enum would make a rename asked for by either a rename
//! forced on both.
//!
//! It is also why the mirror is written by hand. The storage vocabularies convert
//! themselves to SQLite through helpers that are private to their module, so the
//! conversions below `match` on the public variants: a variant added to either
//! side stops compiling here instead of quietly crossing under a word the
//! frontend has no meaning for.
//!
//! Nothing here carries what a conversation said except
//! [`TranscriptMessage::content`], which is the transcript itself and the whole
//! reason a page was asked for, and the context
//! [`crate::conversations::commands::conversation_bounded_context`] answers with,
//! which is that transcript rebuilt for the run that is about to be told it. A
//! checkpoint's summary is left out for the same reason the rest is in: nothing on
//! the other side displays or submits it, so it stays in the file. The `detail` of
//! [`StorageFailure::Sqlite`] is
//! SQLite's own account of a statement — a constraint, a column, a schema — and
//! never a row's content: a transcript is personal data, and an error on its way
//! to the UI is the last place it may leak into.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::bundles;
use crate::db::repositories::{conversations, messages, runtime_context};
use crate::db::DatabaseError;

/// The eight animals the avatar engine draws, as the frontend spells them. It is
/// the deserializer that makes a ninth impossible: a word outside this list is
/// refused before a statement runs, so the `CHECK` on the column is the second
/// answer to the same question rather than the only one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AvatarAnimal {
	Cat,
	Rabbit,
	Bear,
	Chick,
	Dog,
	Mouse,
	Owl,
	Koala,
}

impl From<conversations::AvatarAnimal> for AvatarAnimal {
	fn from(animal: conversations::AvatarAnimal) -> Self {
		match animal {
			conversations::AvatarAnimal::Cat => AvatarAnimal::Cat,
			conversations::AvatarAnimal::Rabbit => AvatarAnimal::Rabbit,
			conversations::AvatarAnimal::Bear => AvatarAnimal::Bear,
			conversations::AvatarAnimal::Chick => AvatarAnimal::Chick,
			conversations::AvatarAnimal::Dog => AvatarAnimal::Dog,
			conversations::AvatarAnimal::Mouse => AvatarAnimal::Mouse,
			conversations::AvatarAnimal::Owl => AvatarAnimal::Owl,
			conversations::AvatarAnimal::Koala => AvatarAnimal::Koala,
		}
	}
}

impl From<AvatarAnimal> for conversations::AvatarAnimal {
	fn from(animal: AvatarAnimal) -> Self {
		match animal {
			AvatarAnimal::Cat => conversations::AvatarAnimal::Cat,
			AvatarAnimal::Rabbit => conversations::AvatarAnimal::Rabbit,
			AvatarAnimal::Bear => conversations::AvatarAnimal::Bear,
			AvatarAnimal::Chick => conversations::AvatarAnimal::Chick,
			AvatarAnimal::Dog => conversations::AvatarAnimal::Dog,
			AvatarAnimal::Mouse => conversations::AvatarAnimal::Mouse,
			AvatarAnimal::Owl => conversations::AvatarAnimal::Owl,
			AvatarAnimal::Koala => conversations::AvatarAnimal::Koala,
		}
	}
}

/// The eight colours a bot may be marked with. `null` crosses for a bot marked
/// with none, which is what a bot is until someone marks it: an `Option` rather
/// than a ninth word, so "no mark" and a mark named "none" cannot be confused on
/// either side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AvatarBlot {
	Coral,
	Amber,
	Moss,
	Water,
	Sky,
	Lavender,
	Rose,
	Slate,
}

impl From<conversations::AvatarBlot> for AvatarBlot {
	fn from(blot: conversations::AvatarBlot) -> Self {
		match blot {
			conversations::AvatarBlot::Coral => AvatarBlot::Coral,
			conversations::AvatarBlot::Amber => AvatarBlot::Amber,
			conversations::AvatarBlot::Moss => AvatarBlot::Moss,
			conversations::AvatarBlot::Water => AvatarBlot::Water,
			conversations::AvatarBlot::Sky => AvatarBlot::Sky,
			conversations::AvatarBlot::Lavender => AvatarBlot::Lavender,
			conversations::AvatarBlot::Rose => AvatarBlot::Rose,
			conversations::AvatarBlot::Slate => AvatarBlot::Slate,
		}
	}
}

impl From<AvatarBlot> for conversations::AvatarBlot {
	fn from(blot: AvatarBlot) -> Self {
		match blot {
			AvatarBlot::Coral => conversations::AvatarBlot::Coral,
			AvatarBlot::Amber => conversations::AvatarBlot::Amber,
			AvatarBlot::Moss => conversations::AvatarBlot::Moss,
			AvatarBlot::Water => conversations::AvatarBlot::Water,
			AvatarBlot::Sky => conversations::AvatarBlot::Sky,
			AvatarBlot::Lavender => conversations::AvatarBlot::Lavender,
			AvatarBlot::Rose => conversations::AvatarBlot::Rose,
			AvatarBlot::Slate => conversations::AvatarBlot::Slate,
		}
	}
}

/// A bot as the frontend meets it. `instructions` is projected because the
/// settings panel is where a bot is told how to answer: it is displayed, edited and
/// submitted back, so a reload that could not read it would show an empty field over
/// a stored prompt. It is read out of the bot's plugin bundle — see [`Bot::of`].
/// `memory` is not — it is what a run leaves behind for the next one, and nothing
/// over there displays or writes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
	pub id: String,
	pub name: String,
	pub title: String,
	/// The model label the bot answers under, read out of its plugin bundle the way
	/// `instructions` is — see [`Bot::of`]. Free text at this boundary, unlike the
	/// two faces below: which aliases exist is Claude Code's to change and nothing
	/// here can list them, so a label this build has never heard of crosses, is
	/// stored, and comes back the way it went in. The frontend offers the aliases it
	/// knows and shows anything else as it stands.
	pub model: String,
	pub avatar_animal: AvatarAnimal,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	/// Whether the bot is denied the tools that change files and run commands, read
	/// out of its plugin bundle the way `instructions` is — the agent file is what a
	/// run is really promoted onto, so the file is what the panel has to show.
	pub changes_nothing: bool,
	pub created_at: i64,
}

impl Bot {
	/// The stored row as the frontend meets it. `avatars` is the one directory a
	/// picture may live in, and the projection is where the recorded path stops being
	/// a column and becomes something a webview will be pointed at: anything
	/// [`avatars::readable`] refuses — outside the directory, gone, not a file — comes
	/// back as no picture at all, which is a bot wearing its animal rather than a
	/// fetch the UI has to recover from.
	///
	/// `None` for the directory is a run with nowhere to keep avatars. Same answer:
	/// every bot wears its animal.
	///
	/// `bundles` is where the same bot's plugin bundle lives, and `instructions` and
	/// `model` are read from the agent file inside it rather than from the columns:
	/// the file is what the process is actually started with — its `model` key is what
	/// the child answers under — so it is what the panel that edits them has to show.
	/// A bundle this install has not written — a bot from before there were any, a
	/// host with no data directory — falls back to the columns, which is what the
	/// bundle is rewritten from anyway.
	pub fn of(bot: conversations::Bot, avatars: Option<&Path>, bundles: Option<&Path>) -> Self {
		let written = bundles.and_then(|root| crate::bundles::generated(root, &bot.id));
		let model = written
			.as_ref()
			.and_then(|written| written.model.clone())
			.unwrap_or_else(|| bot.model.clone());
		let changes_nothing =
			written.as_ref().map_or(bot.changes_nothing, |written| written.changes_nothing);
		let instructions = written
			.map(|written| written.instructions)
			.filter(|found| crate::bundles::edited(found, &bot.instructions))
			.unwrap_or_else(|| bot.instructions.clone());
		let avatar_image_path = bot
			.avatar_image_path
			.as_deref()
			.zip(avatars)
			.and_then(|(recorded, dir)| avatars::readable(dir, recorded))
			.map(|path| path.to_string_lossy().into_owned());
		Self {
			id: bot.id,
			name: bot.name,
			title: bot.title,
			model,
			avatar_animal: bot.avatar_animal.into(),
			avatar_blot: bot.avatar_blot.map(Into::into),
			avatar_image_path,
			working_dir: bot.working_dir,
			instructions,
			changes_nothing,
			created_at: bot.created_at,
		}
	}
}

/// Who a bot is, as a caller submits it — whole, both to create one and to change
/// one. `id` and `createdAt` are absent because neither is a caller's to choose:
/// one is minted by the host, the other is when it did so. `model` is here — a
/// bot is moved between models from its own settings — and so is `instructions`,
/// which the settings panel edits in the same form as the name: one value the
/// caller emits whole, one write that replaces it. `memory` stays out: nothing over
/// there shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotIdentity {
	pub name: String,
	pub title: String,
	/// See [`Bot::model`]: a label, not a vocabulary.
	pub model: String,
	pub avatar_animal: AvatarAnimal,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	/// See [`Bot::changes_nothing`]: submitted beside the name, since it is set from
	/// the same panel, and laid down in the agent file by the write that follows.
	pub changes_nothing: bool,
}

impl From<BotIdentity> for conversations::BotIdentity {
	fn from(identity: BotIdentity) -> Self {
		Self {
			name: identity.name,
			title: identity.title,
			model: identity.model,
			avatar_animal: identity.avatar_animal.into(),
			avatar_blot: identity.avatar_blot.map(Into::into),
			avatar_image_path: identity.avatar_image_path,
			working_dir: identity.working_dir,
			instructions: identity.instructions,
			changes_nothing: identity.changes_nothing,
		}
	}
}

/// A skill of a bot's, as the frontend meets it. It lives in the bot's plugin
/// bundle and nowhere else: no column holds any of this, and a skill a hand dropped
/// into the directory is answered here beside the ones this app wrote.
///
/// `id` is the directory the skill lives in — the one name two of a bot's skills
/// cannot share, and the name every write below addresses one by. What the skill is
/// called is free text and changing it moves nothing on the disk.
///
/// `isPreloaded` is whether the body is carried into the bot's agent file, which is
/// the whole of how a skill reaches a promoted bot — see [`crate::bundles`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	#[serde(flatten)]
	pub front: bundles::SkillFront,
}

impl From<bundles::Skill> for Skill {
	fn from(skill: bundles::Skill) -> Self {
		Self {
			id: skill.id,
			name: skill.name,
			description: skill.description,
			body: skill.body,
			is_preloaded: skill.is_preloaded,
			front: skill.front,
		}
	}
}

/// What a caller writes a skill with, whole: the values a reader edits. The mark is
/// not one of them — it is set by its own command, because it changes what the bot
/// was told rather than what the skill says.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
	/// The one type on this boundary that is not mirrored. Its fields are the
	/// frontmatter's own keys, which the agent's file format spells and this app only
	/// reads: there is no wording here for a mirror to hold apart from the writer's,
	/// and a second copy of the list would be eighteen chances for the two to drift.
	#[serde(flatten)]
	pub front: bundles::SkillFront,
}

impl From<SkillDraft> for bundles::SkillDraft {
	fn from(draft: SkillDraft) -> Self {
		Self {
			name: draft.name,
			description: draft.description,
			body: draft.body,
			front: draft.front,
		}
	}
}

/// An MCP server a bot's bundle declares, as the frontend meets it. Like a skill it
/// lives in the bundle and nowhere else: no column holds any of it, and a `.mcp.json`
/// a hand wrote is answered beside what this app wrote.
///
/// `name` is what it is declared under and what it connects as —
/// `plugin:<bot id>:<name>`, see `agent/PLUGINS.md`. `config` travels verbatim: the
/// shape a transport asks for is the agent's to define, not this app's, so nothing
/// here narrows it past being an object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
	pub name: String,
	pub config: serde_json::Value,
}

impl From<bundles::McpServer> for McpServer {
	fn from(server: bundles::McpServer) -> Self {
		Self { name: server.name, config: server.config }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
}

impl From<conversations::Chat> for Chat {
	fn from(chat: conversations::Chat) -> Self {
		Self { id: chat.id, created_at: chat.created_at, updated_at: chat.updated_at }
	}
}

/// A run just opened in a participant's lineage, as the frontend meets it. It
/// carries what a runtime scope is made of and nothing else: `status` is `active`
/// or the call would not have answered, `ended_at` and `rotation_reason` belong to
/// the row this one replaced, and `provider_session_id` is a name the process has
/// not given yet.
///
/// `seq` keeps the storage's word rather than borrowing the runtime's: it is the
/// number the lineage counts with, and what the runtime does with it — take it for
/// the epoch of the scope it stamps every event with — is the runtime's business.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSession {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub seq: i64,
	pub started_at: i64,
}

impl From<runtime_context::RuntimeSession> for RuntimeSession {
	fn from(session: runtime_context::RuntimeSession) -> Self {
		Self {
			id: session.id,
			conversation_id: session.participant.conversation_id,
			bot_id: session.participant.bot_id,
			seq: session.seq,
			started_at: session.started_at,
		}
	}
}

/// A recovery point as the frontend meets it: which run took it, how far into the
/// transcript it reaches, and what it is estimated to cost to replay. The summary
/// itself does not cross — the context that carries it is built on this side, and
/// the caller only has to know a checkpoint landed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextCheckpoint {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub runtime_session_id: Option<String>,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

impl From<runtime_context::ContextCheckpoint> for ContextCheckpoint {
	fn from(checkpoint: runtime_context::ContextCheckpoint) -> Self {
		Self {
			id: checkpoint.id,
			conversation_id: checkpoint.participant.conversation_id,
			bot_id: checkpoint.participant.bot_id,
			runtime_session_id: checkpoint.runtime_session_id,
			last_message_seq: checkpoint.last_message_seq,
			token_count: checkpoint.token_count,
			created_at: checkpoint.created_at,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TranscriptRole {
	User,
	Assistant,
}

impl From<messages::MessageRole> for TranscriptRole {
	fn from(role: messages::MessageRole) -> Self {
		match role {
			messages::MessageRole::User => TranscriptRole::User,
			messages::MessageRole::Assistant => TranscriptRole::Assistant,
		}
	}
}

/// Where a message got to, the reader's word for what the file calls its
/// completion state. `Pending` and `Streaming` are in here and absent from
/// [`TerminalCompletion`]: a page may hold a message still being written, and no
/// caller may ask for one to go back to that.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TranscriptCompletion {
	Pending,
	Streaming,
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<messages::MessageState> for TranscriptCompletion {
	fn from(state: messages::MessageState) -> Self {
		match state {
			messages::MessageState::Pending => TranscriptCompletion::Pending,
			messages::MessageState::Streaming => TranscriptCompletion::Streaming,
			messages::MessageState::Complete => TranscriptCompletion::Complete,
			messages::MessageState::Cancelled => TranscriptCompletion::Cancelled,
			messages::MessageState::Failed => TranscriptCompletion::Failed,
			messages::MessageState::Interrupted => TranscriptCompletion::Interrupted,
		}
	}
}

/// The endings on their own, and the only thing
/// [`crate::conversations::commands::conversation_finalize_message`] will take.
/// The rule [`messages::TerminalState`] holds for the host is held for the
/// frontend by the same means: reopening a message is not a call this vocabulary
/// can express, so the deserializer refuses it before any code runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TerminalCompletion {
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<TerminalCompletion> for messages::TerminalState {
	fn from(completion: TerminalCompletion) -> Self {
		match completion {
			TerminalCompletion::Complete => messages::TerminalState::Complete,
			TerminalCompletion::Cancelled => messages::TerminalState::Cancelled,
			TerminalCompletion::Failed => messages::TerminalState::Failed,
			TerminalCompletion::Interrupted => messages::TerminalState::Interrupted,
		}
	}
}

/// A message as the reader receives it. It names its conversation, which
/// [`messages::StoredMessage`] does not have to: the file is read one
/// conversation at a time by a caller that said which, while a page crossing to
/// the frontend arrives on a channel that carries no such context.
///
/// `author_bot_id` and `replied_to_message_id` are stored and not projected. One
/// bot answers today, and a reply the frontend never links to is a column it has
/// nothing to do with — the row keeps both regardless.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub seq: i64,
	pub role: TranscriptRole,
	pub content: String,
	pub completion: TranscriptCompletion,
	pub created_at: i64,
}

impl TranscriptMessage {
	fn of(conversation_id: &str, stored: messages::StoredMessage) -> Self {
		Self {
			id: stored.id,
			conversation_id: conversation_id.to_owned(),
			turn_id: stored.turn_id,
			seq: stored.seq,
			role: stored.role.into(),
			content: stored.content,
			completion: stored.state.into(),
			created_at: stored.created_at,
		}
	}
}

/// `messages` in display order, oldest first. `has_more` is [`messages::MessagePage`]'s
/// own answer carried through: the frontend asks for the page before the one it
/// holds by the lowest `seq` it already has, so no cursor crosses — it would be a
/// second copy of a number already in `messages` — and whether anything older is
/// there at all is the one thing that cannot be read off the page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPage {
	pub conversation_id: String,
	pub messages: Vec<TranscriptMessage>,
	pub has_more: bool,
}

impl TranscriptPage {
	pub fn of(conversation_id: String, page: messages::MessagePage) -> Self {
		let messages = page
			.messages
			.into_iter()
			.map(|stored| TranscriptMessage::of(&conversation_id, stored))
			.collect();
		Self { conversation_id, messages, has_more: page.has_more }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTurn {
	pub id: String,
	pub conversation_id: String,
	pub started_at: i64,
}

impl From<NewTurn> for messages::NewTurn {
	fn from(turn: NewTurn) -> Self {
		Self { id: turn.id, conversation_id: turn.conversation_id, started_at: turn.started_at }
	}
}

/// A message authored on the frontend's side, whole. It carries its text because
/// it has all of it already — see [`messages::NewUserMessage`], which is what
/// makes a replay of it comparable field for field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewUserMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub content: String,
	pub created_at: i64,
}

impl From<NewUserMessage> for messages::NewUserMessage {
	fn from(message: NewUserMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			content: message.content,
			created_at: message.created_at,
		}
	}
}

/// A reply about to be streamed into, with no text field for the same reason
/// [`messages::NewAssistantMessage`] has none: its id is known before a word of
/// it exists, and every word reaches it through
/// [`crate::conversations::commands::conversation_append_text`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAssistantMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub created_at: i64,
}

impl From<NewAssistantMessage> for messages::NewAssistantMessage {
	fn from(message: NewAssistantMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			created_at: message.created_at,
		}
	}
}

/// Why the file could not serve a call, one variant per [`DatabaseError`]. None
/// of them is actionable in the UI beyond saying the transcript is not being
/// written — they are told apart so a bug report can name which, not so the
/// frontend can branch on them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StorageFailure {
	AppDataDir,
	#[serde(rename_all = "camelCase")]
	JournalMode {
		mode: String,
	},
	PoisonedConnection,
	CallInterrupted,
	/// [`DatabaseError::Conflict`] under the name it goes by out here: a write the
	/// row it names has already moved past.
	StaleWrite,
	/// SQLite's own account of the statement it refused, and nothing the statement
	/// was carrying — see this module's header.
	#[serde(rename_all = "camelCase")]
	Sqlite {
		detail: String,
	},
}

/// By reference on purpose: [`DatabaseError`] is neither `Clone` nor `Copy`, and
/// the one that stopped the launch is held by [`crate::db::DatabaseState`] for as
/// long as the host runs, so every call that reports it only borrows it.
impl From<&DatabaseError> for StorageFailure {
	fn from(error: &DatabaseError) -> Self {
		match error {
			DatabaseError::AppDataDir => StorageFailure::AppDataDir,
			DatabaseError::JournalMode(mode) => StorageFailure::JournalMode { mode: mode.clone() },
			DatabaseError::PoisonedConnection => StorageFailure::PoisonedConnection,
			DatabaseError::CallInterrupted => StorageFailure::CallInterrupted,
			DatabaseError::Conflict => StorageFailure::StaleWrite,
			DatabaseError::Sqlite(failure) => {
				StorageFailure::Sqlite { detail: failure.to_string() }
			}
		}
	}
}

/// Every way a conversation command can refuse. The two storage failures are kept
/// apart because they mean different things to a reader: `Unavailable` says
/// nothing has been written this whole run and nothing will be, while `Storage`
/// says this one call did not land and the next may.
///
/// The other three are rules the repositories hold rather than a file gone wrong,
/// and they carry what disagreed: an id, the field it diverged on, the two states
/// or the two values. A caller that replayed an event needs to know that much to
/// tell its own duplicate from two events claiming one place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TranscriptStoreError {
	/// The database never opened.
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	/// The file is there, this call failed.
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Conflict { id: String, field: String },
	#[serde(rename_all = "camelCase")]
	InvalidTransition { id: String, from: String, to: String },
	/// A write named a bot that is not on the record. The one refusal here a caller
	/// can act on: the list it is holding is behind the file, and reloading it is
	/// what puts them back together.
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	/// The bytes offered as an avatar were not stored, and nothing on the disk or on
	/// the bot changed. Carries which of the four things went wrong, because three of
	/// them are the user's to fix by picking another file.
	#[serde(rename_all = "camelCase")]
	RejectedAvatarImage { reason: AvatarRejection },
	/// The bot's plugin bundle could not be written, so the save was undone and the
	/// bot is as it was. It is a refusal rather than a warning because the bundle is
	/// what a process is really started on: a save reported as done while the disk
	/// kept the old brief would leave the bot answering by it for good — see
	/// [`crate::bundles`].
	#[serde(rename_all = "camelCase")]
	UnwritableBundle { detail: String },
}

/// Why an avatar was not stored, in the frontend's vocabulary. `tooLarge` carries
/// both numbers so the UI can say the limit without holding a copy of it, and the
/// two `detail` strings are the decoder's and the filesystem's own accounts — never
/// a path, which is the host's business and not the webview's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AvatarRejection {
	/// The leading bytes are not png, jpeg or webp — whatever the file was called.
	UnknownFormat,
	#[serde(rename_all = "camelCase")]
	TooLarge { bytes: u64, limit: u64 },
	#[serde(rename_all = "camelCase")]
	Undecodable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}

/// Written on the rejection rather than on the error, because the same four
/// reasons refuse a bot's picture and the user's own — see
/// [`crate::user::contract::UserPreferencesError`].
impl From<avatars::Rejection> for AvatarRejection {
	fn from(rejection: avatars::Rejection) -> Self {
		match rejection {
			avatars::Rejection::UnknownFormat => AvatarRejection::UnknownFormat,
			avatars::Rejection::TooLarge { bytes, limit } => {
				AvatarRejection::TooLarge { bytes, limit }
			}
			avatars::Rejection::Undecodable { detail } => AvatarRejection::Undecodable { detail },
			avatars::Rejection::Unwritable { detail } => AvatarRejection::Unwritable { detail },
		}
	}
}

impl From<avatars::Rejection> for TranscriptStoreError {
	fn from(rejection: avatars::Rejection) -> Self {
		TranscriptStoreError::RejectedAvatarImage { reason: rejection.into() }
	}
}

impl From<messages::TranscriptError> for TranscriptStoreError {
	fn from(error: messages::TranscriptError) -> Self {
		match error {
			messages::TranscriptError::Conflict { id, field } => {
				TranscriptStoreError::Conflict { id, field: field.to_owned() }
			}
			messages::TranscriptError::InvalidTransition { id, from, to } => {
				TranscriptStoreError::InvalidTransition {
					id,
					from: from.to_owned(),
					to: to.to_owned(),
				}
			}
			messages::TranscriptError::Database(failure) => {
				TranscriptStoreError::Storage { failure: (&failure).into() }
			}
		}
	}
}

/// The runtime lineage answers in [`DatabaseError`] directly: its rules are the
/// schema's — a live row per participant, a number per handover — so there is no
/// vocabulary of its own between it and the file.
impl From<DatabaseError> for TranscriptStoreError {
	fn from(error: DatabaseError) -> Self {
		TranscriptStoreError::Storage { failure: (&error).into() }
	}
}

impl From<conversations::ConversationError> for TranscriptStoreError {
	fn from(error: conversations::ConversationError) -> Self {
		match error {
			conversations::ConversationError::UnknownBot { id } => {
				TranscriptStoreError::UnknownBot { id }
			}
			conversations::ConversationError::Database(failure) => {
				TranscriptStoreError::Storage { failure: (&failure).into() }
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde::de::DeserializeOwned;
	use serde_json::{json, Value};

	use super::*;

	/// The frontend and the host agree on nothing but these field names, so the
	/// wire shape is asserted literally rather than round-tripped through serde
	/// alone: a rename would survive a round trip and break every reader.
	///
	/// Parsing it back matters just as much for the input types — a page is written
	/// by a frontend that builds this JSON by hand.
	fn assert_crosses_as<T>(value: T, wire: Value)
	where
		T: std::fmt::Debug + PartialEq + Serialize + DeserializeOwned,
	{
		assert_eq!(
			serde_json::to_value(&value).expect("the value serializes"),
			wire,
			"the shape crossing to the frontend changed"
		);
		assert_eq!(
			serde_json::from_value::<T>(wire).expect("the wire shape parses"),
			value,
			"what the frontend sends under these names did not come home"
		);
	}

	fn a_message() -> TranscriptMessage {
		TranscriptMessage {
			id: "m1".into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			seq: 1,
			role: TranscriptRole::Assistant,
			content: "hi there".into(),
			completion: TranscriptCompletion::Complete,
			created_at: 2,
		}
	}

	fn a_message_wire() -> Value {
		json!({
			"id": "m1",
			"conversationId": "c1",
			"turnId": "t1",
			"seq": 1,
			"role": "assistant",
			"content": "hi there",
			"completion": "complete",
			"createdAt": 2
		})
	}

	#[test]
	fn a_bot_and_the_chat_it_holds_cross_as_camel_case() {
		assert_crosses_as(
			Bot {
				id: "default".into(),
				name: "Claude".into(),
				title: "Reviewer".into(),
				model: "opus".into(),
				avatar_animal: AvatarAnimal::Owl,
				avatar_blot: Some(AvatarBlot::Coral),
				avatar_image_path: Some("/pictures/owl.png".into()),
				working_dir: Some("/work/opennest".into()),
				instructions: "Answer briefly.".into(),
				changes_nothing: true,
				created_at: 1,
			},
			json!({
				"id": "default",
				"name": "Claude",
				"title": "Reviewer",
				"model": "opus",
				"avatarAnimal": "owl",
				"avatarBlot": "coral",
				"avatarImagePath": "/pictures/owl.png",
				"workingDir": "/work/opennest",
				"instructions": "Answer briefly.",
				"changesNothing": true,
				"createdAt": 1
			}),
		);
		assert_crosses_as(
			Chat { id: "c1".into(), created_at: 1, updated_at: 2 },
			json!({ "id": "c1", "createdAt": 1, "updatedAt": 2 }),
		);
	}

	/// What a bot nobody has described looks like on the wire: empty where the
	/// column is `NOT NULL DEFAULT ''`, `null` where it names something outside the
	/// database. The two are not the same fact, and neither may arrive as the other.
	#[test]
	fn a_bot_with_nothing_said_about_it_crosses_with_its_absences_intact() {
		assert_crosses_as(
			BotIdentity {
				name: "Claude".into(),
				title: String::new(),
				model: "sonnet".into(),
				avatar_animal: AvatarAnimal::Cat,
				avatar_blot: None,
				avatar_image_path: None,
				working_dir: None,
				instructions: String::new(),
				changes_nothing: false,
			},
			json!({
				"name": "Claude",
				"title": "",
				"model": "sonnet",
				"avatarAnimal": "cat",
				"avatarBlot": null,
				"avatarImagePath": null,
				"workingDir": null,
				"instructions": "",
				"changesNothing": false
			}),
		);
	}

	/// The eight animals and the eight colours, each crossing as the one word the
	/// avatar engine draws it under. A ninth is not a value this vocabulary can
	/// express, so the deserializer refuses it before any code runs — which is the
	/// whole reason a face never reaches the file misspelled. `null` is the ninth
	/// answer for a mark and the only one: a bot wearing no colour.
	#[test]
	fn every_face_crosses_as_one_word_and_nothing_else_parses() {
		for (animal, wire) in [
			(AvatarAnimal::Cat, "cat"),
			(AvatarAnimal::Rabbit, "rabbit"),
			(AvatarAnimal::Bear, "bear"),
			(AvatarAnimal::Chick, "chick"),
			(AvatarAnimal::Dog, "dog"),
			(AvatarAnimal::Mouse, "mouse"),
			(AvatarAnimal::Owl, "owl"),
			(AvatarAnimal::Koala, "koala"),
		] {
			assert_crosses_as(animal, json!(wire));
		}
		for (blot, wire) in [
			(AvatarBlot::Coral, "coral"),
			(AvatarBlot::Amber, "amber"),
			(AvatarBlot::Moss, "moss"),
			(AvatarBlot::Water, "water"),
			(AvatarBlot::Sky, "sky"),
			(AvatarBlot::Lavender, "lavender"),
			(AvatarBlot::Rose, "rose"),
			(AvatarBlot::Slate, "slate"),
		] {
			assert_crosses_as(blot, json!(wire));
		}
		assert_crosses_as(None::<AvatarBlot>, json!(null));
		assert!(
			serde_json::from_value::<AvatarAnimal>(json!("dragon")).is_err(),
			"an animal the avatar engine cannot draw parsed at the boundary"
		);
		assert!(
			serde_json::from_value::<AvatarBlot>(json!("chartreuse")).is_err(),
			"a colour outside the palette parsed at the boundary"
		);
	}

	/// The boundary no longer has a word for the pose or for the description, and a
	/// caller that still spells either is answered the way this vocabulary answers
	/// anything it has no field for: the word carries nothing, and the mark it did
	/// not name is no mark. That is what a caller written against the older shape
	/// gets — an unmarked bot, not a refusal, and not a pose smuggled in under
	/// another name.
	#[test]
	fn an_identity_still_spelling_the_abandoned_words_crosses_as_a_bot_with_no_mark() {
		let submitted = json!({
			"name": "Nyx",
			"title": "",
			"description": "Reads a diff.",
			"model": "sonnet",
			"avatarAnimal": "cat",
			"avatarPose": "idle",
			"avatarImagePath": null,
			"workingDir": null,
			"instructions": "",
			"changesNothing": false
		});

		let parsed = serde_json::from_value::<BotIdentity>(submitted).expect("the identity parses");

		assert_eq!(parsed.avatar_blot, None, "a pose reached the mark it is not");
	}

	/// What the frontend builds a runtime scope out of. A rename here is a launch
	/// that scopes its events with `undefined` and rejects every one of them.
	#[test]
	fn an_opened_run_crosses_as_camel_case() {
		assert_crosses_as(
			RuntimeSession {
				id: "r1".into(),
				conversation_id: "c1".into(),
				bot_id: "default".into(),
				seq: 2,
				started_at: 17,
			},
			json!({
				"id": "r1",
				"conversationId": "c1",
				"botId": "default",
				"seq": 2,
				"startedAt": 17
			}),
		);
	}

	/// What a caller learns about the recovery point it just paid for. The summary is
	/// deliberately not among the fields: it is the conversation's own words, and the
	/// only thing that reads them is the context builder on this side.
	#[test]
	fn a_stored_checkpoint_crosses_as_camel_case_without_its_summary() {
		let wire = json!({
			"id": "k1",
			"conversationId": "c1",
			"botId": "default",
			"runtimeSessionId": "r1",
			"lastMessageSeq": 12,
			"tokenCount": 30,
			"createdAt": 17
		});
		assert_crosses_as(
			ContextCheckpoint {
				id: "k1".into(),
				conversation_id: "c1".into(),
				bot_id: "default".into(),
				runtime_session_id: Some("r1".into()),
				last_message_seq: 12,
				token_count: 30,
				created_at: 17,
			},
			wire.clone(),
		);
		assert!(
			!wire.to_string().contains("summary"),
			"a checkpoint carried the conversation's own words across"
		);
	}

	/// The lineage answers in the file's own vocabulary, so what a caller reads is
	/// the same `storage` refusal every other write speaks — a run refused because
	/// the row moved on must not arrive under a word the frontend has no branch for.
	#[test]
	fn a_lineage_failure_crosses_as_a_storage_refusal() {
		assert_eq!(
			TranscriptStoreError::from(DatabaseError::Conflict),
			TranscriptStoreError::Storage { failure: StorageFailure::StaleWrite }
		);
	}

	#[test]
	fn every_role_and_completion_crosses_as_one_camel_case_word() {
		for (role, wire) in
			[(TranscriptRole::User, "user"), (TranscriptRole::Assistant, "assistant")]
		{
			assert_crosses_as(role, json!(wire));
		}
		for (completion, wire) in [
			(TranscriptCompletion::Pending, "pending"),
			(TranscriptCompletion::Streaming, "streaming"),
			(TranscriptCompletion::Complete, "complete"),
			(TranscriptCompletion::Cancelled, "cancelled"),
			(TranscriptCompletion::Failed, "failed"),
			(TranscriptCompletion::Interrupted, "interrupted"),
		] {
			assert_crosses_as(completion, json!(wire));
		}
		for (ending, wire) in [
			(TerminalCompletion::Complete, "complete"),
			(TerminalCompletion::Cancelled, "cancelled"),
			(TerminalCompletion::Failed, "failed"),
			(TerminalCompletion::Interrupted, "interrupted"),
		] {
			assert_crosses_as(ending, json!(wire));
		}
	}

	#[test]
	fn a_message_and_the_page_holding_it_cross_as_camel_case() {
		assert_crosses_as(a_message(), a_message_wire());
		assert_crosses_as(
			TranscriptPage {
				conversation_id: "c1".into(),
				messages: vec![a_message()],
				has_more: true,
			},
			json!({ "conversationId": "c1", "messages": [a_message_wire()], "hasMore": true }),
		);
	}

	#[test]
	fn every_write_a_caller_submits_crosses_as_camel_case() {
		assert_crosses_as(
			NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 1 },
			json!({ "id": "t1", "conversationId": "c1", "startedAt": 1 }),
		);
		assert_crosses_as(
			NewUserMessage {
				id: "m1".into(),
				conversation_id: "c1".into(),
				turn_id: "t1".into(),
				author_bot_id: None,
				replied_to_message_id: None,
				content: "hello".into(),
				created_at: 1,
			},
			json!({
				"id": "m1",
				"conversationId": "c1",
				"turnId": "t1",
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1
			}),
		);
		assert_crosses_as(
			NewAssistantMessage {
				id: "m2".into(),
				conversation_id: "c1".into(),
				turn_id: "t1".into(),
				author_bot_id: Some("default".into()),
				replied_to_message_id: Some("m1".into()),
				created_at: 2,
			},
			json!({
				"id": "m2",
				"conversationId": "c1",
				"turnId": "t1",
				"authorBotId": "default",
				"repliedToMessageId": "m1",
				"createdAt": 2
			}),
		);
	}

	/// Every failure is tagged, so a reader switches on `kind` and never on the
	/// presence of a field.
	#[test]
	fn every_failure_crosses_as_a_tagged_camel_case_object() {
		for (failure, wire) in [
			(StorageFailure::AppDataDir, json!({ "kind": "appDataDir" })),
			(
				StorageFailure::JournalMode { mode: "delete".into() },
				json!({ "kind": "journalMode", "mode": "delete" }),
			),
			(StorageFailure::PoisonedConnection, json!({ "kind": "poisonedConnection" })),
			(StorageFailure::CallInterrupted, json!({ "kind": "callInterrupted" })),
			(StorageFailure::StaleWrite, json!({ "kind": "staleWrite" })),
			(
				StorageFailure::Sqlite { detail: "UNIQUE constraint failed".into() },
				json!({ "kind": "sqlite", "detail": "UNIQUE constraint failed" }),
			),
		] {
			assert_crosses_as(failure, wire);
		}

		for (refusal, wire) in [
			(
				TranscriptStoreError::Unavailable { failure: StorageFailure::AppDataDir },
				json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }),
			),
			(
				TranscriptStoreError::Storage { failure: StorageFailure::PoisonedConnection },
				json!({ "kind": "storage", "failure": { "kind": "poisonedConnection" } }),
			),
			(
				TranscriptStoreError::Conflict { id: "m1".into(), field: "content".into() },
				json!({ "kind": "conflict", "id": "m1", "field": "content" }),
			),
			(
				TranscriptStoreError::InvalidTransition {
					id: "m1".into(),
					from: "complete".into(),
					to: "failed".into(),
				},
				json!({
					"kind": "invalidTransition",
					"id": "m1",
					"from": "complete",
					"to": "failed"
				}),
			),
			(
				TranscriptStoreError::UnknownBot { id: "b1".into() },
				json!({ "kind": "unknownBot", "id": "b1" }),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::UnknownFormat,
				},
				json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } }),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::TooLarge { bytes: 6_000_000, limit: 5_242_880 },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "tooLarge", "bytes": 6_000_000, "limit": 5_242_880 }
				}),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::Undecodable { detail: "unexpected end".into() },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "undecodable", "detail": "unexpected end" }
				}),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::Unwritable { detail: "no space left".into() },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "unwritable", "detail": "no space left" }
				}),
			),
		] {
			assert_crosses_as(refusal, wire);
		}
	}

	/// The limit crossing as a number rather than as prose: it is the frontend that
	/// tells a user how big a picture may be, and it reads that off the refusal
	/// instead of holding a second copy of the number.
	#[test]
	fn every_reason_a_picture_is_refused_keeps_its_shape_on_the_way_out() {
		for (rejection, reason) in [
			(avatars::Rejection::UnknownFormat, AvatarRejection::UnknownFormat),
			(
				avatars::Rejection::TooLarge { bytes: 9, limit: 8 },
				AvatarRejection::TooLarge { bytes: 9, limit: 8 },
			),
			(
				avatars::Rejection::Undecodable { detail: "torn".into() },
				AvatarRejection::Undecodable { detail: "torn".into() },
			),
			(
				avatars::Rejection::Unwritable { detail: "read only".into() },
				AvatarRejection::Unwritable { detail: "read only".into() },
			),
		] {
			assert_eq!(
				TranscriptStoreError::from(rejection),
				TranscriptStoreError::RejectedAvatarImage { reason }
			);
		}
	}

	/// A row as the database hands it over, on the model it names.
	fn a_stored_bot(model: &str) -> conversations::Bot {
		conversations::Bot {
			id: "b1".into(),
			name: "Nyx".into(),
			title: String::new(),
			model: model.to_owned(),
			avatar_animal: conversations::AvatarAnimal::Owl,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: String::new(),
			memory: String::new(),
			changes_nothing: false,
			created_at: 1,
		}
	}

	/// A scratch bundle directory of this test's own, empty before it is written to.
	fn a_bundle_root(name: &str) -> std::path::PathBuf {
		let root = std::env::temp_dir().join(format!("opennest-contract-{name}"));
		let _ = std::fs::remove_dir_all(&root);
		root
	}

	/// The projection every read of a bot goes through, on the two answers that are
	/// not a picture: a path pointing out of the directory, and a run with no
	/// directory at all. Both come back as no picture, which is the bot in its animal.
	#[test]
	fn a_bot_wearing_a_path_the_host_will_not_serve_crosses_without_one() {
		let stored = |path: Option<&str>| conversations::Bot {
			avatar_image_path: path.map(str::to_owned),
			..a_stored_bot("sonnet")
		};
		let dir = std::env::temp_dir();

		assert_eq!(Bot::of(stored(Some("/etc/passwd")), Some(&dir), None).avatar_image_path, None);
		assert_eq!(Bot::of(stored(Some("/etc/passwd")), None, None).avatar_image_path, None);
		assert_eq!(Bot::of(stored(None), Some(&dir), None).avatar_image_path, None);
	}

	/// The disk is the truth for what a child is started on, and the model is one of
	/// those: a bundle naming one is reported over the column, and a run with no
	/// bundle to read falls back to it.
	#[test]
	fn a_bot_is_reported_on_the_model_its_bundle_names() {
		let root = a_bundle_root("model");
		crate::bundles::write(&root, &a_stored_bot("haiku")).expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).model, "haiku");
		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, None).model, "sonnet");

		let _ = std::fs::remove_dir_all(&root);
	}

	/// The brief a reader is still writing crosses as they typed it. The agent file
	/// holds the body trimmed, so a projection that always preferred the file would
	/// answer every write with the space taken back off the end — and a reader who
	/// pressed space would watch it appear and leave again.
	#[test]
	fn a_brief_ending_in_a_space_crosses_as_the_reader_typed_it() {
		let root = a_bundle_root("still-typing");
		let typed = conversations::Bot { instructions: "Parles ".into(), ..a_stored_bot("sonnet") };
		crate::bundles::write(&root, &typed).expect("the bundle is written");

		assert_eq!(Bot::of(typed, None, Some(&root)).instructions, "Parles ");

		let _ = std::fs::remove_dir_all(&root);
	}

	/// The ending a caller reports is the one the file records: a mapping that
	/// slipped by one would close a message under a word nobody asked for, and no
	/// later read could tell.
	#[test]
	fn every_ending_a_caller_may_report_maps_onto_the_one_the_transcript_stores() {
		for (reported, stored) in [
			(TerminalCompletion::Complete, messages::TerminalState::Complete),
			(TerminalCompletion::Cancelled, messages::TerminalState::Cancelled),
			(TerminalCompletion::Failed, messages::TerminalState::Failed),
			(TerminalCompletion::Interrupted, messages::TerminalState::Interrupted),
		] {
			assert_eq!(messages::TerminalState::from(reported), stored);
		}
	}

	/// A launch that could not open the file keeps the reason all the way out, so
	/// the frontend can say which failure it is looking at rather than that there
	/// was one.
	#[test]
	fn an_unusable_database_keeps_its_reason_on_the_way_to_the_frontend() {
		for (error, failure) in [
			(DatabaseError::AppDataDir, StorageFailure::AppDataDir),
			(
				DatabaseError::JournalMode("memory".into()),
				StorageFailure::JournalMode { mode: "memory".into() },
			),
			(DatabaseError::PoisonedConnection, StorageFailure::PoisonedConnection),
			(DatabaseError::CallInterrupted, StorageFailure::CallInterrupted),
			(DatabaseError::Conflict, StorageFailure::StaleWrite),
		] {
			assert_eq!(StorageFailure::from(&error), failure);
		}

		let sqlite = DatabaseError::Sqlite(rusqlite::Error::QueryReturnedNoRows);
		assert_eq!(
			StorageFailure::from(&sqlite),
			StorageFailure::Sqlite { detail: rusqlite::Error::QueryReturnedNoRows.to_string() },
			"a SQLite failure crossed as something other than its own account"
		);
	}
}
