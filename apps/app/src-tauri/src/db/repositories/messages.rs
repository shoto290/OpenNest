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
//! The place a row takes is allocated here rather than by the caller. `seq` is
//! `MAX + 1` inside the same transaction as the insert it stands for, so the
//! order a transcript comes back in is decided by the database that holds it and
//! not by a writer guessing what the file already contains — two rows written in
//! the same millisecond included.
//!
//! Reads are paged from the newest backwards, because that is the end a long
//! conversation is opened at, and handed back the other way round: the caller
//! reads a page in the order it displays it. The cursor is the lowest `seq` a
//! page held, and it is exclusive, so the page after it starts exactly where the
//! last one stopped.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};

use crate::db::{Access, DatabaseError};

/// Who a message is from. `role` carries no CHECK constraint of its own, so this
/// enum is the vocabulary: a value the host never wrote is read back as a
/// conversion failure rather than as text a step would have to guess at.
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

/// Where a message is in its life. `Pending` and `Streaming` are the two a
/// message can still be written to; the four others are endings, and the first
/// one a message reaches is the one it keeps.
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
/// vocabulary can express, so the rule holds at the call site instead of at the
/// row.
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

/// The same shape as [`MessageState`], for the step a turn hangs off: `Pending`
/// and `Running` are open, the three others are endings.
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

pub struct NewMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub role: MessageRole,
	pub content: String,
	pub state: MessageState,
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

/// `messages` in display order, oldest first. `next_before_seq` is the lowest
/// `seq` the page held, and `None` once there is nothing older to ask for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessagePage {
	pub messages: Vec<StoredMessage>,
	pub next_before_seq: Option<i64>,
}

pub struct NewActivity {
	pub id: String,
	pub turn_id: String,
	pub kind: String,
	pub status: ActivityStatus,
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

const TURN_KEY: &str = "SELECT seq, conversation_id FROM turns WHERE id = ?1";
const NEXT_TURN_SEQ: &str =
	"SELECT COALESCE(MAX(seq), 0) + 1 FROM turns WHERE conversation_id = ?1";
const INSERT_TURN: &str = "INSERT INTO turns (id, conversation_id, seq, started_at)
	VALUES (?1, ?2, ?3, ?4)";
const COMPLETE_TURN: &str =
	"UPDATE turns SET completed_at = ?2 WHERE id = ?1 AND completed_at IS NULL";

const MESSAGE_KEY: &str = "SELECT seq, conversation_id, turn_id, author_bot_id,
		replied_to_message_id, role
	FROM messages WHERE id = ?1";
const MESSAGE_STATE: &str = "SELECT completion_state FROM messages WHERE id = ?1";
const NEXT_MESSAGE_SEQ: &str =
	"SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?1";
const INSERT_MESSAGE: &str = "INSERT INTO messages
	(id, conversation_id, turn_id, author_bot_id, replied_to_message_id, seq, role, content,
		completion_state, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)";
const APPEND_TEXT: &str =
	"UPDATE messages SET content = content || ?2, completion_state = 'streaming'
	WHERE id = ?1 AND completion_state IN ('pending', 'streaming')";
const FINALIZE_MESSAGE: &str = "UPDATE messages SET completion_state = ?2 WHERE id = ?1";
const MESSAGE_PAGE: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at
	FROM messages WHERE conversation_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3";

const ACTIVITY_KEY: &str = "SELECT seq, turn_id, kind, payload FROM activities WHERE id = ?1";
const ACTIVITY_STATUS: &str = "SELECT status FROM activities WHERE id = ?1";
const NEXT_ACTIVITY_SEQ: &str =
	"SELECT COALESCE(MAX(seq), 0) + 1 FROM activities WHERE turn_id = ?1";
const INSERT_ACTIVITY: &str = "INSERT INTO activities
	(id, turn_id, kind, status, payload, seq, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";
const SET_ACTIVITY_STATUS: &str = "UPDATE activities SET status = ?2 WHERE id = ?1";
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

	/// Answers the place the turn took in its conversation. Starting a turn whose
	/// id is already on the record writes nothing and answers the place it holds —
	/// as long as it is the same turn, which is what the conversation it names has
	/// to agree on.
	pub async fn start_turn(&self, turn: NewTurn) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_turn(connection, turn))).await?
	}

	/// The moment a turn ended is written once: a turn already completed keeps the
	/// moment it was, so a replayed end is not a second one.
	pub async fn complete_turn(
		&self,
		id: String,
		completed_at: i64,
	) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.execute(COMPLETE_TURN, params![id, completed_at])?;
				Ok(())
			})
			.await?)
	}

	/// Answers the place the message took in its conversation. Appending an id the
	/// conversation already holds writes nothing and answers the place it holds, so
	/// a caller replaying its own event cannot make a second copy of a message —
	/// and cannot quietly turn the stored one into another message either.
	pub async fn append_message(&self, message: NewMessage) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_message(connection, message))).await?
	}

	/// A delta is concatenated by SQLite onto what the row already holds, so no
	/// text the host streamed is ever read back to be written again. A delta that
	/// arrives for a message which has already ended is dropped: the turn it
	/// belonged to is over, and the ending on the record is the one a reader is
	/// owed.
	pub async fn append_text(&self, id: String, delta: String) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.execute(APPEND_TEXT, params![id, delta])?;
				Ok(())
			})
			.await?)
	}

	/// The first ending a message reaches wins, and only an open message reaches
	/// one. Reporting the same ending again is the same call twice and costs
	/// nothing; reporting a different one is two accounts of how the turn went, and
	/// the one the reader already saw is not overwritten by the later one.
	pub async fn finalize_message(
		&self,
		id: String,
		state: TerminalState,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(close_message(connection, &id, state))).await?
	}

	/// Paged from the newest backwards and handed back oldest first — see the
	/// module note for why the two directions are not the same one.
	pub async fn page_messages(
		&self,
		query: MessagePageQuery,
	) -> Result<MessagePage, TranscriptError> {
		Ok(self
			.call(move |connection| {
				// No cursor is every seq there is: the first page is the one before the end
				// of a sequence that only ever counts up from 1.
				let before_seq = query.before_seq.unwrap_or(i64::MAX);
				let mut statement = connection.prepare(MESSAGE_PAGE)?;
				let mut messages = statement
					.query_map(
						params![query.conversation_id, before_seq, query.limit],
						read_message,
					)?
					.collect::<Result<Vec<_>, _>>()?;
				messages.reverse();
				// A page short of what it asked for is the last one there is: offering a
				// cursor for it would send the caller after messages that are not there.
				let next_before_seq = match messages.first() {
					Some(oldest) if messages.len() as u32 == query.limit => Some(oldest.seq),
					_ => None,
				};
				Ok(MessagePage { messages, next_before_seq })
			})
			.await?)
	}

	/// Answers the place the activity took in its turn, and appending an id the
	/// turn already holds writes nothing — the same rule as a message, over the
	/// pair `(turn_id, seq)` the activity is keyed on.
	pub async fn append_activity(&self, activity: NewActivity) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_activity(connection, activity))).await?
	}

	/// Walks the graph in [`activity_transition`]: a step may start running, an
	/// open step may end, and the ending it reached is the one it keeps.
	pub async fn set_activity_status(
		&self,
		id: String,
		status: ActivityStatus,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(advance_activity(connection, &id, status))).await?
	}

	/// Read apart from the messages of the same turn: a step a turn took is not a
	/// message, and paging the transcript must not have to carry it.
	pub async fn activities_for_turn(
		&self,
		turn_id: String,
	) -> Result<Vec<StoredActivity>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare(ACTIVITIES_OF_TURN)?;
				let activities = statement
					.query_map(params![turn_id], read_activity)?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(activities)
			})
			.await?)
	}

	/// What a host that died under a turn left behind, closed out at the next
	/// launch. A message keeps the text it had streamed so far — the point of
	/// `interrupted` is that a reader can be told the stream stopped without
	/// losing what came before it — and a step nobody is running any more is
	/// `terminated` rather than failed, because nothing observed it fail. Safe on
	/// every boot: a file with nothing open reports two zeroes.
	pub async fn recover_unfinished(&self) -> Result<RecoveryReport, TranscriptError> {
		Ok(self
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				let interrupted_messages = transaction.execute(INTERRUPT_OPEN_MESSAGES, [])?;
				let terminated_activities = transaction.execute(TERMINATE_OPEN_ACTIVITIES, [])?;
				transaction.commit()?;
				Ok(RecoveryReport { interrupted_messages, terminated_activities })
			})
			.await?)
	}
}

/// The stored side of a turn's identity, read before an append answers.
struct StoredTurnKey {
	seq: i64,
	conversation_id: String,
}

impl StoredTurnKey {
	fn diverging_field(&self, turn: &NewTurn) -> Option<&'static str> {
		(self.conversation_id != turn.conversation_id).then_some("conversation_id")
	}
}

struct StoredMessageKey {
	seq: i64,
	conversation_id: String,
	turn_id: String,
	author_bot_id: Option<String>,
	replied_to_message_id: Option<String>,
	role: MessageRole,
}

impl StoredMessageKey {
	// content and created_at are left out of the comparison on purpose: content
	// grows through append_text after the insert and created_at is whatever moment
	// the replaying caller carried, so comparing either would read a mid-stream
	// replay as a conflict.
	fn diverging_field(&self, message: &NewMessage) -> Option<&'static str> {
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
		None
	}
}

struct StoredActivityKey {
	seq: i64,
	turn_id: String,
	kind: String,
	payload: String,
}

impl StoredActivityKey {
	fn diverging_field(&self, activity: &NewActivity) -> Option<&'static str> {
		if self.turn_id != activity.turn_id {
			return Some("turn_id");
		}
		if self.kind != activity.kind {
			return Some("kind");
		}
		if self.payload != activity.payload {
			return Some("payload");
		}
		None
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
	let seq = next_seq(&transaction, NEXT_TURN_SEQ, &turn.conversation_id)?;
	transaction
		.execute(INSERT_TURN, params![turn.id, turn.conversation_id, seq, turn.started_at])?;
	transaction.commit()?;
	Ok(seq)
}

fn store_message(connection: &mut Connection, message: NewMessage) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(stored) = stored_message_key(&transaction, &message.id)? {
		if let Some(field) = stored.diverging_field(&message) {
			return Err(TranscriptError::Conflict { id: message.id, field });
		}
		return Ok(stored.seq);
	}
	let seq = next_seq(&transaction, NEXT_MESSAGE_SEQ, &message.conversation_id)?;
	transaction.execute(
		INSERT_MESSAGE,
		params![
			message.id,
			message.conversation_id,
			message.turn_id,
			message.author_bot_id,
			message.replied_to_message_id,
			seq,
			message.role,
			message.content,
			message.state,
			message.created_at,
		],
	)?;
	transaction.commit()?;
	Ok(seq)
}

fn store_activity(
	connection: &mut Connection,
	activity: NewActivity,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(stored) = stored_activity_key(&transaction, &activity.id)? {
		if let Some(field) = stored.diverging_field(&activity) {
			return Err(TranscriptError::Conflict { id: activity.id, field });
		}
		return Ok(stored.seq);
	}
	let seq = next_seq(&transaction, NEXT_ACTIVITY_SEQ, &activity.turn_id)?;
	transaction.execute(
		INSERT_ACTIVITY,
		params![
			activity.id,
			activity.turn_id,
			activity.kind,
			activity.status,
			activity.payload,
			seq,
			activity.created_at,
		],
	)?;
	transaction.commit()?;
	Ok(seq)
}

/// What a reported state turned out to be once the stored one was read.
enum Transition {
	Apply,
	Replay,
	Rejected,
}

/// A message ends once. Every ending is reachable from `pending` and from
/// `streaming`; nothing is reachable from an ending except the ending it already
/// is. `target` is a [`TerminalState`] widened for the comparison, so the two
/// open states cannot appear on the right-hand side at all.
fn message_transition(current: MessageState, target: MessageState) -> Transition {
	if current == target {
		return Transition::Replay;
	}
	match current {
		MessageState::Pending | MessageState::Streaming => Transition::Apply,
		MessageState::Complete
		| MessageState::Cancelled
		| MessageState::Failed
		| MessageState::Interrupted => Transition::Rejected,
	}
}

/// The whole graph a step may walk: `pending` may start running, either open
/// status may end, and an ending stays the one it is. Everything else — a run
/// falling back to pending, an ending reopening, an ending becoming another one —
/// is a caller telling the transcript two different things.
fn activity_transition(current: ActivityStatus, target: ActivityStatus) -> Transition {
	if current == target {
		return Transition::Replay;
	}
	match (current, target) {
		(ActivityStatus::Pending, ActivityStatus::Running) => Transition::Apply,
		(
			ActivityStatus::Pending | ActivityStatus::Running,
			ActivityStatus::Succeeded | ActivityStatus::Failed | ActivityStatus::Terminated,
		) => Transition::Apply,
		_ => Transition::Rejected,
	}
}

fn close_message(
	connection: &mut Connection,
	id: &str,
	state: TerminalState,
) -> Result<(), TranscriptError> {
	let target = MessageState::from(state);
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state(&transaction, MESSAGE_STATE, id)? {
		match message_transition(current, target) {
			Transition::Apply => {
				transaction.execute(FINALIZE_MESSAGE, params![id, target])?;
			}
			Transition::Replay => {}
			Transition::Rejected => {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: target.as_sql(),
				})
			}
		}
	}
	transaction.commit()?;
	Ok(())
}

fn advance_activity(
	connection: &mut Connection,
	id: &str,
	status: ActivityStatus,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state(&transaction, ACTIVITY_STATUS, id)? {
		match activity_transition(current, status) {
			Transition::Apply => {
				transaction.execute(SET_ACTIVITY_STATUS, params![id, status])?;
			}
			Transition::Replay => {}
			Transition::Rejected => {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: status.as_sql(),
				})
			}
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
			Ok(StoredTurnKey { seq: row.get(0)?, conversation_id: row.get(1)? })
		})
		.optional()?)
}

fn stored_message_key(
	transaction: &Transaction<'_>,
	id: &str,
) -> Result<Option<StoredMessageKey>, DatabaseError> {
	Ok(transaction
		.query_row(MESSAGE_KEY, params![id], |row| {
			Ok(StoredMessageKey {
				seq: row.get(0)?,
				conversation_id: row.get(1)?,
				turn_id: row.get(2)?,
				author_bot_id: row.get(3)?,
				replied_to_message_id: row.get(4)?,
				role: row.get(5)?,
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
			Ok(StoredActivityKey {
				seq: row.get(0)?,
				turn_id: row.get(1)?,
				kind: row.get(2)?,
				payload: row.get(3)?,
			})
		})
		.optional()?)
}

/// The state an id holds, or `None` when there is no such row — which is what a
/// transition reads before deciding whether it is one.
fn stored_state<T: FromSql>(
	transaction: &Transaction<'_>,
	query: &str,
	id: &str,
) -> Result<Option<T>, DatabaseError> {
	Ok(transaction.query_row(query, params![id], |row| row.get(0)).optional()?)
}

fn next_seq(transaction: &Transaction<'_>, query: &str, scope: &str) -> Result<i64, DatabaseError> {
	Ok(transaction.query_row(query, params![scope], |row| row.get(0))?)
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
	use crate::db::connection::{temp_dir, FILE_NAME};
	use crate::db::Database;

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
	const TERMINATIONS: [ActivityStatus; 3] =
		[ActivityStatus::Succeeded, ActivityStatus::Failed, ActivityStatus::Terminated];

	fn opened(dir: &Path) -> Database {
		Database::open(&dir.join(FILE_NAME)).expect("the database opens")
	}

	async fn seeded(dir: &Path) -> Database {
		let database = opened(dir);
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

	fn a_user_message(id: &str, content: &str, created_at: i64) -> NewMessage {
		NewMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: None,
			replied_to_message_id: None,
			role: MessageRole::User,
			content: content.into(),
			state: MessageState::Complete,
			created_at,
		}
	}

	fn a_reply(id: &str, replied_to: Option<&str>) -> NewMessage {
		NewMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: Some("b1".into()),
			replied_to_message_id: replied_to.map(Into::into),
			role: MessageRole::Assistant,
			content: String::new(),
			state: MessageState::Pending,
			created_at: 2,
		}
	}

	fn an_activity(id: &str, status: ActivityStatus) -> NewActivity {
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

	/// Walks the whole transcript the way a caller would: newest page first, each
	/// one prepended to what is already known, until nothing older is offered.
	async fn whole_transcript(database: &Database, limit: u32) -> Vec<StoredMessage> {
		let mut collected: Vec<StoredMessage> = Vec::new();
		let mut before_seq = None;
		loop {
			let page = page(database, before_seq, limit).await;
			assert!(
				page.messages.windows(2).all(|pair| pair[0].seq < pair[1].seq),
				"a page came back out of display order"
			);
			let next_before_seq = page.next_before_seq;
			collected.splice(0..0, page.messages);
			match next_before_seq {
				Some(seq) => before_seq = Some(seq),
				None => return collected,
			}
		}
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

	/// The conversation a turn belongs to, which no read of this repository hands
	/// back on its own: what a refused replay must have left untouched.
	async fn turn_conversation(database: &Database, id: &'static str) -> String {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT conversation_id FROM turns WHERE id = ?1",
					params![id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the turn is read")
	}

	fn is_conflict(refused: &Result<i64, TranscriptError>, id: &str, field: &str) -> bool {
		matches!(
			refused,
			Err(TranscriptError::Conflict { id: stored, field: diverged })
				if stored == id && *diverged == field
		)
	}

	fn is_rejected(refused: &Result<(), TranscriptError>, from: &str, to: &str) -> bool {
		matches!(
			refused,
			Err(TranscriptError::InvalidTransition { from: held, to: asked, .. })
				if *held == from && *asked == to
		)
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
				.append_message(a_user_message(&format!("m{index}"), &format!("line {index}"), 1))
				.await
				.expect("the message is appended");
			assert_eq!(seq, index as i64 + 1, "the database allocated a place out of order");
		}

		let transcript = whole_transcript(&database, PAGE).await;

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
				.append_message(a_user_message(&format!("m{index}"), &format!("line {index}"), 7))
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
			.append_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_message(NewMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("elsewhere", "hello", 1)
			})
			.await
			.expect("the other conversation's message is appended");

		database
			.messages()
			.append_message(a_reply("m2", Some("m1")))
			.await
			.expect("a reply inside its own conversation was refused");
		let across = database.messages().append_message(a_reply("m3", Some("elsewhere"))).await;

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
	/// that fills exactly, the short one after it, the empty one after that, and a
	/// cursor already past the oldest message.
	#[tokio::test]
	async fn the_cursor_leaves_no_gap_and_no_duplicate_at_its_edges() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		for index in 0..6 {
			database
				.messages()
				.append_message(a_user_message(&format!("m{index}"), "hello", 1))
				.await
				.expect("the message is appended");
		}

		let newest = page(&database, None, 3).await;
		let older = page(&database, newest.next_before_seq, 3).await;
		let exhausted = page(&database, older.next_before_seq, 3).await;
		let past_the_start = page(&database, Some(1), 10).await;
		let short = page(&database, Some(3), 4).await;

		assert_eq!(seqs(&newest.messages), vec![4, 5, 6]);
		assert_eq!(newest.next_before_seq, Some(4), "a full page offered no cursor");
		assert_eq!(
			seqs(&older.messages),
			vec![1, 2, 3],
			"the second page skipped or repeated a seq"
		);
		assert_eq!(older.next_before_seq, Some(1));
		assert!(exhausted.messages.is_empty(), "a page past the oldest message held rows");
		assert_eq!(exhausted.next_before_seq, None, "an empty page offered a cursor");
		assert!(past_the_start.messages.is_empty(), "the cursor is not exclusive");
		assert_eq!(seqs(&short.messages), vec![1, 2], "a partial page did not stop at the start");
		assert_eq!(short.next_before_seq, None, "a partial page offered a cursor");

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
			.append_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m2".into(), "thought".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", ActivityStatus::Running))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.append_activity(an_activity("a2", ActivityStatus::Succeeded))
			.await
			.expect("the finished activity is appended");

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
				.append_message(a_user_message("m1", "hello", 1))
				.await
				.expect("the message is appended");
			database
				.messages()
				.append_message(a_reply("m2", Some("m1")))
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
				.append_activity(an_activity("a1", ActivityStatus::Running))
				.await
				.expect("the activity is appended");
			database
				.messages()
				.set_activity_status("a1".into(), ActivityStatus::Succeeded)
				.await
				.expect("the activity ends");
			database.messages().complete_turn("t1".into(), 9).await.expect("the turn ends");
			let written = whole_transcript(&database, PAGE).await;
			let activities =
				database.messages().activities_for_turn("t1".into()).await.expect("the activities");
			(written, activities)
		};

		let reopened = opened(&dir);

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
			.append_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_message(a_reply("m2", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "hi".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", ActivityStatus::Running))
			.await
			.expect("the activity is appended");

		let replayed_turn = a_turn(&database, "t1", "c1").await;
		let replayed = database
			.messages()
			.append_message(a_user_message("m1", "something else", 2))
			.await
			.expect("a replayed append was refused");
		let replayed_activity = database
			.messages()
			.append_activity(an_activity("a1", ActivityStatus::Running))
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
			.set_activity_status("a1".into(), ActivityStatus::Succeeded)
			.await
			.expect("the activity ends");
		database
			.messages()
			.set_activity_status("a1".into(), ActivityStatus::Succeeded)
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
					.append_message(a_reply(&id, None))
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
				assert!(
					is_rejected(
						&refused,
						MessageState::from(*ending).as_sql(),
						MessageState::from(other).as_sql()
					),
					"an ending was taken over by a later one: {refused:?}"
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

	/// The graph a step walks, then every move that is not on it: a run falling
	/// back to pending, an ending reopening, an ending becoming another one.
	#[tokio::test]
	async fn an_activity_walks_its_graph_forward_and_refuses_every_other_move() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let mut expected = Vec::new();
		database
			.messages()
			.append_activity(an_activity("walked", ActivityStatus::Pending))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.set_activity_status("walked".into(), ActivityStatus::Running)
			.await
			.expect("a pending step refused to start running");
		database
			.messages()
			.set_activity_status("walked".into(), ActivityStatus::Succeeded)
			.await
			.expect("a running step refused to end");
		expected.push(ActivityStatus::Succeeded);
		for (index, termination) in TERMINATIONS.into_iter().enumerate() {
			for (id, opening) in [
				(format!("p{index}"), ActivityStatus::Pending),
				(format!("r{index}"), ActivityStatus::Running),
			] {
				database
					.messages()
					.append_activity(an_activity(&id, opening))
					.await
					.expect("the activity is appended");
				database
					.messages()
					.set_activity_status(id, termination)
					.await
					.expect("an open step refused to end");
				expected.push(termination);
			}
		}
		database
			.messages()
			.append_activity(an_activity("running", ActivityStatus::Running))
			.await
			.expect("the activity is appended");
		expected.push(ActivityStatus::Running);

		let back_to_pending = database
			.messages()
			.set_activity_status("running".into(), ActivityStatus::Pending)
			.await;
		let reopened =
			database.messages().set_activity_status("p0".into(), ActivityStatus::Running).await;
		let unended =
			database.messages().set_activity_status("p0".into(), ActivityStatus::Pending).await;
		let another_ending =
			database.messages().set_activity_status("p0".into(), ActivityStatus::Failed).await;
		database
			.messages()
			.set_activity_status("p0".into(), ActivityStatus::Succeeded)
			.await
			.expect("the same ending reported twice was refused");

		assert!(is_rejected(&back_to_pending, "running", "pending"), "{back_to_pending:?}");
		assert!(is_rejected(&reopened, "succeeded", "running"), "{reopened:?}");
		assert!(is_rejected(&unended, "succeeded", "pending"), "{unended:?}");
		assert!(is_rejected(&another_ending, "succeeded", "failed"), "{another_ending:?}");
		assert_eq!(statuses(&database).await, expected, "a step moved somewhere it may not go");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// An id that comes back describing something else is not a replay, and the
	/// row that reached the place first is what the reader keeps.
	#[tokio::test]
	async fn an_id_appended_again_describing_something_else_is_refused_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		a_turn(&database, "t3", "c1").await;
		database
			.messages()
			.append_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_activity(an_activity("a1", ActivityStatus::Running))
			.await
			.expect("the activity is appended");

		let turn_elsewhere = database
			.messages()
			.start_turn(NewTurn { id: "t1".into(), conversation_id: "c2".into(), started_at: 5 })
			.await;
		let another_conversation = database
			.messages()
			.append_message(NewMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		let another_turn = database
			.messages()
			.append_message(NewMessage { turn_id: "t3".into(), ..a_user_message("m1", "hello", 1) })
			.await;
		let another_author = database
			.messages()
			.append_message(NewMessage {
				author_bot_id: Some("b1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		let another_quote = database
			.messages()
			.append_message(NewMessage {
				replied_to_message_id: Some("m1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		let another_role = database
			.messages()
			.append_message(NewMessage {
				role: MessageRole::Assistant,
				..a_user_message("m1", "hello", 1)
			})
			.await;
		let activity_of_another_turn = database
			.messages()
			.append_activity(NewActivity {
				turn_id: "t3".into(),
				..an_activity("a1", ActivityStatus::Running)
			})
			.await;
		let another_kind = database
			.messages()
			.append_activity(NewActivity {
				kind: "thought".into(),
				..an_activity("a1", ActivityStatus::Running)
			})
			.await;
		let another_payload = database
			.messages()
			.append_activity(NewActivity {
				payload: "{\"tool\":\"read\"}".into(),
				..an_activity("a1", ActivityStatus::Running)
			})
			.await;

		assert!(is_conflict(&turn_elsewhere, "t1", "conversation_id"), "{turn_elsewhere:?}");
		assert!(
			is_conflict(&another_conversation, "m1", "conversation_id"),
			"{another_conversation:?}"
		);
		assert!(is_conflict(&another_turn, "m1", "turn_id"), "{another_turn:?}");
		assert!(is_conflict(&another_author, "m1", "author_bot_id"), "{another_author:?}");
		assert!(is_conflict(&another_quote, "m1", "replied_to_message_id"), "{another_quote:?}");
		assert!(is_conflict(&another_role, "m1", "role"), "{another_role:?}");
		assert!(
			is_conflict(&activity_of_another_turn, "a1", "turn_id"),
			"{activity_of_another_turn:?}"
		);
		assert!(is_conflict(&another_kind, "a1", "kind"), "{another_kind:?}");
		assert!(is_conflict(&another_payload, "a1", "payload"), "{another_payload:?}");
		assert_eq!(turn_conversation(&database, "t1").await, "c1", "a refused turn moved the row");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1], "a refused append left a row behind");
		assert_eq!(transcript[0].turn_id, "t1");
		assert_eq!(transcript[0].author_bot_id, None);
		assert_eq!(transcript[0].replied_to_message_id, None);
		assert_eq!(transcript[0].role, MessageRole::User);
		assert_eq!(transcript[0].content, "hello");
		let activities =
			database.messages().activities_for_turn("t1".into()).await.expect("the activities");
		assert_eq!(activities.len(), 1, "a refused append left an activity behind");
		assert_eq!(activities[0].kind, "tool");
		assert_eq!(activities[0].payload, "{}");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The replay an event loop actually produces: the same event again, after the
	/// stream it opened has already written onto the row. Nothing about what the
	/// message is has changed, so it answers the place it holds — the text it has
	/// grown and the moment the second caller carried are not what identifies it.
	#[tokio::test]
	async fn replaying_an_append_mid_stream_answers_the_place_the_message_already_holds() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		database
			.messages()
			.append_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		let first = database
			.messages()
			.append_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m2".into(), "thought".into()).await.expect("a delta");

		let replayed = database
			.messages()
			.append_message(NewMessage { created_at: 99, ..a_reply("m2", Some("m1")) })
			.await
			.expect("a replay of a message being streamed was refused");

		assert_eq!(replayed, first, "a replay mid-stream took a second place");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "a replay wrote a second row");
		assert_eq!(transcript[1].content, "half a thought", "a replay reset the streamed text");
		assert_eq!(transcript[1].state, MessageState::Streaming);
		assert_eq!(transcript[1].created_at, 2, "a replay restamped the message");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
