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
//! It is also why the mirror is written by hand. The storage vocabularies convert
//! themselves to SQLite through helpers that are private to their module, so the
//! conversions below `match` on the public variants: a variant added to either
//! side stops compiling here instead of quietly crossing under a word the
//! frontend has no meaning for.
//!
//! Nothing here carries what a conversation said except
//! [`TranscriptMessage::content`], which is the transcript itself and the whole
//! reason a page was asked for. The `detail` of [`StorageFailure::Sqlite`] is
//! SQLite's own account of a statement — a constraint, a column, a schema — and
//! never a row's content: a transcript is personal data, and an error on its way
//! to the UI is the last place it may leak into.

use serde::{Deserialize, Serialize};

use crate::db::repositories::{conversations, messages};
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
	pub id: String,
	pub name: String,
	pub model: String,
	pub created_at: i64,
}

impl From<conversations::Bot> for Bot {
	fn from(bot: conversations::Bot) -> Self {
		Self { id: bot.id, name: bot.name, model: bot.model, created_at: bot.created_at }
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

/// `messages` in display order, oldest first. `has_more` stands in for the
/// cursor [`messages::MessagePage`] offers: the frontend asks for the page before
/// the one it holds by the lowest `seq` it already has, so the cursor would be a
/// second copy of a number already in `messages`, and the one thing that cannot
/// be read off the page is whether anything older is there at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPage {
	pub conversation_id: String,
	pub messages: Vec<TranscriptMessage>,
	pub has_more: bool,
}

impl TranscriptPage {
	pub fn of(conversation_id: String, page: messages::MessagePage) -> Self {
		let has_more = page.next_before_seq.is_some();
		let messages = page
			.messages
			.into_iter()
			.map(|stored| TranscriptMessage::of(&conversation_id, stored))
			.collect();
		Self { conversation_id, messages, has_more }
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
	#[serde(rename_all = "camelCase")]
	IdentityConflict { id: String, field: String, expected: String, stored: String },
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

impl From<conversations::ConversationError> for TranscriptStoreError {
	fn from(error: conversations::ConversationError) -> Self {
		match error {
			conversations::ConversationError::IdentityConflict { id, field, expected, stored } => {
				TranscriptStoreError::IdentityConflict {
					id: id.to_owned(),
					field: field.to_owned(),
					expected,
					stored,
				}
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
				model: "sonnet".into(),
				created_at: 1,
			},
			json!({ "id": "default", "name": "Claude", "model": "sonnet", "createdAt": 1 }),
		);
		assert_crosses_as(
			Chat { id: "c1".into(), created_at: 1, updated_at: 2 },
			json!({ "id": "c1", "createdAt": 1, "updatedAt": 2 }),
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
				TranscriptStoreError::IdentityConflict {
					id: "default".into(),
					field: "name".into(),
					expected: "Claude".into(),
					stored: "Someone else".into(),
				},
				json!({
					"kind": "identityConflict",
					"id": "default",
					"field": "name",
					"expected": "Claude",
					"stored": "Someone else"
				}),
			),
		] {
			assert_crosses_as(refusal, wire);
		}
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
