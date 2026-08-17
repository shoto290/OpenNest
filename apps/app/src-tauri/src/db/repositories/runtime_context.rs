//! Reads and writes what a Claude run leaves behind: `runtime_sessions`,
//! `context_checkpoints` and `app_settings`.
//!
//! A participant's runs are a lineage rather than a set: `seq` says which one came
//! after which, and `runtime_sessions_active_per_participant` allows exactly one
//! `active` row per participant. So opening is never an insert on its own — the row
//! it replaces is rotated away in the same transaction, because the two apart leave
//! either an insert the index refuses or a live row nothing will ever close.
//!
//! Both are counted per participant, never per conversation: two bots talking in
//! one conversation each hold their own live session and each start at `seq` 1.
//!
//! Only a live row can be moved out of `active`, and every write that ends one says
//! so in its `WHERE`: a process that already lost its session still answers, and its
//! late callback must not rewrite the ending that won. What the guard skipped is
//! then read back inside the same transaction — a callback repeating what is already
//! stored is the same call arriving twice and is answered `Ok`, anything else is
//! [`DatabaseError::Conflict`] and the row stands.
//!
//! A checkpoint is insert-only, and the schema enforces it with a trigger: there is
//! no update to write here, and a later summary of the same participant is a new
//! row. Timestamps arrive from the caller for the same reason ids of ours do not
//! travel the other way — a repository that read the clock itself could not be
//! asked to write a given moment.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::{Access, DatabaseError};

/// Stored rather than derived, like every other lifecycle in this schema: a host
/// that died under a run leaves `active` behind, and that row is the only thing the
/// next launch can recognise an abandoned session from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeSessionStatus {
	Active,
	Rotated,
	Ended,
	Failed,
}

impl RuntimeSessionStatus {
	fn from_column(text: &str) -> Option<Self> {
		match text {
			"active" => Some(Self::Active),
			"rotated" => Some(Self::Rotated),
			"ended" => Some(Self::Ended),
			"failed" => Some(Self::Failed),
			_ => None,
		}
	}

	fn as_column(self) -> &'static str {
		match self {
			Self::Active => "active",
			Self::Rotated => "rotated",
			Self::Ended => "ended",
			Self::Failed => "failed",
		}
	}
}

impl ToSql for RuntimeSessionStatus {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(self.as_column()))
	}
}

/// A status this build has no word for is reported where it is read: the `CHECK`
/// keeps the vocabulary closed, so a value outside it means the file was written by
/// something else, and defaulting it would hand a caller a state it would then act
/// on as if it were real.
impl FromSql for RuntimeSessionStatus {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		let text = value.as_str()?;
		Self::from_column(text).ok_or_else(|| {
			FromSqlError::Other(
				format!("`{text}` is not a runtime session status this build knows").into(),
			)
		})
	}
}

/// The pair every runtime row is scoped by, carried as one value: the two columns
/// are both text, so as loose arguments they are an order nothing checks, and the
/// mistake would file a run under another bot of the same conversation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParticipantKey {
	pub conversation_id: String,
	pub bot_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeSession {
	pub id: String,
	pub participant: ParticipantKey,
	/// Claude's own name for the process, and only ever that: it is not this row's
	/// id and not a conversation's, so nothing is ever looked up by it.
	pub provider_session_id: Option<String>,
	pub seq: i64,
	pub status: RuntimeSessionStatus,
	pub started_at: i64,
	pub ended_at: Option<i64>,
	pub rotation_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContextCheckpoint {
	pub id: String,
	pub participant: ParticipantKey,
	pub runtime_session_id: Option<String>,
	pub summary: String,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

/// A checkpoint before it has an id. Named fields rather than a row of arguments:
/// the three numbers it carries are all `i64`, and swapping two of them would store
/// a summary claiming a stretch of transcript it never folded in.
pub struct NewCheckpoint {
	pub participant: ParticipantKey,
	pub runtime_session_id: Option<String>,
	pub summary: String,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

const ROTATE_LIVE_SESSION: &str = "UPDATE runtime_sessions
	SET status = 'rotated', ended_at = ?3, rotation_reason = ?4
	WHERE conversation_id = ?1 AND bot_id = ?2 AND status = 'active'";

/// `seq` is computed inside the insert, over the participant's own rows: read
/// separately it would be a number the statement is trusted with rather than one
/// the same transaction saw. `provider_session_id` stays NULL — the run has not
/// answered yet.
const OPEN_SESSION: &str = "INSERT INTO runtime_sessions
		(id, conversation_id, bot_id, seq, status, started_at)
	SELECT ?1, ?2, ?3, coalesce(max(seq), 0) + 1, 'active', ?4
		FROM runtime_sessions WHERE conversation_id = ?2 AND bot_id = ?3
	RETURNING seq";

/// Write-once, and only while the run is live: `provider_session_id IS NULL` is
/// what makes a second, different id land on no row instead of quietly replacing
/// the process the lineage was following.
const RECORD_PROVIDER_SESSION: &str = "UPDATE runtime_sessions SET provider_session_id = ?4
	WHERE id = ?1 AND conversation_id = ?2 AND bot_id = ?3
		AND status = 'active' AND provider_session_id IS NULL";

const END_LIVE_SESSION: &str = "UPDATE runtime_sessions
	SET status = ?2, ended_at = ?3, rotation_reason = ?4
	WHERE id = ?1 AND status = 'active'";

/// The reads take the whole row: `session_from` maps by column name, so naming the
/// columns here would only be the same list kept in two places.
const SESSION_BY_ID: &str = "SELECT * FROM runtime_sessions WHERE id = ?1";

/// A session named without its participant is any run in the file, another bot's
/// included: the pair is part of the lookup so a caller can only ever be answered
/// about a row of its own.
const PARTICIPANTS_SESSION_BY_ID: &str =
	"SELECT * FROM runtime_sessions WHERE id = ?1 AND conversation_id = ?2 AND bot_id = ?3";

const ACTIVE_SESSION: &str = "SELECT * FROM runtime_sessions
	WHERE conversation_id = ?1 AND bot_id = ?2 AND status = 'active'";

const SESSIONS_FOR: &str = "SELECT * FROM runtime_sessions
	WHERE conversation_id = ?1 AND bot_id = ?2
	ORDER BY seq";

const INSERT_CHECKPOINT: &str = "INSERT INTO context_checkpoints
	(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq, token_count,
		created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)";

const LATEST_CHECKPOINT: &str = "SELECT * FROM context_checkpoints
	WHERE conversation_id = ?1 AND bot_id = ?2
	ORDER BY last_message_seq DESC
	LIMIT 1";

const CHECKPOINTS_FOR: &str = "SELECT * FROM context_checkpoints
	WHERE conversation_id = ?1 AND bot_id = ?2
	ORDER BY last_message_seq";

pub struct RuntimeContextRepository {
	access: Access,
}

impl RuntimeContextRepository {
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

	/// Handing over is one transaction: between the rotation and the insert the
	/// participant either holds two live sessions, which the index refuses, or none,
	/// which a crash would freeze. `rotation_reason` describes the row being left
	/// behind, never the new one, and the moment the new run starts is the moment the
	/// old one ended — one reading of the clock for one handover.
	///
	/// A first open has nothing to rotate, so the reason is simply spent on no row.
	pub async fn open(
		&self,
		participant: ParticipantKey,
		started_at: i64,
		rotation_reason: Option<String>,
	) -> Result<RuntimeSession, DatabaseError> {
		let id = uuid::Uuid::new_v4().to_string();
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.execute(
					ROTATE_LIVE_SESSION,
					params![
						participant.conversation_id,
						participant.bot_id,
						started_at,
						rotation_reason
					],
				)?;
				let seq = transaction.query_row(
					OPEN_SESSION,
					params![id, participant.conversation_id, participant.bot_id, started_at],
					|row| row.get::<_, i64>(0),
				)?;
				transaction.commit()?;
				Ok(RuntimeSession {
					id,
					participant,
					provider_session_id: None,
					seq,
					status: RuntimeSessionStatus::Active,
					started_at,
					ended_at: None,
					rotation_reason: None,
				})
			})
			.await
	}

	/// The CLI only names its session once the run has started, which is why `open`
	/// cannot take it. It lands in `provider_session_id` and nowhere else: mistaking
	/// it for one of our ids would attach a lineage to a process another participant
	/// is running.
	///
	/// One run answers with one id, so the column is written once. The same id
	/// arriving twice is the callback repeating itself; a different one, or any id at
	/// all once the run is over, is a process talking about a session this row no
	/// longer stands for.
	pub async fn record_provider_session(
		&self,
		participant: ParticipantKey,
		session_id: String,
		provider_session_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let changed = transaction.execute(
					RECORD_PROVIDER_SESSION,
					params![
						session_id,
						participant.conversation_id,
						participant.bot_id,
						provider_session_id
					],
				)?;
				if changed == 1 {
					transaction.commit()?;
					return Ok(());
				}
				let stored = transaction
					.query_row(
						PARTICIPANTS_SESSION_BY_ID,
						params![session_id, participant.conversation_id, participant.bot_id],
						session_from,
					)
					.optional()?;
				let Some(stored) = stored else {
					return Err(no_such_session());
				};
				let is_replay = stored.status == RuntimeSessionStatus::Active
					&& stored.provider_session_id.as_deref() == Some(provider_session_id.as_str());
				if is_replay {
					return Ok(());
				}
				Err(DatabaseError::Conflict)
			})
			.await
	}

	pub async fn close(&self, session_id: String, ended_at: i64) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				end_live_session(
					connection,
					&session_id,
					RuntimeSessionStatus::Ended,
					ended_at,
					None,
				)
			})
			.await
	}

	/// `rotation_reason` is where the reason goes, failure included: it is the one
	/// column the schema keeps for why a run stopped. Leaving `active` behind is the
	/// point — the index then lets the participant open again straight away.
	pub async fn fail(
		&self,
		session_id: String,
		ended_at: i64,
		reason: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				end_live_session(
					connection,
					&session_id,
					RuntimeSessionStatus::Failed,
					ended_at,
					Some(&reason),
				)
			})
			.await
	}

	/// `None` is the ordinary answer for a participant between two runs, not a row
	/// that went missing.
	pub async fn active_session(
		&self,
		participant: ParticipantKey,
	) -> Result<Option<RuntimeSession>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.query_row(
						ACTIVE_SESSION,
						params![participant.conversation_id, participant.bot_id],
						session_from,
					)
					.optional()?)
			})
			.await
	}

	/// Ordered by `seq` rather than by `started_at`: two sessions opened in the same
	/// millisecond still have to come back in the order they were opened.
	pub async fn sessions_for(
		&self,
		participant: ParticipantKey,
	) -> Result<Vec<RuntimeSession>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare(SESSIONS_FOR)?;
				let sessions = statement
					.query_map(
						params![participant.conversation_id, participant.bot_id],
						session_from,
					)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(sessions)
			})
			.await
	}

	/// The row is frozen the moment it lands, by trigger: what it says about the
	/// transcript is only true for the count, the run and the moment it folded in, so
	/// there is no update to reach for — a newer summary is another checkpoint.
	pub async fn checkpoint(
		&self,
		checkpoint: NewCheckpoint,
	) -> Result<ContextCheckpoint, DatabaseError> {
		let stored = ContextCheckpoint {
			id: uuid::Uuid::new_v4().to_string(),
			participant: checkpoint.participant,
			runtime_session_id: checkpoint.runtime_session_id,
			summary: checkpoint.summary,
			last_message_seq: checkpoint.last_message_seq,
			token_count: checkpoint.token_count,
			created_at: checkpoint.created_at,
		};
		self.access
			.call(move |connection| {
				connection.execute(
					INSERT_CHECKPOINT,
					params![
						stored.id,
						stored.participant.conversation_id,
						stored.participant.bot_id,
						stored.runtime_session_id,
						stored.summary,
						stored.last_message_seq,
						stored.token_count,
						stored.created_at,
					],
				)?;
				Ok(stored)
			})
			.await
	}

	/// The checkpoint to resume from is the one that reaches furthest into the
	/// transcript, which is `last_message_seq` and not `created_at`: the pair is
	/// unique per participant, so there is no tie for the query plan to settle.
	pub async fn latest_checkpoint(
		&self,
		participant: ParticipantKey,
	) -> Result<Option<ContextCheckpoint>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.query_row(
						LATEST_CHECKPOINT,
						params![participant.conversation_id, participant.bot_id],
						checkpoint_from,
					)
					.optional()?)
			})
			.await
	}

	pub async fn checkpoints_for(
		&self,
		participant: ParticipantKey,
	) -> Result<Vec<ContextCheckpoint>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare(CHECKPOINTS_FOR)?;
				let checkpoints = statement
					.query_map(
						params![participant.conversation_id, participant.bot_id],
						checkpoint_from,
					)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(checkpoints)
			})
			.await
	}
}

/// Both endings are the same write under a different word, and the same guard:
/// `status = 'active'` in the `WHERE` is what a late callback runs into. Zero rows
/// is not yet a refusal, so the row is read back in the transaction that just tried
/// to change it — from anywhere else the answer could already be stale.
///
/// An ending identical to the one stored is the same call arriving twice and costs
/// nothing to accept. An ending that differs is two processes disagreeing about how
/// the run finished, and the one that got there first is the one that was true.
///
/// The id alone is enough here, unlike when a provider names its session: it is the
/// primary key, and the caller ending a run is holding the row `open` handed it
/// rather than a name that reached it from outside.
fn end_live_session(
	connection: &mut Connection,
	session_id: &str,
	status: RuntimeSessionStatus,
	ended_at: i64,
	reason: Option<&str>,
) -> Result<(), DatabaseError> {
	let transaction = connection.transaction()?;
	let changed =
		transaction.execute(END_LIVE_SESSION, params![session_id, status, ended_at, reason])?;
	if changed == 1 {
		transaction.commit()?;
		return Ok(());
	}
	let stored =
		transaction.query_row(SESSION_BY_ID, params![session_id], session_from).optional()?;
	let Some(stored) = stored else {
		return Err(no_such_session());
	};
	let is_replay = stored.status == status
		&& stored.ended_at == Some(ended_at)
		&& stored.rotation_reason.as_deref() == reason;
	if is_replay {
		return Ok(());
	}
	Err(DatabaseError::Conflict)
}

/// A write naming a session the file does not hold is a caller working from an id
/// that never existed here, which is a mistake of its own rather than a race: it is
/// told so, instead of being left believing a run it can no longer find was closed.
fn no_such_session() -> DatabaseError {
	DatabaseError::Sqlite(rusqlite::Error::QueryReturnedNoRows)
}

fn session_from(row: &Row<'_>) -> rusqlite::Result<RuntimeSession> {
	Ok(RuntimeSession {
		id: row.get("id")?,
		participant: ParticipantKey {
			conversation_id: row.get("conversation_id")?,
			bot_id: row.get("bot_id")?,
		},
		provider_session_id: row.get("provider_session_id")?,
		seq: row.get("seq")?,
		status: row.get("status")?,
		started_at: row.get("started_at")?,
		ended_at: row.get("ended_at")?,
		rotation_reason: row.get("rotation_reason")?,
	})
}

fn checkpoint_from(row: &Row<'_>) -> rusqlite::Result<ContextCheckpoint> {
	Ok(ContextCheckpoint {
		id: row.get("id")?,
		participant: ParticipantKey {
			conversation_id: row.get("conversation_id")?,
			bot_id: row.get("bot_id")?,
		},
		runtime_session_id: row.get("runtime_session_id")?,
		summary: row.get("summary")?,
		last_message_seq: row.get("last_message_seq")?,
		token_count: row.get("token_count")?,
		created_at: row.get("created_at")?,
	})
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::{temp_dir, FILE_NAME};
	use crate::db::Database;

	/// Two bots joined to the same conversation: every lineage below has to stay its
	/// own, and only a shared conversation makes that something to prove rather than
	/// something the keys give away.
	const FIXTURE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
			VALUES ('c1', 'b1', 'assistant', 1), ('c1', 'b2', 'assistant', 1);
	";

	fn participant(bot_id: &str) -> ParticipantKey {
		ParticipantKey { conversation_id: "c1".to_owned(), bot_id: bot_id.to_owned() }
	}

	fn opened(dir: &Path) -> Database {
		Database::open(&dir.join(FILE_NAME), None).expect("the database opens")
	}

	/// `bots`, `conversations` and `conversation_participants` are written as raw SQL
	/// because their own repositories are still empty seams, and no runtime row exists
	/// without the participant it is scoped by.
	async fn seeded(dir: &Path) -> Database {
		let database = opened(dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(FIXTURE)?))
			.await
			.expect("the fixture is inserted");
		database
	}

	async fn live_session_count(database: &Database) -> u32 {
		database
			.call(|connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM runtime_sessions WHERE status = 'active'",
					[],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("query")
	}

	/// Read back through the lineage rather than by id alone: what a refusal has to
	/// leave behind is the participant's own row, exactly as it stood.
	async fn stored_session(database: &Database, bot_id: &str, id: &str) -> RuntimeSession {
		database
			.runtime_context()
			.sessions_for(participant(bot_id))
			.await
			.expect("the sessions")
			.into_iter()
			.find(|session| session.id == id)
			.expect("the session is still on the record")
	}

	async fn rows_named(database: &Database, id: String) -> u32 {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM runtime_sessions WHERE id = ?1",
					[id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("query")
	}

	fn a_checkpoint_at(participant: ParticipantKey, last_message_seq: i64) -> NewCheckpoint {
		NewCheckpoint {
			participant,
			runtime_session_id: None,
			summary: format!("the conversation up to message {last_message_seq}"),
			last_message_seq,
			token_count: 120,
			created_at: last_message_seq,
		}
	}

	/// Two bots in one conversation are two lineages: the numbering and the live
	/// session are both scoped to the participant, so each starts at 1 and a handover
	/// on one side cannot touch the other's.
	#[tokio::test]
	async fn two_bots_in_one_conversation_keep_their_own_lineage() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let first = runtime.open(participant("b1"), 1, None).await.expect("b1 opens a session");
		let second = runtime.open(participant("b2"), 2, None).await.expect("b2 opens a session");
		runtime
			.open(participant("b1"), 3, Some("context full".to_owned()))
			.await
			.expect("b1 opens a second session");

		assert_eq!(first.seq, 1, "the first bot's lineage did not start at 1");
		assert_eq!(second.seq, 1, "the second bot's lineage inherited the first one's numbering");
		assert_eq!(
			runtime.active_session(participant("b2")).await.expect("b2's live session"),
			Some(second),
			"a handover in one lineage moved another participant's live session"
		);
		assert_eq!(
			runtime.sessions_for(participant("b2")).await.expect("b2's sessions").len(),
			1,
			"a handover in one lineage added a row to another participant's"
		);
		assert_eq!(live_session_count(&database).await, 2, "one live session per participant");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// `seq` is what orders a lineage, so it only ever counts up: a reused number
	/// would be refused by `UNIQUE (conversation_id, bot_id, seq)`, and a gap-free
	/// count is what lets a reader follow the handovers in order.
	#[tokio::test]
	async fn a_participants_sessions_are_numbered_in_the_order_they_opened() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let mut opened_seqs = Vec::new();
		for started_at in 1..=3 {
			let session = runtime
				.open(participant("b1"), started_at, Some("context full".to_owned()))
				.await
				.expect("the session opens");
			opened_seqs.push(session.seq);
		}

		assert_eq!(opened_seqs, vec![1, 2, 3], "a reopen did not continue the lineage");
		assert_eq!(
			runtime
				.sessions_for(participant("b1"))
				.await
				.expect("the sessions")
				.iter()
				.map(|session| session.seq)
				.collect::<Vec<_>>(),
			vec![1, 2, 3],
			"the lineage came back in another order than it was opened in"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The row left behind has to say it was left behind: a session still reading
	/// `active` after a handover is what the next launch would take for a live run,
	/// and two of them are what the partial index refuses outright.
	#[tokio::test]
	async fn opening_a_session_rotates_the_one_it_replaces() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let first = runtime.open(participant("b1"), 1, None).await.expect("the first session");

		let second = runtime
			.open(participant("b1"), 5, Some("context full".to_owned()))
			.await
			.expect("the second session");

		let sessions = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let rotated = sessions.first().expect("the replaced session");
		assert_eq!(rotated.id, first.id);
		assert_eq!(
			rotated.status,
			RuntimeSessionStatus::Rotated,
			"the replaced session stayed live"
		);
		assert_eq!(rotated.ended_at, Some(5), "the replaced session never ended");
		assert_eq!(
			rotated.rotation_reason.as_deref(),
			Some("context full"),
			"the handover was recorded without its reason"
		);
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(second),
			"the new session is not the live one"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A run that died must not cost the participant its next one: the failure is
	/// recorded on the row, and giving up `active` is what makes the index let the
	/// following session in immediately.
	#[tokio::test]
	async fn a_failed_session_does_not_stand_in_the_way_of_the_next_one() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let first = runtime.open(participant("b1"), 1, None).await.expect("the first session");

		runtime
			.fail(first.id.clone(), 2, "the process died".to_owned())
			.await
			.expect("the failure is recorded");
		let reopened = runtime.open(participant("b1"), 3, None).await.expect("the next session");

		let sessions = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let failed = sessions.first().expect("the failed session");
		assert_eq!(failed.status, RuntimeSessionStatus::Failed, "the failure was not recorded");
		assert_eq!(failed.ended_at, Some(2), "the failed session never ended");
		assert_eq!(failed.rotation_reason.as_deref(), Some("the process died"));
		assert_eq!(reopened.seq, 2, "the lineage restarted instead of continuing");
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(reopened),
			"the session opened after a failure is not the live one"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Written out of order on purpose: the checkpoint to resume from is the one
	/// reaching furthest into the transcript, not the one that happens to have landed
	/// last.
	#[tokio::test]
	async fn the_latest_checkpoint_is_the_furthest_one_into_the_transcript() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		for last_message_seq in [4, 12, 8] {
			runtime
				.checkpoint(a_checkpoint_at(participant("b1"), last_message_seq))
				.await
				.expect("the checkpoint is stored");
		}

		assert_eq!(
			runtime
				.latest_checkpoint(participant("b1"))
				.await
				.expect("the latest checkpoint")
				.map(|checkpoint| checkpoint.last_message_seq),
			Some(12),
			"the checkpoint chosen is not the furthest into the transcript"
		);
		assert_eq!(
			runtime
				.checkpoints_for(participant("b1"))
				.await
				.expect("the checkpoints")
				.iter()
				.map(|checkpoint| checkpoint.last_message_seq)
				.collect::<Vec<_>>(),
			vec![4, 8, 12],
			"the checkpoints came back in the order they were written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The lineage is what a restart resumes from, so it has to survive the file being
	/// closed: everything read back here comes from a second open of the same path,
	/// with no fixture and no writes of its own.
	#[tokio::test]
	async fn sessions_and_checkpoints_are_read_back_as_they_were_written() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");
		runtime
			.checkpoint(NewCheckpoint {
				runtime_session_id: Some(session.id.clone()),
				..a_checkpoint_at(participant("b1"), 7)
			})
			.await
			.expect("the checkpoint is stored");
		let sessions_before = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let checkpoints_before =
			runtime.checkpoints_for(participant("b1")).await.expect("the checkpoints");
		drop(database);

		let reopened = opened(&dir);

		assert_eq!(
			reopened.runtime_context().sessions_for(participant("b1")).await.expect("the sessions"),
			sessions_before,
			"a session did not come back as it was written"
		);
		assert_eq!(
			reopened
				.runtime_context()
				.checkpoints_for(participant("b1"))
				.await
				.expect("the checkpoints"),
			checkpoints_before,
			"a checkpoint did not come back as it was written"
		);

		drop(reopened);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The one call that names a row instead of a participant: told about a session
	/// the file does not hold, it has to say so, or the caller goes on believing it
	/// closed a run that is still `active` for the next launch to sweep up.
	#[tokio::test]
	async fn a_call_naming_a_session_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let closed = runtime.close("no such session".to_owned(), 2).await;

		assert!(closed.is_err(), "closing a session that does not exist reported success");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn is_conflict(outcome: &Result<(), DatabaseError>) -> bool {
		matches!(outcome, Err(DatabaseError::Conflict))
	}

	/// A process that lost its session still answers: the callback lands after the
	/// handover, on a row that already says why the run really stopped. Recording the
	/// ending it was told about would erase that, and put a second live session in
	/// reach of the participant.
	#[tokio::test]
	async fn a_late_callback_never_rewrites_a_session_that_was_already_replaced() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let replaced = runtime.open(participant("b1"), 1, None).await.expect("the first session");
		runtime
			.open(participant("b1"), 5, Some("context full".to_owned()))
			.await
			.expect("the second session");

		let closed = runtime.close(replaced.id.clone(), 9).await;
		let failed = runtime.fail(replaced.id.clone(), 9, "the process died".to_owned()).await;

		assert!(is_conflict(&closed), "a late close reached a replaced session: {closed:?}");
		assert!(is_conflict(&failed), "a late failure reached a replaced session: {failed:?}");
		let stored = stored_session(&database, "b1", &replaced.id).await;
		assert_eq!(
			stored.status,
			RuntimeSessionStatus::Rotated,
			"a refused write moved the status"
		);
		assert_eq!(stored.ended_at, Some(5), "a refused write moved the ending");
		assert_eq!(
			stored.rotation_reason.as_deref(),
			Some("context full"),
			"a refused write moved the reason"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The stream ending and the process dying can both be reported for one run, in
	/// either order. Whichever is recorded first is the one that was true: the second
	/// describes a session that had already stopped, and is told so.
	#[tokio::test]
	async fn two_endings_disagreeing_about_one_session_leave_the_first_one_standing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let closed_first = runtime.open(participant("b1"), 1, None).await.expect("b1's session");
		let failed_first = runtime.open(participant("b2"), 1, None).await.expect("b2's session");

		runtime.close(closed_first.id.clone(), 4).await.expect("the session closes");
		let failed_after =
			runtime.fail(closed_first.id.clone(), 4, "the process died".to_owned()).await;
		runtime
			.fail(failed_first.id.clone(), 6, "the process died".to_owned())
			.await
			.expect("the failure is recorded");
		let closed_after = runtime.close(failed_first.id.clone(), 6).await;

		assert!(
			is_conflict(&failed_after),
			"a failure overtook a recorded close: {failed_after:?}"
		);
		assert!(
			is_conflict(&closed_after),
			"a close overtook a recorded failure: {closed_after:?}"
		);
		let closed = stored_session(&database, "b1", &closed_first.id).await;
		assert_eq!(closed.status, RuntimeSessionStatus::Ended, "a refused failure took the ending");
		assert_eq!(closed.rotation_reason, None, "a refused failure left its reason behind");
		let failed = stored_session(&database, "b2", &failed_first.id).await;
		assert_eq!(failed.status, RuntimeSessionStatus::Failed, "a refused close took the ending");
		assert_eq!(failed.rotation_reason.as_deref(), Some("the process died"));
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A callback that is retried says the same thing twice, and the second telling
	/// asks for the state the row is already in: refusing it would turn a delivery
	/// nobody controls into a failure the caller has to explain.
	#[tokio::test]
	async fn the_same_ending_arriving_twice_is_the_same_ending() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let closing = runtime.open(participant("b1"), 1, None).await.expect("b1's session");
		let failing = runtime.open(participant("b2"), 1, None).await.expect("b2's session");
		runtime.close(closing.id.clone(), 4).await.expect("the session closes");
		runtime
			.fail(failing.id.clone(), 6, "the process died".to_owned())
			.await
			.expect("the failure is recorded");

		let closed_again = runtime.close(closing.id.clone(), 4).await;
		let failed_again = runtime.fail(failing.id.clone(), 6, "the process died".to_owned()).await;

		assert!(closed_again.is_ok(), "the same close twice was refused: {closed_again:?}");
		assert!(failed_again.is_ok(), "the same failure twice was refused: {failed_again:?}");
		let closed = stored_session(&database, "b1", &closing.id).await;
		assert_eq!(closed.status, RuntimeSessionStatus::Ended);
		assert_eq!(closed.ended_at, Some(4), "a replay wrote a second ending");
		let failed = stored_session(&database, "b2", &failing.id).await;
		assert_eq!(failed.status, RuntimeSessionStatus::Failed);
		assert_eq!(failed.ended_at, Some(6), "a replay wrote a second ending");
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A run answers with one id and keeps it. A second, different one means the
	/// callback is about another process, and following it would point the lineage at
	/// a session nothing here opened.
	#[tokio::test]
	async fn a_second_provider_session_id_never_replaces_the_first() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");

		let replayed = runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await;
		let rewritten = runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-0000".to_owned(),
			)
			.await;

		assert!(replayed.is_ok(), "the same provider id twice was refused: {replayed:?}");
		assert!(is_conflict(&rewritten), "a provider id was rewritten: {rewritten:?}");
		let stored = stored_session(&database, "b1", &session.id).await;
		assert_eq!(
			stored.provider_session_id.as_deref(),
			Some("claude-9f3c"),
			"a refused write replaced the process the lineage follows"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A session that is over stands for a process that is gone, so it takes no
	/// writes at all — not even the id it was itself running under, which arriving
	/// now means the callback is late rather than that the row is incomplete.
	#[tokio::test]
	async fn a_session_that_is_no_longer_live_takes_no_provider_id() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let rotated = runtime.open(participant("b1"), 1, None).await.expect("b1's first session");
		runtime
			.record_provider_session(
				participant("b1"),
				rotated.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");
		let ended = runtime
			.open(participant("b1"), 5, Some("context full".to_owned()))
			.await
			.expect("b1's second session");
		runtime.close(ended.id.clone(), 6).await.expect("the session closes");
		let failed = runtime.open(participant("b2"), 1, None).await.expect("b2's session");
		runtime
			.fail(failed.id.clone(), 2, "the process died".to_owned())
			.await
			.expect("the failure is recorded");

		let onto_rotated = runtime
			.record_provider_session(
				participant("b1"),
				rotated.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await;
		let onto_ended = runtime
			.record_provider_session(participant("b1"), ended.id.clone(), "claude-0000".to_owned())
			.await;
		let onto_failed = runtime
			.record_provider_session(participant("b2"), failed.id.clone(), "claude-1111".to_owned())
			.await;

		assert!(
			is_conflict(&onto_rotated),
			"a replaced session took its own id back: {onto_rotated:?}"
		);
		assert!(is_conflict(&onto_ended), "a closed session took a provider id: {onto_ended:?}");
		assert!(is_conflict(&onto_failed), "a failed session took a provider id: {onto_failed:?}");
		assert_eq!(
			stored_session(&database, "b1", &rotated.id).await.provider_session_id.as_deref(),
			Some("claude-9f3c")
		);
		assert_eq!(
			stored_session(&database, "b1", &ended.id).await.provider_session_id,
			None,
			"a refused write named the process of a session that had ended"
		);
		assert_eq!(
			stored_session(&database, "b2", &failed.id).await.provider_session_id,
			None,
			"a refused write named the process of a session that had failed"
		);
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Claude's id for its process names a process, and the only column it belongs in
	/// is `provider_session_id`: taken for a row of ours it would point a lineage, a
	/// checkpoint or a conversation at whatever else answers to that string.
	#[tokio::test]
	async fn a_recorded_provider_session_id_is_never_a_row_of_ours() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		assert_eq!(
			session.provider_session_id, None,
			"a session was opened already named by Claude"
		);

		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");

		let live = runtime
			.active_session(participant("b1"))
			.await
			.expect("the live session")
			.expect("the session is still live");
		assert_eq!(live.provider_session_id.as_deref(), Some("claude-9f3c"));
		assert_eq!(live.id, session.id, "recording the provider id moved the row's own id");
		assert_ne!(live.id, "claude-9f3c", "the row took the provider's id for its own");
		assert_eq!(
			rows_named(&database, "claude-9f3c".to_owned()).await,
			0,
			"a provider id was stored as a session id"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
