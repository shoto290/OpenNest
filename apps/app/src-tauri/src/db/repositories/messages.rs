//! Reads and writes a transcript: `turns`, `messages` and `activities`.
//!
//! Nothing here rewrites history. A row is appended, a stream is concatenated
//! onto the row it belongs to, and a state moves once — forward, into the ending
//! it reached. That is what makes an exact replay harmless: the caller of a turn
//! is an event loop that may be handed the same event twice, and the id it
//! supplies is the whole reason the second one costs nothing.
//!
//! An id that comes back carrying something else is not a replay, though. It is
//! two different things claiming one place, so an append reads the stored row and
//! compares it inside the transaction that would have written it, and answers a
//! conflict rather than a place. A second, different ending reported for a
//! message that has already ended is refused the same way: the two disagree about
//! what happened, and dropping one of them silently is how a transcript stops
//! matching what the reader saw.
//!
//! For that comparison to mean anything, a message is written the way it actually
//! comes into being, and the two ways are not one. A reply is opened with no text
//! and grows a delta at a time; a message authored here is whole the moment it
//! exists and never streams. So a reply's creation carries no text at all, and an
//! authored message's text is the one it keeps for life — which is what leaves
//! every field a replay submits comparable exactly, with nothing left to guess at.
//!
//! The place a row takes is allocated here rather than by the caller. `seq` is
//! `MAX + 1` inside the insert it stands for, so the order a transcript comes
//! back in is decided by the database that holds it and not by a writer guessing
//! what the file already contains — two rows written in the same millisecond
//! included.
//!
//! Reads are paged from the newest backwards, because that is the end a long
//! conversation is opened at, and handed back the other way round: the caller
//! reads a page in the order it displays it. The cursor is the lowest `seq` a
//! page held, and it is exclusive, so the page after it starts exactly where the
//! last one stopped.
//!
//! An id no row answers to is a silent `Ok` rather than a refusal — in
//! `complete_turn`, `append_text`, `finalize_message` and the two activity
//! transitions alike — because a state that is not on the record has nothing to
//! move and nothing to disagree with.
//!
//! The vocabularies below are this file's own, deliberately apart from the
//! same-named types in [`crate::claude::contract`]: what crosses to a model and
//! to the frontend may change without rewriting rows already on disk.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};

use crate::db::{Access, DatabaseError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
	User,
	Assistant,
}

impl MessageRole {
	fn as_sql(self) -> &'static str {
		match self {
			MessageRole::User => "user",
			MessageRole::Assistant => "assistant",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"user" => Some(MessageRole::User),
			"assistant" => Some(MessageRole::Assistant),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageState {
	Pending,
	Streaming,
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl MessageState {
	fn as_sql(self) -> &'static str {
		match self {
			MessageState::Pending => "pending",
			MessageState::Streaming => "streaming",
			MessageState::Complete => "complete",
			MessageState::Cancelled => "cancelled",
			MessageState::Failed => "failed",
			MessageState::Interrupted => "interrupted",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"pending" => Some(MessageState::Pending),
			"streaming" => Some(MessageState::Streaming),
			"complete" => Some(MessageState::Complete),
			"cancelled" => Some(MessageState::Cancelled),
			"failed" => Some(MessageState::Failed),
			"interrupted" => Some(MessageState::Interrupted),
			_ => None,
		}
	}
}

/// The endings on their own, and the only thing
/// [`MessagesRepository::finalize_message`] will take. `Pending` and `Streaming`
/// are absent rather than refused: reopening a message is not a call this
/// vocabulary can express, so the compiler holds that half of the rule and no
/// run of the code can.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalState {
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<TerminalState> for MessageState {
	fn from(state: TerminalState) -> Self {
		match state {
			TerminalState::Complete => MessageState::Complete,
			TerminalState::Cancelled => MessageState::Cancelled,
			TerminalState::Failed => MessageState::Failed,
			TerminalState::Interrupted => MessageState::Interrupted,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityStatus {
	Pending,
	Running,
	Succeeded,
	Failed,
	Terminated,
}

impl ActivityStatus {
	fn as_sql(self) -> &'static str {
		match self {
			ActivityStatus::Pending => "pending",
			ActivityStatus::Running => "running",
			ActivityStatus::Succeeded => "succeeded",
			ActivityStatus::Failed => "failed",
			ActivityStatus::Terminated => "terminated",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"pending" => Some(ActivityStatus::Pending),
			"running" => Some(ActivityStatus::Running),
			"succeeded" => Some(ActivityStatus::Succeeded),
			"failed" => Some(ActivityStatus::Failed),
			"terminated" => Some(ActivityStatus::Terminated),
			_ => None,
		}
	}
}

/// The open statuses on their own, and the only thing
/// [`MessagesRepository::append_activity`] will take. A step is appended open and
/// ends through [`MessagesRepository::finish_activity`], so a step that has
/// already ended cannot be claimed to have been written that way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InitialStatus {
	Pending,
	Running,
}

impl From<InitialStatus> for ActivityStatus {
	fn from(status: InitialStatus) -> Self {
		match status {
			InitialStatus::Pending => ActivityStatus::Pending,
			InitialStatus::Running => ActivityStatus::Running,
		}
	}
}

/// The endings of a step on their own, and the only thing
/// [`MessagesRepository::finish_activity`] will take. `Pending` and `Running` are
/// absent rather than refused: a step going back to pending, or starting twice,
/// is not a call this vocabulary can express, so the compiler holds that half of
/// the rule and no run of the code can.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalStatus {
	Succeeded,
	Failed,
	Terminated,
}

impl From<TerminalStatus> for ActivityStatus {
	fn from(status: TerminalStatus) -> Self {
		match status {
			TerminalStatus::Succeeded => ActivityStatus::Succeeded,
			TerminalStatus::Failed => ActivityStatus::Failed,
			TerminalStatus::Terminated => ActivityStatus::Terminated,
		}
	}
}

/// The vocabularies above are what crosses to SQLite and back, so the conversion
/// lives on the type rather than at each call site: a column holding a word this
/// build has no meaning for fails the read instead of reaching a `match`.
macro_rules! stored_as_text {
	($name:ident) => {
		impl ToSql for $name {
			fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
				Ok(ToSqlOutput::from(self.as_sql()))
			}
		}

		impl FromSql for $name {
			fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
				$name::parse(value.as_str()?).ok_or(FromSqlError::InvalidType)
			}
		}
	};
}

stored_as_text!(MessageRole);
stored_as_text!(MessageState);
stored_as_text!(ActivityStatus);

/// Reachable across `db` so a sibling repository spelling its own vocabulary
/// reaches SQLite through the same conversion rather than a second copy of it.
pub(in crate::db) use stored_as_text;

/// Why a write the transcript could not take was refused. Kept apart from
/// [`DatabaseError`], which says why the file is unusable: these two say the file
/// is fine and the caller is holding two versions of one event.
#[derive(Debug)]
pub enum TranscriptError {
	/// An id already on the record, appended again describing something else.
	/// `field` is the first one that diverged.
	Conflict {
		id: String,
		field: &'static str,
	},
	/// A state the row is not allowed to move to from the one it holds.
	InvalidTransition {
		id: String,
		from: &'static str,
		to: &'static str,
	},
	Database(DatabaseError),
}

impl From<DatabaseError> for TranscriptError {
	fn from(error: DatabaseError) -> Self {
		TranscriptError::Database(error)
	}
}

impl From<rusqlite::Error> for TranscriptError {
	fn from(error: rusqlite::Error) -> Self {
		TranscriptError::Database(error.into())
	}
}

pub struct NewTurn {
	pub id: String,
	pub conversation_id: String,
	pub started_at: i64,
}

/// A reply about to be streamed into. It has no content field: the host learns
/// the id of an assistant message before a single word of it exists, so the row
/// is created empty and every word reaches it through
/// [`MessagesRepository::append_text`].
pub struct NewAssistantMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub created_at: i64,
}

/// A message authored here, whole. It is written complete in one go, so nothing
/// is ever appended to it afterwards.
pub struct NewUserMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub content: String,
	pub created_at: i64,
}

/// A message as the file holds it. No `conversation_id`: it is read one
/// conversation at a time, by a caller that named which.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredMessage {
	pub id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub seq: i64,
	pub role: MessageRole,
	pub content: String,
	pub state: MessageState,
	pub created_at: i64,
}

/// `before_seq` is exclusive and `None` on the first page: the page it asks for
/// is the newest `limit` messages of the conversation.
pub struct MessagePageQuery {
	pub conversation_id: String,
	pub before_seq: Option<i64>,
	pub limit: u32,
}

/// `messages` in display order, oldest first. `has_more` says whether anything
/// older than this page is on file, which is the one thing a caller cannot read off
/// the page it holds: it names the next page by the lowest `seq` of this one, so the
/// store hands out no cursor of its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessagePage {
	pub messages: Vec<StoredMessage>,
	pub has_more: bool,
}

/// A stretch of one conversation, bounded at both ends and by a count. Both bounds
/// are exclusive: `after_seq` is the last message something else already stands for
/// — a checkpoint's summary — and `before_seq` is the message the window is being
/// built for, which is never part of its own context.
///
/// `limit` keeps the newest rows of that stretch, so what comes back is bounded by
/// the count however long the stretch is.
pub struct MessageWindowQuery {
	pub conversation_id: String,
	pub after_seq: i64,
	pub before_seq: i64,
	pub limit: u32,
}

pub struct NewActivity {
	pub id: String,
	pub turn_id: String,
	pub kind: String,
	pub status: InitialStatus,
	pub payload: String,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredActivity {
	pub id: String,
	pub kind: String,
	pub status: ActivityStatus,
	pub payload: String,
	pub seq: i64,
	pub created_at: i64,
}

/// What the sweep closed out at launch. Both are zero on a clean shutdown, which
/// is what makes running it on every boot free.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecoveryReport {
	pub interrupted_messages: usize,
	pub terminated_activities: usize,
}

const TURN_KEY: &str = "SELECT seq, conversation_id, started_at FROM turns WHERE id = ?1";
const INSERT_TURN: &str = "INSERT INTO turns (id, conversation_id, seq, started_at)
	VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM turns WHERE conversation_id = ?2), ?3)
	RETURNING seq";
const COMPLETE_TURN: &str =
	"UPDATE turns SET completed_at = ?2 WHERE id = ?1 AND completed_at IS NULL";

/// `content` comes last so a read with nothing to compare it against can stop
/// before it: it is the one column here that holds a whole streamed reply.
const MESSAGE_KEY: &str = "SELECT seq, conversation_id, turn_id, author_bot_id,
		replied_to_message_id, role, created_at, content
	FROM messages WHERE id = ?1";
const MESSAGE_STATE: &str = "SELECT completion_state FROM messages WHERE id = ?1";
const INSERT_MESSAGE: &str = "INSERT INTO messages
	(id, conversation_id, turn_id, author_bot_id, replied_to_message_id, seq, role, content,
		completion_state, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?2),
		?6, ?7, ?8, ?9)
	RETURNING seq";
const APPEND_TEXT: &str =
	"UPDATE messages SET content = content || ?2, completion_state = 'streaming'
	WHERE id = ?1 AND completion_state IN ('pending', 'streaming')";
const FINALIZE_MESSAGE: &str = "UPDATE messages SET completion_state = ?2
	WHERE id = ?1 AND completion_state IN ('pending', 'streaming')";
const MESSAGE_PAGE: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at
	FROM messages WHERE conversation_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3";
const MESSAGE_BY_ID: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at
	FROM messages WHERE conversation_id = ?1 AND id = ?2";
const MESSAGE_WINDOW: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at
	FROM messages WHERE conversation_id = ?1 AND seq > ?2 AND seq < ?3
	ORDER BY seq DESC LIMIT ?4";
const LAST_MESSAGE_SEQ: &str =
	"SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?1";

const ACTIVITY_KEY: &str = "SELECT id, kind, status, payload, seq, created_at, turn_id
	FROM activities WHERE id = ?1";
const ACTIVITY_STATUS: &str = "SELECT status FROM activities WHERE id = ?1";
const INSERT_ACTIVITY: &str = "INSERT INTO activities
	(id, turn_id, kind, status, payload, seq, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM activities WHERE turn_id = ?2), ?6)
	RETURNING seq";
const SET_ACTIVITY_STATUS: &str =
	"UPDATE activities SET status = ?2 WHERE id = ?1 AND status IN ('pending', 'running')";
const ACTIVITIES_OF_TURN: &str = "SELECT id, kind, status, payload, seq, created_at
	FROM activities WHERE turn_id = ?1 ORDER BY seq";

const INTERRUPT_OPEN_MESSAGES: &str = "UPDATE messages SET completion_state = 'interrupted'
	WHERE completion_state IN ('pending', 'streaming')";
const TERMINATE_OPEN_ACTIVITIES: &str = "UPDATE activities SET status = 'terminated'
	WHERE status IN ('pending', 'running')";

pub struct MessagesRepository {
	access: Access,
}

impl MessagesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub async fn start_turn(&self, turn: NewTurn) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_turn(connection, turn))).await?
	}

	pub async fn complete_turn(
		&self,
		id: String,
		completed_at: i64,
	) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.prepare_cached(COMPLETE_TURN)?.execute(params![id, completed_at])?;
				Ok(())
			})
			.await?)
	}

	pub async fn open_assistant_message(
		&self,
		message: NewAssistantMessage,
	) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_message(connection, message.into()))).await?
	}

	pub async fn append_user_message(
		&self,
		message: NewUserMessage,
	) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_message(connection, message.into()))).await?
	}

	/// Runs once per delta, so the statement is taken from the connection's cache
	/// rather than compiled again for every word the host streams.
	pub async fn append_text(&self, id: String, delta: String) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.prepare_cached(APPEND_TEXT)?.execute(params![id, delta])?;
				Ok(())
			})
			.await?)
	}

	pub async fn finalize_message(
		&self,
		id: String,
		state: TerminalState,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(close_message(connection, &id, state))).await?
	}

	pub async fn page_messages(
		&self,
		query: MessagePageQuery,
	) -> Result<MessagePage, TranscriptError> {
		Ok(self
			.call(move |connection| {
				// No cursor is every seq there is: the first page is the one before the end
				// of a sequence that only ever counts up from 1.
				let before_seq = query.before_seq.unwrap_or(i64::MAX);
				let limit = query.limit as usize;
				let mut statement = connection.prepare_cached(MESSAGE_PAGE)?;
				let mut rows = statement.query(params![
					query.conversation_id,
					before_seq,
					i64::from(query.limit) + 1
				])?;
				// A page that filled says nothing about what is behind it — a conversation
				// of exactly `limit` messages fills one and has nothing older — so one row
				// beyond what the caller asked for is asked of SQLite, and its arrival is
				// the only evidence older messages exist. Nothing else is taken from it: the
				// read is newest first, so it is the oldest row of the answer, and decoding
				// it would pull a whole streamed reply off the file only to drop it a line
				// later.
				//
				// Deliberately not `Vec::with_capacity(limit)`: `limit` arrives from the
				// frontend, and reserving from it would let a caller name the size of an
				// allocation. Growing on the rows that are really there is bounded by the
				// conversation.
				let mut messages = Vec::new();
				let mut has_more = false;
				while let Some(row) = rows.next()? {
					if messages.len() == limit {
						has_more = true;
						break;
					}
					messages.push(read_message(row)?);
				}
				messages.reverse();
				Ok(MessagePage { messages, has_more })
			})
			.await?)
	}

	/// One message of one conversation, by the id something else is holding: a reply
	/// names its target, and a context is built for a prompt already on the record.
	/// The conversation is part of the lookup rather than trusted from the id — an id
	/// alone names any row in the file.
	pub async fn message(
		&self,
		conversation_id: String,
		id: String,
	) -> Result<Option<StoredMessage>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(MESSAGE_BY_ID)?
					.query_row(params![conversation_id, id], read_message)
					.optional()?)
			})
			.await?)
	}

	/// The newest messages of a bounded stretch, handed back oldest first. Read
	/// newest first because the bound belongs at the recent end: what a context can
	/// afford to leave out is the beginning of the stretch, never the words just
	/// spoken.
	pub async fn window_messages(
		&self,
		query: MessageWindowQuery,
	) -> Result<Vec<StoredMessage>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(MESSAGE_WINDOW)?;
				let mut messages = statement
					.query_map(
						params![
							query.conversation_id,
							query.after_seq,
							query.before_seq,
							query.limit
						],
						read_message,
					)?
					.collect::<Result<Vec<_>, _>>()?;
				messages.reverse();
				Ok(messages)
			})
			.await?)
	}

	/// How far the transcript reaches, in the one order that counts. Zero for a
	/// conversation with nothing in it, which is the same number a participant with
	/// no checkpoint resumes from.
	pub async fn last_seq(&self, conversation_id: String) -> Result<i64, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(LAST_MESSAGE_SEQ)?
					.query_row(params![conversation_id], |row| row.get(0))?)
			})
			.await?)
	}

	pub async fn append_activity(&self, activity: NewActivity) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_activity(connection, activity))).await?
	}

	pub async fn start_activity(&self, id: String) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(advance_activity(connection, &id, ActivityStatus::Running))
		})
		.await?
	}

	pub async fn finish_activity(
		&self,
		id: String,
		status: TerminalStatus,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(advance_activity(connection, &id, status.into())))
			.await?
	}

	/// Read apart from the messages of the same turn: a step a turn took is not a
	/// message, and paging the transcript must not have to carry it.
	pub async fn activities_for_turn(
		&self,
		turn_id: String,
	) -> Result<Vec<StoredActivity>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(ACTIVITIES_OF_TURN)?;
				let activities = statement
					.query_map(params![turn_id], read_activity)?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(activities)
			})
			.await?)
	}

	/// The same sweep the launch already ran, for a caller that holds the repository
	/// rather than the opener's connection.
	///
	/// Nothing on the boot path needs it — [`crate::db::Database`] runs the sweep
	/// itself, while the connection is still nobody's but the opener's. It belongs to
	/// a launch and not to a session: run while a turn is live it would close out the
	/// reply that turn is streaming.
	pub async fn recover_unfinished(&self) -> Result<RecoveryReport, TranscriptError> {
		Ok(self.call_mut(sweep_unfinished).await?)
	}
}

/// What a host that died under a turn left behind, closed out at the next launch.
/// A message keeps the text it had streamed so far — the point of `interrupted` is
/// that a reader can be told the stream stopped without losing what came before it
/// — and a step nobody is running any more is `terminated` rather than failed,
/// because nothing observed it fail.
///
/// Takes a plain connection so the launch can run it on the opener's own, before
/// [`Access`] exists and before a command can read a row: a reply the host died
/// under is already `interrupted` on disk by the time anything asks for the page it
/// sits in.
///
/// Both statements are one transaction, so a transcript is never half swept. Safe on
/// every boot: the two `WHERE` clauses match nothing a previous sweep closed out, so
/// a file with nothing open reports two zeroes and writes nothing.
pub(in crate::db) fn sweep_unfinished(
	connection: &mut Connection,
) -> Result<RecoveryReport, DatabaseError> {
	let transaction = write_transaction(connection)?;
	let interrupted_messages = transaction.execute(INTERRUPT_OPEN_MESSAGES, [])?;
	let terminated_activities = transaction.execute(TERMINATE_OPEN_ACTIVITIES, [])?;
	transaction.commit()?;
	Ok(RecoveryReport { interrupted_messages, terminated_activities })
}

/// The stored side of a turn's identity, read before an append answers. Every
/// column here is written once and never updated, so an append that describes
/// any of them differently is describing another turn.
struct StoredTurnKey {
	seq: i64,
	conversation_id: String,
	started_at: i64,
}

impl StoredTurnKey {
	fn diverging_field(&self, turn: &NewTurn) -> Option<&'static str> {
		if self.conversation_id != turn.conversation_id {
			return Some("conversation_id");
		}
		if self.started_at != turn.started_at {
			return Some("started_at");
		}
		None
	}
}

/// A message resolved to the row it will be inserted as, whichever of the two
/// paths it arrived by. `role` and the presence of `content` are decided here
/// rather than submitted, which is what stops either from being part of what a
/// caller could get wrong twice.
struct AppendedMessage {
	id: String,
	conversation_id: String,
	turn_id: String,
	author_bot_id: Option<String>,
	replied_to_message_id: Option<String>,
	role: MessageRole,
	/// `None` on the assistant path: the row is created empty there, so its
	/// creation has no text for a replay to carry or to be checked against, and
	/// the state it is written in follows from that alone.
	content: Option<String>,
	created_at: i64,
}

impl From<NewAssistantMessage> for AppendedMessage {
	fn from(message: NewAssistantMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			role: MessageRole::Assistant,
			content: None,
			created_at: message.created_at,
		}
	}
}

impl From<NewUserMessage> for AppendedMessage {
	fn from(message: NewUserMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			role: MessageRole::User,
			content: Some(message.content),
			created_at: message.created_at,
		}
	}
}

struct StoredMessageKey {
	seq: i64,
	conversation_id: String,
	turn_id: String,
	author_bot_id: Option<String>,
	replied_to_message_id: Option<String>,
	role: MessageRole,
	created_at: i64,
	/// Read only when the append it is compared against was authored whole, so it
	/// is `Some` exactly when the other side is.
	content: Option<String>,
}

impl StoredMessageKey {
	/// Every field compared here is written once and never updated, so equality is
	/// the whole rule. `completion_state` is absent because no caller states it, and
	/// a reply's text is absent on both sides because it is written after the
	/// creation this compares — it belongs to `append_text`.
	fn diverging_field(&self, message: &AppendedMessage) -> Option<&'static str> {
		if self.conversation_id != message.conversation_id {
			return Some("conversation_id");
		}
		if self.turn_id != message.turn_id {
			return Some("turn_id");
		}
		if self.author_bot_id != message.author_bot_id {
			return Some("author_bot_id");
		}
		if self.replied_to_message_id != message.replied_to_message_id {
			return Some("replied_to_message_id");
		}
		if self.role != message.role {
			return Some("role");
		}
		if self.content != message.content {
			return Some("content");
		}
		if self.created_at != message.created_at {
			return Some("created_at");
		}
		None
	}
}

struct StoredActivityKey {
	stored: StoredActivity,
	turn_id: String,
}

impl StoredActivityKey {
	fn diverging_field(&self, activity: &NewActivity) -> Option<&'static str> {
		if self.turn_id != activity.turn_id {
			return Some("turn_id");
		}
		if self.stored.kind != activity.kind {
			return Some("kind");
		}
		if activity_stage(activity.status.into()) > activity_stage(self.stored.status) {
			return Some("status");
		}
		if self.stored.payload != activity.payload {
			return Some("payload");
		}
		if self.stored.created_at != activity.created_at {
			return Some("created_at");
		}
		None
	}
}

/// How far along its life a step is: `pending` before `running`, `running` before
/// any ending. A step only ever moves up this order, and a replay is allowed to be
/// behind what the row now holds — that is what a second copy of an event looks
/// like once the step has run — but never ahead of it.
fn activity_stage(status: ActivityStatus) -> u8 {
	match status {
		ActivityStatus::Pending => 0,
		ActivityStatus::Running => 1,
		ActivityStatus::Succeeded | ActivityStatus::Failed | ActivityStatus::Terminated => 2,
	}
}

fn store_turn(connection: &mut Connection, turn: NewTurn) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(stored) = stored_turn_key(&transaction, &turn.id)? {
		if let Some(field) = stored.diverging_field(&turn) {
			return Err(TranscriptError::Conflict { id: turn.id, field });
		}
		return Ok(stored.seq);
	}
	let seq = transaction.query_row(
		INSERT_TURN,
		params![turn.id, turn.conversation_id, turn.started_at],
		|row| row.get(0),
	)?;
	transaction.commit()?;
	Ok(seq)
}

fn store_message(
	connection: &mut Connection,
	message: AppendedMessage,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(stored) = stored_message_key(&transaction, &message)? {
		if let Some(field) = stored.diverging_field(&message) {
			return Err(TranscriptError::Conflict { id: message.id, field });
		}
		return Ok(stored.seq);
	}
	let (content, state) = match message.content {
		Some(authored) => (authored, MessageState::Complete),
		None => (String::new(), MessageState::Pending),
	};
	let seq = transaction.query_row(
		INSERT_MESSAGE,
		params![
			message.id,
			message.conversation_id,
			message.turn_id,
			message.author_bot_id,
			message.replied_to_message_id,
			message.role,
			content,
			state,
			message.created_at,
		],
		|row| row.get(0),
	)?;
	transaction.commit()?;
	Ok(seq)
}

fn store_activity(
	connection: &mut Connection,
	activity: NewActivity,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(key) = stored_activity_key(&transaction, &activity.id)? {
		if let Some(field) = key.diverging_field(&activity) {
			return Err(TranscriptError::Conflict { id: activity.id, field });
		}
		return Ok(key.stored.seq);
	}
	let seq = transaction.query_row(
		INSERT_ACTIVITY,
		params![
			activity.id,
			activity.turn_id,
			activity.kind,
			ActivityStatus::from(activity.status),
			activity.payload,
			activity.created_at,
		],
		|row| row.get(0),
	)?;
	transaction.commit()?;
	Ok(seq)
}

fn close_message(
	connection: &mut Connection,
	id: &str,
	state: TerminalState,
) -> Result<(), TranscriptError> {
	let target = MessageState::from(state);
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state::<MessageState>(&transaction, MESSAGE_STATE, id)? {
		if current != target {
			if !matches!(current, MessageState::Pending | MessageState::Streaming) {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: target.as_sql(),
				});
			}
			transaction.execute(FINALIZE_MESSAGE, params![id, target])?;
		}
	}
	transaction.commit()?;
	Ok(())
}

fn advance_activity(
	connection: &mut Connection,
	id: &str,
	target: ActivityStatus,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state::<ActivityStatus>(&transaction, ACTIVITY_STATUS, id)? {
		if current != target {
			if activity_stage(target) <= activity_stage(current) {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: target.as_sql(),
				});
			}
			transaction.execute(SET_ACTIVITY_STATUS, params![id, target])?;
		}
	}
	transaction.commit()?;
	Ok(())
}

/// Immediate rather than deferred: an append reads the place it is about to take
/// a statement before it takes it, and a deferred transaction only claims the
/// file at that insert — two writers would both read the same `MAX` and the
/// second would be refused after having already decided where it belonged.
/// Claiming the file at `BEGIN` is what makes reading the stored row, allocating
/// and inserting one step.
fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn stored_turn_key(
	transaction: &Transaction<'_>,
	id: &str,
) -> Result<Option<StoredTurnKey>, DatabaseError> {
	Ok(transaction
		.query_row(TURN_KEY, params![id], |row| {
			Ok(StoredTurnKey {
				seq: row.get(0)?,
				conversation_id: row.get(1)?,
				started_at: row.get(2)?,
			})
		})
		.optional()?)
}

fn stored_message_key(
	transaction: &Transaction<'_>,
	message: &AppendedMessage,
) -> Result<Option<StoredMessageKey>, DatabaseError> {
	Ok(transaction
		.query_row(MESSAGE_KEY, params![message.id], |row| {
			Ok(StoredMessageKey {
				seq: row.get(0)?,
				conversation_id: row.get(1)?,
				turn_id: row.get(2)?,
				author_bot_id: row.get(3)?,
				replied_to_message_id: row.get(4)?,
				role: row.get(5)?,
				created_at: row.get(6)?,
				content: message.content.is_some().then(|| row.get(7)).transpose()?,
			})
		})
		.optional()?)
}

fn stored_activity_key(
	transaction: &Transaction<'_>,
	id: &str,
) -> Result<Option<StoredActivityKey>, DatabaseError> {
	Ok(transaction
		.query_row(ACTIVITY_KEY, params![id], |row| {
			Ok(StoredActivityKey { stored: read_activity(row)?, turn_id: row.get(6)? })
		})
		.optional()?)
}

fn stored_state<T: FromSql>(
	transaction: &Transaction<'_>,
	query: &str,
	id: &str,
) -> Result<Option<T>, DatabaseError> {
	Ok(transaction.query_row(query, params![id], |row| row.get(0)).optional()?)
}

fn read_message(row: &Row<'_>) -> rusqlite::Result<StoredMessage> {
	Ok(StoredMessage {
		id: row.get(0)?,
		turn_id: row.get(1)?,
		author_bot_id: row.get(2)?,
		replied_to_message_id: row.get(3)?,
		seq: row.get(4)?,
		role: row.get(5)?,
		content: row.get(6)?,
		state: row.get(7)?,
		created_at: row.get(8)?,
	})
}

fn read_activity(row: &Row<'_>) -> rusqlite::Result<StoredActivity> {
	Ok(StoredActivity {
		id: row.get(0)?,
		kind: row.get(1)?,
		status: row.get(2)?,
		payload: row.get(3)?,
		seq: row.get(4)?,
		created_at: row.get(5)?,
	})
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	/// Two conversations and a bot taking part in both: the second one is what a
	/// reference reaching across has to be refused for, and the participant rows
	/// are what lets a message name an author at all.
	const FIXTURE: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1), ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
			VALUES ('c1', 'b1', 'assistant', 1), ('c2', 'b1', 'assistant', 1);
	";

	/// Long enough that the paging below crosses several boundaries, and not a
	/// multiple of the page size, so the last page is a short one.
	const LONG_CONVERSATION: usize = 205;
	const PAGE: u32 = 50;

	const ENDINGS: [TerminalState; 4] = [
		TerminalState::Complete,
		TerminalState::Cancelled,
		TerminalState::Failed,
		TerminalState::Interrupted,
	];
	const TERMINATIONS: [TerminalStatus; 3] =
		[TerminalStatus::Succeeded, TerminalStatus::Failed, TerminalStatus::Terminated];

	async fn seeded(dir: &Path) -> Database {
		let database = open(dir);
		database
			.call(|connection| Ok(connection.execute_batch(FIXTURE)?))
			.await
			.expect("the fixture is inserted");
		database
	}

	async fn a_turn(database: &Database, id: &str, conversation: &str) -> i64 {
		database
			.messages()
			.start_turn(NewTurn {
				id: id.into(),
				conversation_id: conversation.into(),
				started_at: 1,
			})
			.await
			.expect("the turn is started")
	}

	/// The transcript a paging test needs before it can page: `count` user messages
	/// on `t1` of `c1`, told apart by their ids alone.
	async fn some_user_messages(database: &Database, count: usize) {
		for index in 0..count {
			database
				.messages()
				.append_user_message(a_user_message(&format!("m{index}"), "hello", 1))
				.await
				.expect("the message is appended");
		}
	}

	fn a_user_message(id: &str, content: &str, created_at: i64) -> NewUserMessage {
		NewUserMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: None,
			replied_to_message_id: None,
			content: content.into(),
			created_at,
		}
	}

	fn a_reply(id: &str, replied_to: Option<&str>) -> NewAssistantMessage {
		NewAssistantMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: Some("b1".into()),
			replied_to_message_id: replied_to.map(Into::into),
			created_at: 2,
		}
	}

	fn an_activity(id: &str, status: InitialStatus) -> NewActivity {
		NewActivity {
			id: id.into(),
			turn_id: "t1".into(),
			kind: "tool".into(),
			status,
			payload: "{}".into(),
			created_at: 2,
		}
	}

	async fn page(database: &Database, before_seq: Option<i64>, limit: u32) -> MessagePage {
		database
			.messages()
			.page_messages(MessagePageQuery { conversation_id: "c1".into(), before_seq, limit })
			.await
			.expect("the page is read")
	}

	/// Walks the whole transcript the way a caller would: newest page first, each one
	/// prepended to what is already known, the next asked for by the lowest `seq` the
	/// last one held. It stops on a page that says nothing is older, and on a page that
	/// came back empty — there is no `seq` in one of those to ask the next by.
	async fn whole_transcript(database: &Database, limit: u32) -> Vec<StoredMessage> {
		let mut collected: Vec<StoredMessage> = Vec::new();
		let mut before_seq = None;
		loop {
			let page = page(database, before_seq, limit).await;
			let oldest_held = oldest_seq(&page);
			let has_more = page.has_more;
			collected.splice(0..0, page.messages);
			match oldest_held {
				Some(seq) if has_more => before_seq = Some(seq),
				_ => return collected,
			}
		}
	}

	/// What the frontend's own `selectOldestSeq` works out, and the only cursor there
	/// is: the page names the one before it by the lowest `seq` it holds.
	fn oldest_seq(page: &MessagePage) -> Option<i64> {
		page.messages.first().map(|message| message.seq)
	}

	fn seqs(messages: &[StoredMessage]) -> Vec<i64> {
		messages.iter().map(|message| message.seq).collect()
	}

	fn states(messages: &[StoredMessage]) -> Vec<MessageState> {
		messages.iter().map(|message| message.state).collect()
	}

	async fn statuses(database: &Database) -> Vec<ActivityStatus> {
		database
			.messages()
			.activities_for_turn("t1".into())
			.await
			.expect("the activities")
			.iter()
			.map(|activity| activity.status)
			.collect()
	}

	/// Every column of a message as the file holds it, `conversation_id` and
	/// `completion_state` included — what [`StoredMessage`] leaves out, and what a
	/// refused replay has to have left byte for byte where it was.
	#[derive(Debug, Clone, PartialEq, Eq)]
	struct StoredRow {
		id: String,
		conversation_id: String,
		turn_id: String,
		author_bot_id: Option<String>,
		replied_to_message_id: Option<String>,
		seq: i64,
		role: String,
		content: String,
		completion_state: String,
		created_at: i64,
	}

	async fn stored_row(database: &Database, id: &'static str) -> StoredRow {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT id, conversation_id, turn_id, author_bot_id, replied_to_message_id,
						seq, role, content, completion_state, created_at
					FROM messages WHERE id = ?1",
					params![id],
					|row| {
						Ok(StoredRow {
							id: row.get(0)?,
							conversation_id: row.get(1)?,
							turn_id: row.get(2)?,
							author_bot_id: row.get(3)?,
							replied_to_message_id: row.get(4)?,
							seq: row.get(5)?,
							role: row.get(6)?,
							content: row.get(7)?,
							completion_state: row.get(8)?,
							created_at: row.get(9)?,
						})
					},
				)?)
			})
			.await
			.expect("the message row is read")
	}

	/// What a turn holds, which no read of this repository hands back on its own:
	/// what a refused replay must have left untouched.
	async fn stored_turn(database: &Database, id: &'static str) -> (String, i64) {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT conversation_id, started_at FROM turns WHERE id = ?1",
					params![id],
					|row| Ok((row.get(0)?, row.get(1)?)),
				)?)
			})
			.await
			.expect("the turn is read")
	}

	fn assert_conflict(refused: &Result<i64, TranscriptError>, id: &str, field: &str) {
		assert!(
			matches!(
				refused,
				Err(TranscriptError::Conflict { id: stored, field: diverged })
					if stored == id && *diverged == field
			),
			"expected {id} to be refused as a conflict on {field}: {refused:?}"
		);
	}

	fn assert_rejected(refused: &Result<(), TranscriptError>, from: &str, to: &str) {
		assert!(
			matches!(
				refused,
				Err(TranscriptError::InvalidTransition { from: held, to: asked, .. })
					if *held == from && *asked == to
			),
			"expected the move from {from} to {to} to be refused: {refused:?}"
		);
	}

	/// The read a long-lived chat is opened with: every message has to come back,
	/// once, in the order it was appended, across every boundary the paging draws.
	#[tokio::test]
	async fn a_long_conversation_pages_through_every_message_exactly_once_in_order() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		for index in 0..LONG_CONVERSATION {
			let seq = database
				.messages()
				.append_user_message(a_user_message(
					&format!("m{index}"),
					&format!("line {index}"),
					1,
				))
				.await
				.expect("the message is appended");
			assert_eq!(seq, index as i64 + 1, "the database allocated a place out of order");
		}

		let newest = page(&database, None, PAGE).await;
		let transcript = whole_transcript(&database, PAGE).await;

		assert!(
			newest.messages.windows(2).all(|pair| pair[0].seq < pair[1].seq),
			"a page came back out of display order"
		);
		assert_eq!(transcript.len(), LONG_CONVERSATION, "paging lost or duplicated a message");
		assert_eq!(
			seqs(&transcript),
			(1..=LONG_CONVERSATION as i64).collect::<Vec<_>>(),
			"the pages did not join up into one sequence"
		);
		let ids: Vec<String> = transcript.into_iter().map(|message| message.id).collect();
		assert_eq!(
			ids,
			(0..LONG_CONVERSATION).map(|index| format!("m{index}")).collect::<Vec<_>>(),
			"the transcript came back in another order than it was written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A turn writes faster than the clock it is stamped with, so the timestamp is
	/// not what the order can rest on: the place the database allocated is.
	#[tokio::test]
	async fn messages_stamped_at_the_same_moment_still_come_back_in_the_order_they_were_written() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		for index in 0..5 {
			database
				.messages()
				.append_user_message(a_user_message(
					&format!("m{index}"),
					&format!("line {index}"),
					7,
				))
				.await
				.expect("the message is appended");
		}

		let transcript = whole_transcript(&database, 2).await;

		assert_eq!(seqs(&transcript), vec![1, 2, 3, 4, 5]);
		assert!(
			transcript.iter().all(|message| message.created_at == 7),
			"the fixture did not write one moment"
		);
		assert_eq!(
			transcript.iter().map(|message| message.content.as_str()).collect::<Vec<_>>(),
			vec!["line 0", "line 1", "line 2", "line 3", "line 4"]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A reply is stored as the link it is, and the link is checked: the pair
	/// `(replied_to_message_id, conversation_id)` is what stops a message from
	/// quoting one the reader of this conversation has never seen.
	#[tokio::test]
	async fn a_reply_names_a_message_of_its_own_conversation_and_nothing_else() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_user_message(NewUserMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("elsewhere", "hello", 1)
			})
			.await
			.expect("the other conversation's message is appended");

		database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("a reply inside its own conversation was refused");
		let across =
			database.messages().open_assistant_message(a_reply("m3", Some("elsewhere"))).await;

		assert!(across.is_err(), "a message quoted another conversation's message");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "the refused reply left a row behind");
		assert_eq!(transcript[1].replied_to_message_id.as_deref(), Some("m1"));
		assert_eq!(transcript[1].author_bot_id.as_deref(), Some("b1"));
		assert_eq!(transcript[0].replied_to_message_id, None);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The edges of the cursor, where a gap or a repeat would come from: a page
	/// that fills exactly, the short one after it, and a cursor already past the
	/// oldest message.
	#[tokio::test]
	async fn the_cursor_leaves_no_gap_and_no_duplicate_at_its_edges() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 6).await;

		let newest = page(&database, None, 3).await;
		let older = page(&database, oldest_seq(&newest), 3).await;
		let past_the_start = page(&database, Some(1), 3).await;
		let short = page(&database, Some(3), 4).await;

		assert_eq!(seqs(&newest.messages), vec![4, 5, 6]);
		assert!(newest.has_more, "a full page said there was nothing older");
		assert_eq!(
			seqs(&older.messages),
			vec![1, 2, 3],
			"the second page skipped or repeated a seq"
		);
		assert!(!older.has_more, "the last page promised more because it happened to fill");
		assert!(
			past_the_start.messages.is_empty() && !past_the_start.has_more,
			"a cursor past the oldest message came back with rows or promised more"
		);
		assert_eq!(seqs(&short.messages), vec![1, 2], "a partial page did not stop at the start");
		assert!(!short.has_more, "a partial page promised more");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A conversation of exactly one page, which is what filling to the brim without
	/// anything behind it looks like: the whole transcript comes back in display
	/// order and the walk back ends there, because the row that would have proved
	/// there is more was never there to read.
	#[tokio::test]
	async fn a_conversation_of_exactly_one_page_comes_back_whole_and_offers_no_cursor() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 4).await;

		let only = page(&database, None, 4).await;

		assert_eq!(
			seqs(&only.messages),
			vec![1, 2, 3, 4],
			"a page the size of the conversation came back short or out of display order"
		);
		assert!(
			!only.has_more,
			"a page that filled exactly sent the reader after messages that are not there"
		);
		assert_eq!(
			seqs(&whole_transcript(&database, 4).await),
			vec![1, 2, 3, 4],
			"the walk back over a page that filled exactly lost or repeated a message"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The other side of that boundary, one message further: the row beyond the page
	/// is there this time, so the same full page does offer a cursor, and what it
	/// leads to is the one message left behind it.
	#[tokio::test]
	async fn one_message_more_than_a_page_offers_a_cursor_onto_the_rest() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 5).await;

		let newest = page(&database, None, 4).await;
		let older = page(&database, oldest_seq(&newest), 4).await;

		assert_eq!(
			seqs(&newest.messages),
			vec![2, 3, 4, 5],
			"the first page was not the newest four messages"
		);
		assert!(newest.has_more, "a full page with a message behind it promised nothing older");
		assert_eq!(
			seqs(&older.messages),
			vec![1],
			"the page behind the cursor did not hold the one message left"
		);
		assert!(
			!older.has_more,
			"the page holding the oldest message promised something behind it"
		);
		assert_eq!(
			[seqs(&older.messages), seqs(&newest.messages)].concat(),
			vec![1, 2, 3, 4, 5],
			"the two pages did not join up into the whole transcript in order"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// What a host that died under a turn is owed at the next launch: the stream
	/// is closed out as interrupted with everything it had already written, the
	/// step nobody is running any more is terminated, and what had already ended
	/// is left alone. The second sweep finds nothing, which is what makes it safe
	/// on every boot.
	#[tokio::test]
	async fn a_turn_the_host_died_under_is_closed_out_with_its_partial_text() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m2".into(), "thought".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.append_activity(an_activity("a2", InitialStatus::Running))
			.await
			.expect("the finished activity is appended");
		database
			.messages()
			.finish_activity("a2".into(), TerminalStatus::Succeeded)
			.await
			.expect("the activity ends");

		let report = database.messages().recover_unfinished().await.expect("the sweep runs");
		let again = database.messages().recover_unfinished().await.expect("the sweep runs again");

		assert_eq!(
			report,
			RecoveryReport { interrupted_messages: 1, terminated_activities: 1 },
			"the sweep closed out something other than what was left open"
		);
		assert_eq!(
			again,
			RecoveryReport { interrupted_messages: 0, terminated_activities: 0 },
			"a second sweep rewrote what the first one had already closed out"
		);
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(transcript[1].state, MessageState::Interrupted);
		assert_eq!(transcript[1].content, "half a thought", "the partial text was not kept");
		assert_eq!(transcript[0].state, MessageState::Complete, "a finished message was swept");
		assert_eq!(
			statuses(&database).await,
			vec![ActivityStatus::Terminated, ActivityStatus::Succeeded]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The sweep as a launch actually runs it: nobody asks for it, opening the file is
	/// what closes out the turn a dead host left, and the first thing any command can
	/// read is already honest.
	///
	/// `m2` is the row a frontend that normalises streaming replies in memory can never
	/// repair — the host died between opening the reply and its first delta, so what is
	/// on disk is `pending`, and it would come back `pending` at every launch after.
	/// `m3` is the one that had streamed.
	///
	/// The second relaunch is the same file with nothing left open, and it has to come
	/// back byte for byte: the sweep is on the boot path for the life of the install, so
	/// a launch that rewrote anything would rewrite it every time.
	#[tokio::test]
	async fn opening_the_database_closes_out_what_a_dead_host_left_open() {
		let dir = temp_dir();
		{
			let dying = seeded(&dir).await;
			a_turn(&dying, "t1", "c1").await;
			dying
				.messages()
				.append_user_message(a_user_message("m1", "hello", 1))
				.await
				.expect("the message is appended");
			dying
				.messages()
				.open_assistant_message(a_reply("m2", Some("m1")))
				.await
				.expect("the reply nothing ever streamed into is opened");
			dying
				.messages()
				.open_assistant_message(a_reply("m3", Some("m1")))
				.await
				.expect("the streaming reply is opened");
			dying.messages().append_text("m3".into(), "half a ".into()).await.expect("a delta");
			dying.messages().append_text("m3".into(), "thought".into()).await.expect("a delta");
			dying
				.messages()
				.append_activity(an_activity("a1", InitialStatus::Pending))
				.await
				.expect("the waiting step is appended");
			dying
				.messages()
				.append_activity(an_activity("a2", InitialStatus::Running))
				.await
				.expect("the running step is appended");
			dying
				.messages()
				.append_activity(an_activity("a3", InitialStatus::Running))
				.await
				.expect("the finished step is appended");
			dying
				.messages()
				.finish_activity("a3".into(), TerminalStatus::Succeeded)
				.await
				.expect("the step ends");
		}

		let relaunched = open(&dir);

		let restored = whole_transcript(&relaunched, PAGE).await;
		assert_eq!(
			states(&restored),
			vec![MessageState::Complete, MessageState::Interrupted, MessageState::Interrupted],
			"a launch handed out a reply still recorded as being written"
		);
		assert_eq!(restored[1].content, "", "a reply that never streamed a word gained text");
		assert_eq!(restored[2].content, "half a thought", "the partial text was not kept");
		let restored_activities = statuses(&relaunched).await;
		assert_eq!(
			restored_activities,
			vec![ActivityStatus::Terminated, ActivityStatus::Terminated, ActivityStatus::Succeeded],
			"a step nobody is running any more came back open, or a finished one was swept"
		);
		drop(relaunched);

		let again = open(&dir);

		assert_eq!(
			whole_transcript(&again, PAGE).await,
			restored,
			"a second launch rewrote a transcript that had nothing left open"
		);
		assert_eq!(
			statuses(&again).await,
			restored_activities,
			"a second launch swept a step again"
		);

		drop(again);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The whole point of writing a transcript down: what the next launch reads is
	/// what the last one wrote, activities included.
	#[tokio::test]
	async fn a_transcript_reads_back_identically_after_the_file_is_closed_and_reopened() {
		let dir = temp_dir();
		let (written, activities) = {
			let database = seeded(&dir).await;
			a_turn(&database, "t1", "c1").await;
			database
				.messages()
				.append_user_message(a_user_message("m1", "hello", 1))
				.await
				.expect("the message is appended");
			database
				.messages()
				.open_assistant_message(a_reply("m2", Some("m1")))
				.await
				.expect("the reply is appended");
			database.messages().append_text("m2".into(), "hi there".into()).await.expect("a delta");
			database
				.messages()
				.finalize_message("m2".into(), TerminalState::Complete)
				.await
				.expect("the message is finalized");
			database
				.messages()
				.append_activity(an_activity("a1", InitialStatus::Running))
				.await
				.expect("the activity is appended");
			database
				.messages()
				.finish_activity("a1".into(), TerminalStatus::Succeeded)
				.await
				.expect("the activity ends");
			database.messages().complete_turn("t1".into(), 9).await.expect("the turn ends");
			let written = whole_transcript(&database, PAGE).await;
			let activities =
				database.messages().activities_for_turn("t1".into()).await.expect("the activities");
			(written, activities)
		};

		let reopened = open(&dir);

		assert_eq!(
			whole_transcript(&reopened, PAGE).await,
			written,
			"the transcript came back changed"
		);
		assert_eq!(
			reopened.messages().activities_for_turn("t1".into()).await.expect("the activities"),
			activities
		);
		assert_eq!(written[1].content, "hi there");
		assert_eq!(written[1].state, MessageState::Complete);

		drop(reopened);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The event loop above this may be handed the same event twice, so a replay
	/// has to cost nothing: no second row, no error, and no ending rewritten by
	/// something that happened after it.
	#[tokio::test]
	async fn replaying_a_write_changes_nothing_and_is_not_an_error() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let turn = a_turn(&database, "t1", "c1").await;
		let first = database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.open_assistant_message(a_reply("m2", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "hi".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("the activity is appended");

		let replayed_turn = a_turn(&database, "t1", "c1").await;
		let replayed = database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("a replayed append was refused");
		let replayed_activity = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("a replayed activity was refused");
		for ending in [TerminalState::Complete, TerminalState::Complete] {
			database
				.messages()
				.finalize_message("m2".into(), ending)
				.await
				.expect("a repeated ending was refused");
		}
		database
			.messages()
			.append_text("m2".into(), " and more".into())
			.await
			.expect("a late delta was refused");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("the activity ends");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("a repeated ending was refused");

		assert_eq!(replayed_turn, turn, "a replayed turn took a second place");
		assert_eq!(replayed, first, "a replayed message took a second place");
		assert_eq!(replayed_activity, 1, "a replayed activity took a second place");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "a replay wrote a second row");
		assert_eq!(transcript[0].content, "hello", "a replay rewrote a stored message");
		assert_eq!(transcript[1].state, MessageState::Complete);
		assert_eq!(transcript[1].content, "hi", "a delta after the ending was written anyway");
		assert_eq!(statuses(&database).await, vec![ActivityStatus::Succeeded]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The whole matrix of endings, from both states a message can be written in,
	/// and then pushed at from every ending it must not leave. The other half of
	/// the rule — that no caller can ask for `pending` or `streaming` back — is not
	/// tested here because it cannot be written: `finalize_message` takes a
	/// [`TerminalState`], so the compiler refuses the call.
	#[tokio::test]
	async fn a_message_keeps_the_first_ending_it_reached_and_refuses_every_other_one() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let mut ended: Vec<(String, TerminalState)> = Vec::new();
		for (index, ending) in ENDINGS.into_iter().enumerate() {
			for id in [format!("p{index}"), format!("s{index}")] {
				database
					.messages()
					.open_assistant_message(a_reply(&id, None))
					.await
					.expect("the reply is appended");
				if id.starts_with('s') {
					database
						.messages()
						.append_text(id.clone(), "half a thought".into())
						.await
						.expect("a delta");
				}
				database
					.messages()
					.finalize_message(id.clone(), ending)
					.await
					.expect("an open message refused an ending");
				ended.push((id, ending));
			}
		}

		let mut refusals = Vec::new();
		for (id, ending) in &ended {
			database
				.messages()
				.finalize_message(id.clone(), *ending)
				.await
				.expect("the same ending reported twice was refused");
			for other in ENDINGS.into_iter().filter(|other| other != ending) {
				let refused = database.messages().finalize_message(id.clone(), other).await;
				assert_rejected(
					&refused,
					MessageState::from(*ending).as_sql(),
					MessageState::from(other).as_sql(),
				);
				refusals.push(refused);
			}
		}

		assert_eq!(refusals.len(), ended.len() * 3, "the matrix did not cover every ending");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(
			states(&transcript),
			ended.iter().map(|(_, ending)| MessageState::from(*ending)).collect::<Vec<_>>(),
			"a message did not keep the ending it reached first"
		);
		assert!(
			transcript
				.iter()
				.filter(|message| message.id.starts_with('s'))
				.all(|message| message.content == "half a thought"),
			"a streamed message lost its text when it ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The graph a step walks, then the moves that are not on it: an ending
	/// reopening and an ending becoming another one. The rest of the rule — that no
	/// caller can ask for `pending` back, from a run or from an ending — is not
	/// tested here because it cannot be written: [`MessagesRepository::start_activity`]
	/// takes no status and [`MessagesRepository::finish_activity`] takes a
	/// [`TerminalStatus`], so the compiler refuses the call.
	#[tokio::test]
	async fn an_activity_walks_its_graph_forward_and_refuses_every_other_move() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let mut expected = Vec::new();
		database
			.messages()
			.append_activity(an_activity("walked", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.start_activity("walked".into())
			.await
			.expect("a pending step refused to start running");
		database
			.messages()
			.finish_activity("walked".into(), TerminalStatus::Succeeded)
			.await
			.expect("a running step refused to end");
		expected.push(ActivityStatus::Succeeded);
		for (index, termination) in TERMINATIONS.into_iter().enumerate() {
			for (id, opening) in [
				(format!("p{index}"), InitialStatus::Pending),
				(format!("r{index}"), InitialStatus::Running),
			] {
				database
					.messages()
					.append_activity(an_activity(&id, opening))
					.await
					.expect("the activity is appended");
				database
					.messages()
					.finish_activity(id, termination)
					.await
					.expect("an open step refused to end");
				expected.push(termination.into());
			}
		}
		database
			.messages()
			.append_activity(an_activity("running", InitialStatus::Running))
			.await
			.expect("the activity is appended");
		expected.push(ActivityStatus::Running);

		let reopened = database.messages().start_activity("p0".into()).await;
		let another_ending =
			database.messages().finish_activity("p0".into(), TerminalStatus::Failed).await;
		database
			.messages()
			.finish_activity("p0".into(), TerminalStatus::Succeeded)
			.await
			.expect("the same ending reported twice was refused");

		assert_rejected(&reopened, "succeeded", "running");
		assert_rejected(&another_ending, "succeeded", "failed");
		assert_eq!(statuses(&database).await, expected, "a step moved somewhere it may not go");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// An id that comes back describing something else is not a replay, and the row
	/// that reached the place first is what the reader keeps — whether the second
	/// event disagrees about which row it is or about how that row came to be. The
	/// state a message was created in is not among the fields compared: no caller
	/// states it, so there is nothing to disagree about.
	#[tokio::test]
	async fn an_id_appended_again_describing_something_else_is_refused_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		a_turn(&database, "t3", "c1").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		let before = stored_row(&database, "m1").await;

		let turn_elsewhere = database
			.messages()
			.start_turn(NewTurn { id: "t1".into(), conversation_id: "c2".into(), started_at: 5 })
			.await;
		assert_conflict(&turn_elsewhere, "t1", "conversation_id");
		let another_start = database
			.messages()
			.start_turn(NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 5 })
			.await;
		assert_conflict(&another_start, "t1", "started_at");
		let another_conversation = database
			.messages()
			.append_user_message(NewUserMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_conversation, "m1", "conversation_id");
		let another_turn = database
			.messages()
			.append_user_message(NewUserMessage {
				turn_id: "t3".into(),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_turn, "m1", "turn_id");
		let another_author = database
			.messages()
			.append_user_message(NewUserMessage {
				author_bot_id: Some("b1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_author, "m1", "author_bot_id");
		let another_quote = database
			.messages()
			.append_user_message(NewUserMessage {
				replied_to_message_id: Some("m1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_quote, "m1", "replied_to_message_id");
		let another_role = database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				author_bot_id: None,
				created_at: 1,
				..a_reply("m1", None)
			})
			.await;
		assert_conflict(&another_role, "m1", "role");
		let another_content = database
			.messages()
			.append_user_message(a_user_message("m1", "something else", 1))
			.await;
		assert_conflict(&another_content, "m1", "content");
		let another_moment =
			database.messages().append_user_message(a_user_message("m1", "hello", 99)).await;
		assert_conflict(&another_moment, "m1", "created_at");
		let activity_of_another_turn = database
			.messages()
			.append_activity(NewActivity {
				turn_id: "t3".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&activity_of_another_turn, "a1", "turn_id");
		let another_kind = database
			.messages()
			.append_activity(NewActivity {
				kind: "thought".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_kind, "a1", "kind");
		let a_status_ahead =
			database.messages().append_activity(an_activity("a1", InitialStatus::Running)).await;
		assert_conflict(&a_status_ahead, "a1", "status");
		let another_payload = database
			.messages()
			.append_activity(NewActivity {
				payload: "{\"tool\":\"read\"}".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_payload, "a1", "payload");
		let another_activity_moment = database
			.messages()
			.append_activity(NewActivity {
				created_at: 99,
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_activity_moment, "a1", "created_at");

		assert_eq!(
			stored_turn(&database, "t1").await,
			("c1".into(), 1),
			"a refused turn moved or restamped the row"
		);
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1], "a refused append left a row behind");
		assert_eq!(stored_row(&database, "m1").await, before, "a refused append rewrote the row");
		let activities =
			database.messages().activities_for_turn("t1".into()).await.expect("the activities");
		assert_eq!(activities.len(), 1, "a refused append left an activity behind");
		assert_eq!(activities[0].kind, "tool");
		assert_eq!(activities[0].payload, "{}");
		assert_eq!(
			activities[0].status,
			ActivityStatus::Pending,
			"a refused append moved the step"
		);
		assert_eq!(activities[0].created_at, 2, "a refused append restamped the step");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The replay an event loop actually produces: the same event again, after the
	/// row it opened has moved on. The text has grown from nothing, the state has
	/// walked to its ending, the step has walked its whole graph — none of which
	/// the event ever carried, so an exact replay still answers the place it holds
	/// and leaves every column of the row where it was.
	#[tokio::test]
	async fn replaying_an_append_after_the_row_moved_on_answers_the_place_it_already_holds() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let streamed = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m1".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m1".into(), "thought".into()).await.expect("a delta");
		let ended = database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "hi there".into()).await.expect("a delta");
		database
			.messages()
			.finalize_message("m2".into(), TerminalState::Complete)
			.await
			.expect("the message is finalized");
		let walked = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.start_activity("a1".into())
			.await
			.expect("a step refused to start running");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("a step refused to end");
		let mid_stream_row = stored_row(&database, "m1").await;
		let ended_row = stored_row(&database, "m2").await;

		let mid_stream = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("a replay of a message being streamed was refused");
		let after_the_ending = database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("a replay of a message that had ended was refused");
		let after_the_walk = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("a replay of a step that had ended was refused");

		assert_eq!(mid_stream, streamed, "a replay mid-stream took a second place");
		assert_eq!(after_the_ending, ended, "a replay after the ending took a second place");
		assert_eq!(after_the_walk, walked, "a replay after the walk took a second place");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "a replay wrote a second row");
		assert_eq!(
			stored_row(&database, "m1").await,
			mid_stream_row,
			"a replay mid-stream rewrote the row"
		);
		assert_eq!(
			stored_row(&database, "m2").await,
			ended_row,
			"a replay after the ending rewrote the row"
		);
		assert_eq!(transcript[0].content, "half a thought", "a replay reset the streamed text");
		assert_eq!(transcript[0].state, MessageState::Streaming);
		assert_eq!(transcript[1].content, "hi there");
		assert_eq!(transcript[1].state, MessageState::Complete, "a replay reopened the ending");
		assert_eq!(statuses(&database).await, vec![ActivityStatus::Succeeded]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The two creation paths, replayed on what actually created them. A reply
	/// carries no text at all — [`NewAssistantMessage`] has no content field, so the
	/// compiler refuses to submit the beginning of a half-streamed word — and the
	/// deltas it grew are no part of what a replay is compared against. An authored
	/// message is written whole and ends the moment it is written, so its text is
	/// part of the event: the same text again is the same event, the beginning of it
	/// is another message claiming an id that is taken, and nothing may be appended
	/// to it afterwards.
	#[tokio::test]
	async fn a_message_is_replayed_on_what_created_it_and_never_on_the_text_it_grew() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let streamed = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m1".into(), "some".into()).await.expect("a delta");
		database.messages().append_text("m1".into(), "thing".into()).await.expect("a delta");
		let authored = database
			.messages()
			.append_user_message(a_user_message("m2", "something", 1))
			.await
			.expect("the message is appended");
		let streamed_row = stored_row(&database, "m1").await;
		let authored_row = stored_row(&database, "m2").await;

		let replayed_reply = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("a replay of a streamed reply was refused");
		let replayed_message = database
			.messages()
			.append_user_message(a_user_message("m2", "something", 1))
			.await
			.expect("a replay of an authored message was refused");
		let a_prefix =
			database.messages().append_user_message(a_user_message("m2", "somethin", 1)).await;
		database.messages().append_text("m2".into(), " else".into()).await.expect("a late delta");

		assert_eq!(replayed_reply, streamed, "a replay of a streamed reply took a second place");
		assert_eq!(
			replayed_message, authored,
			"a replay of an authored message took a second place"
		);
		assert_conflict(&a_prefix, "m2", "content");
		assert_eq!(streamed_row.content, "something", "the fixture did not stream the whole word");
		assert_eq!(authored_row.completion_state, "complete", "an authored message was left open");
		assert_eq!(
			stored_row(&database, "m1").await,
			streamed_row,
			"a replay of a streamed reply rewrote the row"
		);
		assert_eq!(
			stored_row(&database, "m2").await,
			authored_row,
			"a late delta grew a message that had ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
