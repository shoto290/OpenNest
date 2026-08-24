
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::bundles;
use crate::db::repositories::{conversations, messages, runtime_context};
use crate::db::DatabaseError;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AvatarBlot {
	Red,
	Yellow,
	Green,
	Cyan,
	Blue,
	Purple,
	Pink,
	Orange,
}

impl From<conversations::AvatarBlot> for AvatarBlot {
	fn from(blot: conversations::AvatarBlot) -> Self {
		match blot {
			conversations::AvatarBlot::Red => AvatarBlot::Red,
			conversations::AvatarBlot::Yellow => AvatarBlot::Yellow,
			conversations::AvatarBlot::Green => AvatarBlot::Green,
			conversations::AvatarBlot::Cyan => AvatarBlot::Cyan,
			conversations::AvatarBlot::Blue => AvatarBlot::Blue,
			conversations::AvatarBlot::Purple => AvatarBlot::Purple,
			conversations::AvatarBlot::Pink => AvatarBlot::Pink,
			conversations::AvatarBlot::Orange => AvatarBlot::Orange,
		}
	}
}

impl From<AvatarBlot> for conversations::AvatarBlot {
	fn from(blot: AvatarBlot) -> Self {
		match blot {
			AvatarBlot::Red => conversations::AvatarBlot::Red,
			AvatarBlot::Yellow => conversations::AvatarBlot::Yellow,
			AvatarBlot::Green => conversations::AvatarBlot::Green,
			AvatarBlot::Cyan => conversations::AvatarBlot::Cyan,
			AvatarBlot::Blue => conversations::AvatarBlot::Blue,
			AvatarBlot::Purple => conversations::AvatarBlot::Purple,
			AvatarBlot::Pink => conversations::AvatarBlot::Pink,
			AvatarBlot::Orange => conversations::AvatarBlot::Orange,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
	pub id: String,
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_animal: AvatarAnimal,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	pub memory: String,
	pub denied_tools: Vec<String>,
	pub changes_nothing: bool,
	pub output_style: String,
	pub created_at: i64,
}

impl Bot {
	pub fn of(bot: conversations::Bot, avatars: Option<&Path>, bundles: Option<&Path>) -> Self {
		let written = bundles.and_then(|root| crate::bundles::generated(root, &bot.id));
		let model = written
			.as_ref()
			.and_then(|written| written.model.clone())
			.unwrap_or_else(|| bot.model.clone());
		let denied_tools = written
			.as_ref()
			.map_or_else(|| bot.denied_tools.clone(), |written| written.denied_tools.clone());
		let avatar_blot =
			written.as_ref().map_or(bot.avatar_blot, |written| written.blot).map(Into::into);
		let output_style = written
			.as_ref()
			.map_or_else(default_output_style, |written| written.output_style.clone());
		let memory = crate::bundles::held_memory(written.as_ref(), &bot.memory);
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
			avatar_blot,
			avatar_image_path,
			working_dir: bot.working_dir,
			instructions,
			memory,
			changes_nothing: crate::bundles::denies_changes(&denied_tools),
			denied_tools,
			output_style,
			created_at: bot.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotIdentity {
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_animal: AvatarAnimal,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	pub denied_tools: Vec<String>,
	#[serde(default = "default_output_style")]
	pub output_style: String,
}

fn default_output_style() -> String {
	crate::bundles::DEFAULT_OUTPUT_STYLE.to_owned()
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
			denied_tools: identity.denied_tools,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	pub is_system: bool,
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
			is_system: skill.is_system,
			front: skill.front,
		}
	}
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotHistoryEntry {
	pub id: String,
	pub timestamp: i64,
	pub author: HistoryAuthor,
	pub title: String,
	pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryAuthor {
	User,
	Bot,
}

impl From<bundles::Author> for HistoryAuthor {
	fn from(author: bundles::Author) -> Self {
		match author {
			bundles::Author::User => HistoryAuthor::User,
			bundles::Author::Bot => HistoryAuthor::Bot,
		}
	}
}

impl From<bundles::HistoryEntry> for BotHistoryEntry {
	fn from(entry: bundles::HistoryEntry) -> Self {
		Self {
			id: entry.id,
			timestamp: entry.timestamp,
			author: entry.author.into(),
			title: entry.title,
			body: entry.body,
		}
	}
}

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
	pub replied_to_message_id: Option<String>,
	pub runtime_session_id: Option<String>,
}

impl TranscriptMessage {
	pub fn of(conversation_id: &str, stored: messages::StoredMessage) -> Self {
		Self {
			id: stored.id,
			conversation_id: conversation_id.to_owned(),
			turn_id: stored.turn_id,
			seq: stored.seq,
			role: stored.role.into(),
			content: stored.content,
			completion: stored.state.into(),
			created_at: stored.created_at,
			replied_to_message_id: stored.replied_to_message_id,
			runtime_session_id: stored.runtime_session_id,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedBubble {
	pub message: TranscriptMessage,
	pub block_index: i64,
	pub pinned_at: i64,
}

impl PinnedBubble {
	pub fn of(conversation_id: &str, stored: messages::StoredPin) -> Self {
		Self {
			message: TranscriptMessage::of(conversation_id, stored.message),
			block_index: stored.block_index,
			pinned_at: stored.pinned_at,
		}
	}
}

const EXCERPT_LIMIT: usize = 280;

pub(super) fn message_uri(conversation_id: &str, message_id: &str) -> String {
	format!("opennest://c/{conversation_id}/m/{message_id}")
}

fn excerpt_of(content: &str) -> String {
	if content.chars().count() <= EXCERPT_LIMIT {
		return content.to_owned();
	}
	let kept: String = content.chars().take(EXCERPT_LIMIT - 1).collect();
	format!("{kept}\u{2026}")
}

pub struct MessageRun {
	pub runtime_session_id: Option<String>,
	pub provider_session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageReference {
	pub uri: String,
	pub conversation_id: String,
	pub message_id: String,
	pub role: TranscriptRole,
	pub seq: i64,
	pub created_at: i64,
	pub excerpt: String,
	pub runtime_session_id: Option<String>,
	pub provider_session_id: Option<String>,
}

impl MessageReference {
	pub fn of(conversation_id: String, stored: messages::StoredMessage, run: MessageRun) -> Self {
		Self {
			uri: message_uri(&conversation_id, &stored.id),
			conversation_id,
			message_id: stored.id,
			role: stored.role.into(),
			seq: stored.seq,
			created_at: stored.created_at,
			excerpt: excerpt_of(&stored.content),
			runtime_session_id: run.runtime_session_id,
			provider_session_id: run.provider_session_id,
		}
	}
}

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
	StaleWrite,
	#[serde(rename_all = "camelCase")]
	Sqlite {
		detail: String,
	},
}

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TranscriptStoreError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Conflict { id: String, field: String },
	#[serde(rename_all = "camelCase")]
	InvalidTransition { id: String, from: String, to: String },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownMessage { id: String },
	#[serde(rename_all = "camelCase")]
	RejectedAvatarImage { reason: AvatarRejection },
	#[serde(rename_all = "camelCase")]
	UnwritableBundle { detail: String },
	#[serde(rename_all = "camelCase")]
	SystemSkill { id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableHistory { detail: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AvatarRejection {
	UnknownFormat,
	#[serde(rename_all = "camelCase")]
	TooLarge { bytes: u64, limit: u64 },
	#[serde(rename_all = "camelCase")]
	Undecodable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}

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
			messages::TranscriptError::UnknownMessage { id } => {
				TranscriptStoreError::UnknownMessage { id }
			}
			messages::TranscriptError::Database(failure) => {
				TranscriptStoreError::Storage { failure: (&failure).into() }
			}
		}
	}
}

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
			replied_to_message_id: Some("m0".into()),
			runtime_session_id: Some("run-1".into()),
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
			"createdAt": 2,
			"repliedToMessageId": "m0",
			"runtimeSessionId": "run-1"
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
				avatar_blot: Some(AvatarBlot::Red),
				avatar_image_path: Some("/pictures/owl.png".into()),
				working_dir: Some("/work/opennest".into()),
				instructions: "Answer briefly.".into(),
				memory: "They bake on Sundays.".into(),
				denied_tools: vec![
					"Bash".into(),
					"Edit".into(),
					"NotebookEdit".into(),
					"Write".into(),
				],
				changes_nothing: true,
				output_style: "Concise".into(),
				created_at: 1,
			},
			json!({
				"id": "default",
				"name": "Claude",
				"title": "Reviewer",
				"model": "opus",
				"avatarAnimal": "owl",
				"avatarBlot": "red",
				"avatarImagePath": "/pictures/owl.png",
				"workingDir": "/work/opennest",
				"instructions": "Answer briefly.",
				"memory": "They bake on Sundays.",
				"deniedTools": ["Bash", "Edit", "NotebookEdit", "Write"],
				"changesNothing": true,
				"outputStyle": "Concise",
				"createdAt": 1
			}),
		);
		assert_crosses_as(
			Chat { id: "c1".into(), created_at: 1, updated_at: 2 },
			json!({ "id": "c1", "createdAt": 1, "updatedAt": 2 }),
		);
	}

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
				denied_tools: Vec::new(),
				output_style: "Concise".into(),
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
				"deniedTools": [],
				"outputStyle": "Concise"
			}),
		);
	}

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
			(AvatarBlot::Red, "red"),
			(AvatarBlot::Yellow, "yellow"),
			(AvatarBlot::Green, "green"),
			(AvatarBlot::Cyan, "cyan"),
			(AvatarBlot::Blue, "blue"),
			(AvatarBlot::Purple, "purple"),
			(AvatarBlot::Pink, "pink"),
			(AvatarBlot::Orange, "orange"),
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
			"changesNothing": true,
			"deniedTools": []
		});

		let parsed = serde_json::from_value::<BotIdentity>(submitted).expect("the identity parses");

		assert_eq!(parsed.avatar_blot, None, "a pose reached the mark it is not");
		assert!(parsed.denied_tools.is_empty(), "a switch reached the list it is not");
	}

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
				TranscriptStoreError::SystemSkill { id: "learn".into() },
				json!({ "kind": "systemSkill", "id": "learn" }),
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
			denied_tools: Vec::new(),
			created_at: 1,
		}
	}

	fn a_bundle_root(name: &str) -> std::path::PathBuf {
		let root = std::env::temp_dir().join(format!("opennest-contract-{name}"));
		let _ = std::fs::remove_dir_all(&root);
		root
	}

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

	#[test]
	fn a_bot_is_reported_on_the_model_its_bundle_names() {
		let root = a_bundle_root("model");
		crate::bundles::write(&root, &a_stored_bot("haiku")).expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).model, "haiku");
		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, None).model, "sonnet");

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_is_reported_on_the_style_its_bundle_names() {
		let root = a_bundle_root("style");
		crate::bundles::write_styled(&root, &a_stored_bot("sonnet"), "default")
			.expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).output_style, "default");
		assert_eq!(
			Bot::of(a_stored_bot("sonnet"), None, None).output_style,
			default_output_style()
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_is_reported_on_the_tint_its_bundle_names() {
		let root = a_bundle_root("tint");
		let marked = conversations::Bot {
			avatar_blot: Some(conversations::AvatarBlot::Purple),
			..a_stored_bot("sonnet")
		};
		crate::bundles::write(&root, &marked).expect("the bundle is written");
		let stored_pink = || conversations::Bot {
			avatar_blot: Some(conversations::AvatarBlot::Pink),
			..a_stored_bot("sonnet")
		};

		assert_eq!(Bot::of(stored_pink(), None, Some(&root)).avatar_blot, Some(AvatarBlot::Purple));
		assert_eq!(Bot::of(stored_pink(), None, None).avatar_blot, Some(AvatarBlot::Pink));

		crate::bundles::write(&root, &a_stored_bot("sonnet")).expect("the bundle is rewritten");
		assert_eq!(Bot::of(stored_pink(), None, Some(&root)).avatar_blot, None);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_carries_the_memory_its_block_holds_and_the_one_stored_when_the_block_is_empty() {
		let root = a_bundle_root("memory");
		let learned =
			|| conversations::Bot { memory: "They use bun.".into(), ..a_stored_bot("sonnet") };
		crate::bundles::write(&root, &learned()).expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).memory, "They use bun.");
		assert_eq!(Bot::of(learned(), None, None).memory, "They use bun.");

		crate::bundles::write_remembered(&root, &learned(), "").expect("the memory is cleared");
		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).memory, "");

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_brief_ending_in_a_space_crosses_as_the_reader_typed_it() {
		let root = a_bundle_root("still-typing");
		let typed = conversations::Bot { instructions: "Parles ".into(), ..a_stored_bot("sonnet") };
		crate::bundles::write(&root, &typed).expect("the bundle is written");

		assert_eq!(Bot::of(typed, None, Some(&root)).instructions, "Parles ");

		let _ = std::fs::remove_dir_all(&root);
	}

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
