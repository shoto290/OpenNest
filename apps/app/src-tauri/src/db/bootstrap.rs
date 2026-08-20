//! Moves what the legacy `session.json` holds into the durable chat, exactly
//! once, while the connection is still nobody's but the opener's.
//!
//! Exactly-once is a row rather than a look at the disk: the marker in
//! `app_settings` is written inside the same transaction as the rows it stands
//! for, so no crash can leave a half-imported transcript nothing will ever
//! recognise. Reading it takes no transaction at all — every boot after the first
//! answers from one lookup on a primary key, and that key is also what keeps the
//! decision exclusive: a marker appearing after the read makes the insert fail and
//! takes the whole import back with it.
//!
//! Deciding by whether `session.json` is still there would be wrong twice over —
//! the file is deliberately left where it is, and the legacy writer is still live
//! and may create a fresh one the moment this boot is over. That file is the
//! conversation the app is having now, not history to migrate again.
//!
//! Nothing here destroys the source, on any path. Bytes this build cannot parse
//! leave the file byte-identical and no marker behind, so a build that can parse
//! them still finds them; a database that refuses the write leaves the same
//! nothing. [`LegacyImport`] keeps those apart because they are all recoverable
//! and each says where to look.
//!
//! The recovery copy beside the source is part of what the marker stands for, not
//! an afterthought to it: it is on the disk whole and durable *before* the marker
//! is allowed to commit. A marker is irrevocable — no later boot reads the file
//! again — so an import recorded as complete with no copy next to it would have
//! spent the one chance anybody had to keep that material.
//!
//! What a dead host left is recorded as what it was rather than as what it would
//! have become: a reply the process died under is `interrupted`, keeping the text
//! it had streamed, and a step nobody is running any more is `terminated` because
//! nothing observed it fail.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use uuid::Uuid;

use crate::agent::contract::{self, ActivityEvent, ChatMessage, SessionSnapshot};
use crate::agent::store::{self, Stored};
use crate::db::repositories::conversations::{ensure_chat_in, ConversationError, DEFAULT_BOT_ID};
use crate::db::repositories::messages::{ActivityStatus, MessageRole, MessageState};

/// Where the source is copied once it is safe in the database. Deliberately not
/// `store.rs`'s `.bak`: that name is the store's one-shot rescue for bytes it
/// cannot parse, and spending it here would leave the legacy save path with
/// nowhere to move the next unreadable file — so it would stop writing at all.
const IMPORTED_SUFFIX: &str = ".imported";

/// The row that makes the decision once. Its value says which way it went, as a
/// token rather than prose: nothing reads it back today, and a later build that
/// needs to must not have to parse a sentence.
const MARKER_KEY: &str = "legacy_session_import";
const MARKER_IMPORTED: &str = "imported";
const MARKER_NOTHING: &str = "nothing";

const STORED_MARKER: &str = "SELECT value FROM app_settings WHERE key = ?1";
const WRITE_MARKER: &str = "INSERT INTO app_settings (key, value) VALUES (?1, ?2)";

/// `seq` is 1 rather than `MAX + 1`: this row opens the lineage, and a file that
/// already held a run for this participant is not a file the import has any
/// business in — the unique index says so and the whole transaction is refused.
const INSERT_RUNTIME_SESSION: &str = "INSERT INTO runtime_sessions
	(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
	VALUES (?1, ?2, ?3, ?4, 1, 'active', ?5)";

const INSERT_TURN: &str = "INSERT INTO turns (id, conversation_id, seq, started_at, completed_at)
	VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM turns WHERE conversation_id = ?2),
		?3, ?4)";

/// `seq` is allocated inside the insert, the way every other writer of this
/// schema allocates it, so the order the transcript comes back in is the order
/// the snapshot held it and not a number counted outside the statement.
const INSERT_MESSAGE: &str = "INSERT INTO messages
	(id, conversation_id, turn_id, author_bot_id, seq, role, content, completion_state, created_at)
	VALUES (?1, ?2, ?3, ?4,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?2),
		?5, ?6, ?7, ?8)";

const INSERT_ACTIVITY: &str = "INSERT INTO activities
	(id, turn_id, kind, status, payload, seq, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM activities WHERE turn_id = ?2), ?6)";

/// What a boot did about the legacy snapshot, as seven different facts. The
/// recoverable ones are never collapsed: `Unreadable` and `Unpreserved` are about
/// the file, `Refused` is about the database, and a boot that reported one for
/// another would send whoever reads it to the wrong place.
#[derive(Debug, PartialEq, Eq)]
pub enum LegacyImport {
	/// No path to look at, so nothing was examined and nothing decided. No marker
	/// either: a later boot asks again.
	Unavailable,
	/// The marker is already on the record. Nothing was read and nothing written.
	AlreadyImported,
	/// The path was readable and held nothing to migrate — no file, or a snapshot
	/// with nothing in it. A successful no-op, and it does write the marker: the
	/// decision is made once, so a `session.json` the live legacy writer creates
	/// after this boot is never swept in as history.
	NothingToImport,
	/// The rows landed, and the marker with them in the same transaction.
	Imported { turns: usize, messages: usize, activities: usize },
	/// Bytes are there and this build cannot parse them — truncated, or written by a
	/// build that numbers the file higher. No marker, no rows, and the file is left
	/// exactly as it was found.
	Unreadable,
	/// The rows were ready and the source could not be preserved: the copy would not
	/// write, or one is already there holding other bytes. Kept apart from `Refused`
	/// because it is a fact about the file rather than about the database — that is
	/// where whoever reads this has to look. No marker, no rows, the source untouched,
	/// so a later boot tries again.
	Unpreserved,
	/// The database refused the write. Nothing landed, the source is untouched, and
	/// a later boot tries again.
	Refused,
}

/// Runs on the opener's connection, before anything else can reach the file: every
/// row this writes and the marker that stands for them are one transaction, and
/// there is no second writer to lose a race with.
///
/// An import that cannot happen is an outcome, never an error: the host boots
/// either way, and what went wrong is read off the state.
pub fn import(connection: &mut Connection, legacy: Option<&Path>) -> LegacyImport {
	let Some(path) = legacy else {
		return LegacyImport::Unavailable;
	};
	decided(connection, path).unwrap_or(LegacyImport::Refused)
}

/// Three steps, in this order and no other. The marker is read first — a boot that
/// has already decided must not so much as look at what the legacy writer has left
/// on the disk since, whether or not this build can read it. Then the file. The
/// write lock is taken last, only on the paths that write: the steady state is a
/// marker that is already there, and every launch for the life of the install would
/// otherwise queue for a lock to run one lookup and roll it back.
///
/// Nothing is lost by reading outside the transaction. The insert below is what
/// makes the decision exclusive, on the primary key `app_settings` already has, so a
/// marker that appears in between is refused there and takes the import with it.
///
/// The copy is secured between the rows and the marker, and the marker is what the
/// commit turns irrevocable: an import that cannot preserve its source has to be
/// undone here, while undoing it is still free.
///
/// Every early return drops the transaction, which rolls it back: an unreadable
/// file, an unpreservable one and a refused write all leave the database as they
/// found it.
fn decided(connection: &mut Connection, path: &Path) -> Result<LegacyImport, ConversationError> {
	if stored_marker(connection)?.is_some() {
		return Ok(LegacyImport::AlreadyImported);
	}
	let snapshot = match store::read(path) {
		Stored::Unreadable => return Ok(LegacyImport::Unreadable),
		Stored::Missing => None,
		Stored::Snapshot(snapshot) if snapshot == SessionSnapshot::default() => None,
		Stored::Snapshot(snapshot) => Some(snapshot),
	};
	let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
	let outcome = match snapshot {
		Some(snapshot) => {
			let counted = imported(&transaction, snapshot)?;
			if secure_a_copy(path).is_err() {
				return Ok(LegacyImport::Unpreserved);
			}
			mark(&transaction, MARKER_IMPORTED)?;
			counted
		}
		None => {
			mark(&transaction, MARKER_NOTHING)?;
			LegacyImport::NothingToImport
		}
	};
	transaction.commit()?;
	Ok(outcome)
}

/// Everything the snapshot becomes. The bot, the chat and the seat come from
/// [`ensure_chat_in`] rather than from SQL of our own, so an import lands on the
/// one row the seed writes and the one thread it seats — including when the user
/// has already renamed that bot or moved it to another model, which this path
/// neither reads nor touches.
///
/// Only the last turn is kept as it goes: the activities are filed under it, because
/// a step belongs to the exchange it was taken during and the snapshot says nothing
/// finer than that.
fn imported(
	transaction: &Transaction<'_>,
	snapshot: SessionSnapshot,
) -> Result<LegacyImport, ConversationError> {
	let chat = ensure_chat_in(transaction, DEFAULT_BOT_ID)?;
	let opened_at = snapshot.messages.first().map_or_else(now, |message| message.timestamp);
	open_runtime_session(transaction, &chat.id, snapshot.session_id.as_deref(), opened_at)?;
	let mut turns = 0;
	let mut last_turn = None;
	for messages in turns_of(&snapshot.messages) {
		let turn = insert_turn(transaction, &chat.id, messages)?;
		for message in messages {
			insert_message(transaction, &chat.id, &turn.id, message)?;
		}
		turns += 1;
		last_turn = Some(turn);
	}
	if !snapshot.activities.is_empty() {
		// A snapshot carrying activities and no messages has no turn to file them under,
		// so one is opened rather than the material dropped for tidiness — and the count
		// reports it as the turn it is.
		let turn = match last_turn {
			Some(last) => last,
			None => {
				turns += 1;
				insert_turn(transaction, &chat.id, &[])?
			}
		};
		for activity in &snapshot.activities {
			insert_activity(transaction, &turn, activity)?;
		}
	}
	Ok(LegacyImport::Imported {
		turns,
		messages: snapshot.messages.len(),
		activities: snapshot.activities.len(),
	})
}

/// A turn as it landed, kept for the activities: an [`ActivityEvent`] carries no
/// timestamp of its own, so it takes the moment the turn it is filed under
/// started.
struct ImportedTurn {
	id: String,
	started_at: i64,
}

/// A user message opens a turn, and every message after it joins that turn until
/// the next user message. A snapshot that opens with replies — a session resumed
/// past the question that prompted them — puts them in a first turn of their own
/// rather than filing them under a message they never answered.
fn turns_of(messages: &[ChatMessage]) -> Vec<&[ChatMessage]> {
	let mut turns = Vec::new();
	let mut opened = 0;
	for (index, message) in messages.iter().enumerate() {
		if index > opened && message.role == contract::MessageRole::User {
			turns.push(&messages[opened..index]);
			opened = index;
		}
	}
	if opened < messages.len() {
		turns.push(&messages[opened..]);
	}
	turns
}

/// The turn spans its messages: the first one's moment to the last one's.
/// `completed_at` is filled rather than left open because the run the snapshot came
/// from is over — a turn still open here would be swept as unfinished by a launch
/// that has nothing left to finish.
///
/// No messages is the turn opened for activities that arrived without any, and it
/// takes [`now`]: the snapshot dates its steps by nothing of their own.
fn insert_turn(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	messages: &[ChatMessage],
) -> Result<ImportedTurn, ConversationError> {
	let started_at = messages.first().map_or_else(now, |message| message.timestamp);
	let completed_at = messages.last().map_or(started_at, |message| message.timestamp);
	let id = Uuid::new_v4().to_string();
	transaction.prepare_cached(INSERT_TURN)?.execute(params![
		id,
		conversation_id,
		started_at,
		completed_at
	])?;
	Ok(ImportedTurn { id, started_at })
}

/// The id is the snapshot's own, never a fresh one: it is what the frontend has
/// already rendered, and keeping it is what makes the migration invisible to
/// whoever is reading the chat.
///
/// Taken from the connection's cache, like every other statement this crate runs
/// once per row: a long transcript is a few hundred of these, and compiling the same
/// text again for each one would be spent inside the write transaction.
fn insert_message(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	turn_id: &str,
	message: &ChatMessage,
) -> Result<(), ConversationError> {
	let role = role_of(message.role);
	let author = (role == MessageRole::Assistant).then_some(DEFAULT_BOT_ID);
	transaction.prepare_cached(INSERT_MESSAGE)?.execute(params![
		message.id,
		conversation_id,
		turn_id,
		author,
		role,
		message.text,
		state_of(message.completion),
		message.timestamp,
	])?;
	Ok(())
}

/// The whole event is stored as the payload because the schema keeps no column
/// for its title, and a step whose title is gone says nothing a reader can use.
fn insert_activity(
	transaction: &Transaction<'_>,
	turn: &ImportedTurn,
	activity: &ActivityEvent,
) -> Result<(), ConversationError> {
	let payload = serde_json::to_string(activity).map_err(unserializable)?;
	transaction.prepare_cached(INSERT_ACTIVITY)?.execute(params![
		activity.id,
		turn.id,
		kind_of(activity.kind),
		status_of(activity.status),
		payload,
		turn.started_at,
	])?;
	Ok(())
}

/// `active` on purpose: the app resumes the provider session the legacy file was
/// following, and `record_provider_session` only ever writes on a live row. A
/// lineage opened as anything else would strand the run this snapshot came from.
fn open_runtime_session(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	provider_session_id: Option<&str>,
	started_at: i64,
) -> Result<(), ConversationError> {
	transaction.execute(
		INSERT_RUNTIME_SESSION,
		params![
			Uuid::new_v4().to_string(),
			conversation_id,
			DEFAULT_BOT_ID,
			provider_session_id,
			started_at,
		],
	)?;
	Ok(())
}

/// Takes a plain `&Connection`, which a `Transaction` also derefs to: the same
/// question is asked before the write lock is taken and inside a transaction by the
/// tests, and there is nothing about it that needs the lock.
fn stored_marker(connection: &Connection) -> Result<Option<String>, ConversationError> {
	Ok(connection.query_row(STORED_MARKER, params![MARKER_KEY], |row| row.get(0)).optional()?)
}

fn mark(transaction: &Transaction<'_>, outcome: &'static str) -> Result<(), ConversationError> {
	transaction.execute(WRITE_MARKER, params![MARKER_KEY, outcome])?;
	Ok(())
}

fn role_of(role: contract::MessageRole) -> MessageRole {
	match role {
		contract::MessageRole::User => MessageRole::User,
		contract::MessageRole::Assistant => MessageRole::Assistant,
	}
}

/// A reply the file left `streaming` is stored `interrupted`: the process died
/// under the stream, and the words it had already streamed are kept rather than
/// dropped for being half a thought.
fn state_of(completion: contract::MessageCompletion) -> MessageState {
	match completion {
		contract::MessageCompletion::Complete => MessageState::Complete,
		contract::MessageCompletion::Cancelled => MessageState::Cancelled,
		contract::MessageCompletion::Failed => MessageState::Failed,
		contract::MessageCompletion::Streaming => MessageState::Interrupted,
	}
}

fn kind_of(kind: contract::ActivityKind) -> &'static str {
	match kind {
		contract::ActivityKind::Tool => "tool",
		contract::ActivityKind::Permission => "permission",
	}
}

/// Nothing is pending or running any more, and nothing observed a failure either,
/// which is exactly what `terminated` stands for in this schema.
fn status_of(status: contract::ActivityStatus) -> ActivityStatus {
	match status {
		contract::ActivityStatus::Succeeded => ActivityStatus::Succeeded,
		contract::ActivityStatus::Failed => ActivityStatus::Failed,
		contract::ActivityStatus::Pending | contract::ActivityStatus::Running => {
			ActivityStatus::Terminated
		}
	}
}

/// An activity that will not serialize is a value that cannot become a column,
/// which is the error rusqlite keeps for exactly that. It gets no outcome of its
/// own: like every other refusal here it writes nothing and destroys nothing.
fn unserializable(error: serde_json::Error) -> ConversationError {
	ConversationError::from(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

/// Copied, never renamed: `claude_load_session` still reads `session.json` and the
/// chat somebody is looking at must not change under them. The source is never
/// moved, truncated or removed by any path through here.
///
/// Answers only once the copy is on the disk for good, because the marker commits
/// on the strength of that answer.
///
/// The `exists` check is not what makes any of this safe — [`install_copy`] cannot
/// take a name that is already taken, and that is the guarantee. It is there for the
/// retry: a boot that already preserved this snapshot answers from one read, instead
/// of writing and fsyncing a temporary only to find the name occupied, and it still
/// answers in a directory that has gone read-only since.
fn secure_a_copy(path: &Path) -> std::io::Result<()> {
	let target = preserved(path);
	let body = fs::read(path)?;
	if target.exists() {
		return accept_identical(&target, &body);
	}
	install_copy(&target, &body)
}

/// A copy already sitting there is either this very import's, installed by a boot
/// that crashed before it could commit, or another one's. Identical bytes are the
/// first case and the import carries on from where that boot left off — which is
/// what makes a crash between the copy and the commit a retry rather than a loss.
///
/// Anything else is refused, and refused for good: those bytes are somebody else's
/// recovery material, and trading them for ours would destroy the only copy that
/// import has left. So this import stops instead — nothing is destroyed, the
/// outcome says which file to look at, and a human or a later build can clear the
/// stale copy and let it through.
///
/// Reached from both sides of the install for that reason: from the shortcut, when
/// the target was already there, and from the refused link, when it appeared while
/// the copy was being written. The same rule has to hold either way, or the answer
/// would depend on how late the other copy arrived.
fn accept_identical(target: &Path, body: &[u8]) -> std::io::Result<()> {
	if fs::read(target)?.as_slice() == body {
		return Ok(());
	}
	Err(std::io::Error::new(
		std::io::ErrorKind::AlreadyExists,
		"a preserved copy of another import is already there",
	))
}

/// Two promises at once, which is why the bytes are written to a sibling and only
/// then given the name.
///
/// A half-written file must never be able to become the target, so nothing is ever
/// written at the target itself — `create_new` there would be no-clobber but would
/// leave half a copy behind if the write died halfway.
///
/// And the name can only ever be created, never replaced: the install is a hard
/// link, which answers `AlreadyExists` instead of overwriting. `fs::rename` would
/// have destroyed whatever appeared under it, silently, which is the one thing
/// [`accept_identical`] exists to prevent — so a target that arrives late is sent
/// there rather than run over. A filesystem that cannot link refuses the install,
/// which is the safe direction: nothing is destroyed and a later boot tries again.
///
/// The temporary is dropped either way. On success it is a second name for bytes the
/// target now holds; on failure it is a leftover. The parent is synced after both
/// moves, because the link is only recorded once the directory's own entry is
/// durable — and that one sync covers the name that appeared and the one that went.
fn install_copy(target: &Path, body: &[u8]) -> std::io::Result<()> {
	let temp = temporary(target);
	let linked = write_then_link(target, &temp, body);
	let _ = fs::remove_file(&temp);
	match linked {
		Ok(()) => store::sync_parent(target),
		Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
			accept_identical(target, body)
		}
		Err(error) => Err(error),
	}
}

/// Owner-only before a single byte is written, for the reason the source is: on disk
/// a transcript is plain text. `sync_all` comes before the link so the bytes are
/// durable before the name that will outlive the temporary exists — a link to
/// content still in the page cache would survive a power cut as an empty file.
fn write_then_link(target: &Path, temp: &Path, body: &[u8]) -> std::io::Result<()> {
	let mut file = fs::File::create(temp)?;
	store::restrict_to_owner(&file)?;
	file.write_all(body)?;
	file.sync_all()?;
	fs::hard_link(temp, target)
}

fn preserved(path: &Path) -> PathBuf {
	suffixed(path, IMPORTED_SUFFIX)
}

/// Unique per attempt, so two writers cannot interleave into one sibling, and
/// suffixed like everything else here: replacing the extension instead would name
/// the file `session.<something>.tmp`, which is the shape `store.rs` sweeps.
fn temporary(target: &Path) -> PathBuf {
	suffixed(target, &format!(".{}.tmp", Uuid::new_v4()))
}

/// Appended to the whole name rather than through `with_extension`, which would
/// replace `.json` instead of following it.
fn suffixed(path: &Path, suffix: &str) -> PathBuf {
	let mut name = path.as_os_str().to_owned();
	name.push(suffix);
	PathBuf::from(name)
}

/// Unix millis, the unit the schema stores, and only ever a fallback here: every
/// row the snapshot can date is dated by the snapshot.
fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::path::Path;

	use rusqlite::Row;

	use super::*;
	/// The two contract vocabularies that share no name with the stored ones above.
	/// `MessageRole` and `ActivityStatus` stay qualified for the opposite reason: both
	/// sides of those mappings are in scope here.
	use crate::agent::contract::{ActivityKind, MessageCompletion};
	use crate::db::connection::{self, temp_dir, FILE_NAME};
	use crate::db::migrations;

	/// Every table the import can reach, so a refusal is checked against all of them
	/// rather than against the ones it happened to write last.
	const EVERY_TABLE: [&str; 8] = [
		"bots",
		"conversations",
		"conversation_participants",
		"runtime_sessions",
		"turns",
		"messages",
		"activities",
		"context_checkpoints",
	];

	/// A build that numbers `session.json` higher than this one: bytes that are
	/// plainly a transcript, and plainly not ours to read.
	const NEWER_VERSION: &str =
		r#"{"version":2,"snapshot":{"sessionId":"s","messages":[],"activities":[]}}"#;

	const IMPORTED_SAMPLE: LegacyImport =
		LegacyImport::Imported { turns: 3, messages: 7, activities: 4 };

	fn migrated(dir: &Path) -> Connection {
		let mut connection = connection::open(&dir.join(FILE_NAME)).expect("open");
		migrations::apply(&mut connection).expect("the schema installs");
		connection
	}

	/// Three turns by construction: replies before any question, then two user
	/// messages. The four endings a message can carry are all here — the streaming
	/// one is what a host that died under the stream leaves — and so are the four
	/// activity statuses.
	fn sample() -> SessionSnapshot {
		SessionSnapshot {
			session_id: Some("claude-1".into()),
			messages: vec![
				a_reply("m0", MessageCompletion::Complete, 10),
				a_user_message("m1", 20),
				a_reply("m2", MessageCompletion::Complete, 30),
				a_user_message("m3", 40),
				a_reply("m4", MessageCompletion::Cancelled, 50),
				a_reply("m5", MessageCompletion::Failed, 60),
				a_reply("m6", MessageCompletion::Streaming, 70),
			],
			activities: vec![
				an_activity("a1", "Read", ActivityKind::Tool, contract::ActivityStatus::Succeeded),
				an_activity("a2", "Write", ActivityKind::Tool, contract::ActivityStatus::Running),
				an_activity(
					"a3",
					"Bash",
					ActivityKind::Permission,
					contract::ActivityStatus::Pending,
				),
				an_activity("a4", "Grep", ActivityKind::Tool, contract::ActivityStatus::Failed),
			],
		}
	}

	fn a_user_message(id: &str, timestamp: i64) -> ChatMessage {
		ChatMessage {
			id: id.into(),
			role: contract::MessageRole::User,
			text: "salut".into(),
			completion: MessageCompletion::Complete,
			timestamp,
		}
	}

	fn a_reply(id: &str, completion: MessageCompletion, timestamp: i64) -> ChatMessage {
		ChatMessage {
			id: id.into(),
			role: contract::MessageRole::Assistant,
			text: "half a thought".into(),
			completion,
			timestamp,
		}
	}

	fn an_activity(
		id: &str,
		title: &str,
		kind: ActivityKind,
		status: contract::ActivityStatus,
	) -> ActivityEvent {
		ActivityEvent { id: id.into(), title: title.into(), kind, status }
	}

	/// The table is a literal, never a value from outside: it is interpolated, not
	/// bound.
	fn rows_in(connection: &Connection, table: &str) -> u32 {
		connection
			.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
			.expect("query")
	}

	fn counts(connection: &Connection) -> Vec<(&'static str, u32)> {
		EVERY_TABLE.into_iter().map(|table| (table, rows_in(connection, table))).collect()
	}

	fn assert_nothing_landed(connection: &Connection) {
		for table in EVERY_TABLE {
			assert_eq!(rows_in(connection, table), 0, "{table} kept a row the import left behind");
		}
	}

	/// A temporary this module left behind, by the only name it gives one. The
	/// database's own `-wal` and `-shm` siblings are not `.tmp` and never match.
	fn temporaries_in(dir: &Path) -> Vec<PathBuf> {
		fs::read_dir(dir)
			.expect("read dir")
			.flatten()
			.map(|entry| entry.path())
			.filter(|path| path.extension().is_some_and(|extension| extension == "tmp"))
			.collect()
	}

	fn assert_no_temporaries(dir: &Path) {
		assert_eq!(
			temporaries_in(dir),
			Vec::<PathBuf>::new(),
			"a temporary outlived the copy that wrote it"
		);
	}

	#[derive(Debug, PartialEq, Eq)]
	struct MessageRow {
		id: String,
		turn_id: String,
		author_bot_id: Option<String>,
		role: String,
		content: String,
		state: String,
		created_at: i64,
	}

	#[derive(Debug, PartialEq, Eq)]
	struct TurnRow {
		id: String,
		started_at: i64,
		completed_at: Option<i64>,
	}

	#[derive(Debug, PartialEq, Eq)]
	struct ActivityRow {
		id: String,
		turn_id: String,
		kind: String,
		status: String,
		payload: String,
		created_at: i64,
	}

	#[derive(Debug, PartialEq, Eq)]
	struct SessionRow {
		provider_session_id: Option<String>,
		seq: i64,
		status: String,
		started_at: i64,
	}

	/// The `prepare`, `query_map` and `collect` every reader below needs, so each one
	/// is only the query it asks and the row it builds. Every one of them orders by
	/// `seq`: the order the import wrote is what they are all about.
	fn rows_of<T>(
		connection: &Connection,
		query: &str,
		read: fn(&Row<'_>) -> rusqlite::Result<T>,
	) -> Vec<T> {
		let mut statement = connection.prepare(query).expect("prepare");
		let rows = statement.query_map([], read).expect("query");
		rows.collect::<rusqlite::Result<Vec<_>>>().expect("rows")
	}

	fn messages_in(connection: &Connection) -> Vec<MessageRow> {
		rows_of(
			connection,
			"SELECT id, turn_id, author_bot_id, role, content, completion_state, created_at
				FROM messages ORDER BY seq",
			|row| {
				Ok(MessageRow {
					id: row.get(0)?,
					turn_id: row.get(1)?,
					author_bot_id: row.get(2)?,
					role: row.get(3)?,
					content: row.get(4)?,
					state: row.get(5)?,
					created_at: row.get(6)?,
				})
			},
		)
	}

	fn turns_in(connection: &Connection) -> Vec<TurnRow> {
		rows_of(connection, "SELECT id, started_at, completed_at FROM turns ORDER BY seq", |row| {
			Ok(TurnRow { id: row.get(0)?, started_at: row.get(1)?, completed_at: row.get(2)? })
		})
	}

	fn activities_in(connection: &Connection) -> Vec<ActivityRow> {
		rows_of(
			connection,
			"SELECT id, turn_id, kind, status, payload, created_at FROM activities ORDER BY seq",
			|row| {
				Ok(ActivityRow {
					id: row.get(0)?,
					turn_id: row.get(1)?,
					kind: row.get(2)?,
					status: row.get(3)?,
					payload: row.get(4)?,
					created_at: row.get(5)?,
				})
			},
		)
	}

	fn sessions_in(connection: &Connection) -> Vec<SessionRow> {
		rows_of(
			connection,
			"SELECT provider_session_id, seq, status, started_at
				FROM runtime_sessions ORDER BY seq",
			|row| {
				Ok(SessionRow {
					provider_session_id: row.get(0)?,
					seq: row.get(1)?,
					status: row.get(2)?,
					started_at: row.get(3)?,
				})
			},
		)
	}

	/// A launch with no legacy file has still decided: the marker is what stops the
	/// file the live legacy writer creates tomorrow from being taken for history.
	#[test]
	fn a_legacy_file_that_is_not_there_is_nothing_to_import_and_is_decided_once() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::NothingToImport);
		assert_eq!(stored_marker(&connection).expect("query").as_deref(), Some(MARKER_NOTHING));
		assert_nothing_landed(&connection);
		assert!(!preserved(&path).exists(), "a copy was kept of a file that was never there");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A snapshot the legacy writer created and nothing ever filled: readable, and
	/// with nothing in it worth a row.
	#[test]
	fn a_snapshot_holding_nothing_is_nothing_to_import() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &SessionSnapshot::default());

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::NothingToImport);
		assert_eq!(stored_marker(&connection).expect("query").as_deref(), Some(MARKER_NOTHING));
		assert_nothing_landed(&connection);
		assert!(!preserved(&path).exists(), "a copy was kept of a snapshot holding nothing");
		assert!(path.exists(), "the source was not left where the visible chat reads it");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The migration this module exists for, end to end: the transcript comes back in
	/// the order the snapshot held it under the ids the frontend already rendered, the
	/// endings a dead host left are recorded as what they were, the turns are split at
	/// the user messages, and the file it all came from is still exactly where the
	/// visible chat reads it.
	#[test]
	fn a_stored_snapshot_becomes_the_chats_transcript_and_leaves_its_file_alone() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let source = fs::read(&path).expect("the legacy bytes");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, IMPORTED_SAMPLE);
		assert_eq!(stored_marker(&connection).expect("query").as_deref(), Some(MARKER_IMPORTED));
		assert_eq!(rows_in(&connection, "bots"), 1);
		assert_eq!(rows_in(&connection, "conversations"), 1);
		assert_eq!(rows_in(&connection, "conversation_participants"), 1);
		assert_eq!(rows_in(&connection, "context_checkpoints"), 0, "the snapshot holds no summary");

		let turns = turns_in(&connection);
		assert_eq!(
			turns.iter().map(|turn| (turn.started_at, turn.completed_at)).collect::<Vec<_>>(),
			vec![(10, Some(10)), (20, Some(30)), (40, Some(70))],
			"the turns were not split at the user messages"
		);

		let messages = messages_in(&connection);
		assert_eq!(
			messages.iter().map(|message| message.id.as_str()).collect::<Vec<_>>(),
			vec!["m0", "m1", "m2", "m3", "m4", "m5", "m6"],
			"the transcript came back in another order than the snapshot held it"
		);
		assert_eq!(
			messages.iter().map(|message| message.state.as_str()).collect::<Vec<_>>(),
			vec![
				"complete",
				"complete",
				"complete",
				"complete",
				"cancelled",
				"failed",
				"interrupted"
			],
			"an ending was not carried over as what it was"
		);
		assert_eq!(
			messages.iter().map(|message| message.turn_id.as_str()).collect::<Vec<_>>(),
			vec![
				turns[0].id.as_str(),
				turns[1].id.as_str(),
				turns[1].id.as_str(),
				turns[2].id.as_str(),
				turns[2].id.as_str(),
				turns[2].id.as_str(),
				turns[2].id.as_str(),
			],
			"a message was filed under another turn than the one it belongs to"
		);
		assert_eq!(messages[6].content, "half a thought", "the interrupted stream lost its text");
		assert_eq!(messages[1].role, "user");
		assert_eq!(messages[1].author_bot_id, None, "a user message was given a bot author");
		assert_eq!(messages[2].role, "assistant");
		assert_eq!(messages[2].author_bot_id.as_deref(), Some(DEFAULT_BOT_ID));
		assert_eq!(
			messages.iter().map(|message| message.created_at).collect::<Vec<_>>(),
			vec![10, 20, 30, 40, 50, 60, 70]
		);

		let activities = activities_in(&connection);
		assert_eq!(
			activities
				.iter()
				.map(|activity| (
					activity.id.as_str(),
					activity.kind.as_str(),
					activity.status.as_str()
				))
				.collect::<Vec<_>>(),
			vec![
				("a1", "tool", "succeeded"),
				("a2", "tool", "terminated"),
				("a3", "permission", "terminated"),
				("a4", "tool", "failed"),
			],
			"the activities came back in another order or another status"
		);
		assert!(
			activities.iter().all(|activity| activity.turn_id == turns[2].id),
			"the activities were not filed under the last turn"
		);
		assert!(
			activities.iter().all(|activity| activity.created_at == turns[2].started_at),
			"an activity took a moment its turn never had"
		);
		assert!(
			activities[0].payload.contains("Read"),
			"the payload dropped the title the schema has no column for"
		);

		assert_eq!(
			sessions_in(&connection),
			vec![SessionRow {
				provider_session_id: Some("claude-1".into()),
				seq: 1,
				status: "active".into(),
				started_at: 10,
			}],
			"the run the app has to resume is not the one on the record"
		);

		assert_eq!(fs::read(preserved(&path)).expect("the copy"), source);
		assert_eq!(
			fs::read(&path).expect("the source"),
			source,
			"the file the visible chat reads was touched"
		);
		assert_no_temporaries(&dir);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Bytes this build cannot parse may still be a whole transcript to the build
	/// that wrote them, so nothing is written and nothing is decided: the file is
	/// left as it is and a later boot asks again.
	#[test]
	fn an_unreadable_legacy_file_is_left_byte_identical_and_decided_by_nobody() {
		for body in ["{", NEWER_VERSION] {
			let dir = temp_dir();
			let mut connection = migrated(&dir);
			let path = dir.join(store::FILE_NAME);
			fs::write(&path, body).expect("write");

			let outcome = import(&mut connection, Some(&path));

			assert_eq!(outcome, LegacyImport::Unreadable, "`{body}` answered something else");
			assert_eq!(
				stored_marker(&connection).expect("query"),
				None,
				"`{body}` was decided about anyway"
			);
			assert_nothing_landed(&connection);
			assert_eq!(fs::read_to_string(&path).expect("read"), body, "`{body}` was rewritten");
			assert!(!preserved(&path).exists(), "a copy was kept of bytes nothing could read");

			drop(connection);
			fs::remove_dir_all(&dir).expect("cleanup");
		}
	}

	/// Two messages under one id is a snapshot SQLite will refuse halfway through, so
	/// the refusal is met after rows have already been written. It must cost all of
	/// them: not the transcript, not the bot, the chat and the seat opened to hold it,
	/// and not the marker that would have told a later boot the material was safe.
	#[test]
	fn a_refused_import_leaves_the_database_and_the_source_exactly_as_they_were() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		let colliding = SessionSnapshot {
			messages: vec![a_user_message("m1", 10), a_user_message("m1", 20)],
			..sample()
		};
		store::save(&path, &colliding);
		let source = fs::read(&path).expect("the legacy bytes");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::Refused);
		assert_eq!(
			stored_marker(&connection).expect("query"),
			None,
			"a refused import decided anyway"
		);
		assert_nothing_landed(&connection);
		assert_eq!(fs::read(&path).expect("read"), source, "a refused import touched the source");
		assert!(!preserved(&path).exists(), "a copy was kept of an import that never landed");
		assert_no_temporaries(&dir);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The copy is what the marker stands for, so a copy that cannot be written takes
	/// the whole import down with it — otherwise the marker would record material as
	/// preserved that nothing preserved, and no later boot would ever look again.
	///
	/// The failure is a real one, not a mocked one: the legacy file sits in a
	/// directory of its own that is made unwritable, so creating the temporary next to
	/// it fails the way a permission error does in the field. The database is in the
	/// parent directory and stays writable, which is what keeps the refusal about the
	/// copy alone.
	#[cfg(unix)]
	#[test]
	fn a_copy_that_cannot_be_written_undoes_the_whole_import() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let legacy_dir = dir.join("legacy");
		fs::create_dir_all(&legacy_dir).expect("the legacy directory");
		let path = legacy_dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let source = fs::read(&path).expect("the legacy bytes");
		fs::set_permissions(&legacy_dir, fs::Permissions::from_mode(0o500)).expect("read only");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::Unpreserved);
		assert_eq!(
			stored_marker(&connection).expect("query"),
			None,
			"an import that preserved nothing decided anyway"
		);
		assert_nothing_landed(&connection);
		assert_eq!(fs::read(&path).expect("read"), source, "the source was touched");
		assert!(!preserved(&path).exists(), "a target was left behind by a copy that failed");

		fs::set_permissions(&legacy_dir, fs::Permissions::from_mode(0o700)).expect("cleanup mode");
		assert_no_temporaries(&legacy_dir);
		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A copy already there holding other bytes is another import's recovery material.
	/// Taking the name would destroy the only copy that import has left, so this one
	/// stops instead and says so — see [`accept_identical`].
	#[test]
	fn a_preserved_copy_of_another_import_is_never_traded_for_this_one() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let source = fs::read(&path).expect("the legacy bytes");
		fs::write(preserved(&path), "another import's source").expect("the copy already there");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::Unpreserved);
		assert_eq!(
			stored_marker(&connection).expect("query"),
			None,
			"an import that preserved nothing decided anyway"
		);
		assert_nothing_landed(&connection);
		assert_eq!(
			fs::read_to_string(preserved(&path)).expect("the copy"),
			"another import's source",
			"another import's copy was written over"
		);
		assert_eq!(fs::read(&path).expect("read"), source, "the source was touched");
		assert_no_temporaries(&dir);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The window the `exists` shortcut cannot cover: a target that appears after it
	/// looked and before the copy is installed. Calling the install step directly puts
	/// the test inside that window with no threads and nothing mocked — and
	/// `fs::rename` would have destroyed those bytes there, silently, which is why the
	/// install links instead.
	#[test]
	fn a_target_appearing_at_install_time_is_never_replaced() {
		let dir = temp_dir();
		let target = preserved(&dir.join(store::FILE_NAME));
		fs::write(&target, "another import's source").expect("the target that appeared");

		let refused = install_copy(&target, b"this import's source");

		assert!(refused.is_err(), "the install took a name that was already taken: {refused:?}");
		assert_eq!(
			fs::read_to_string(&target).expect("the target"),
			"another import's source",
			"the bytes that appeared under the install were destroyed"
		);
		assert_no_temporaries(&dir);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The same window, with the bytes this import was about to write already under the
	/// name: a boot that installed the copy and died before committing. The install has
	/// nothing left to do and says so, which is what carries the retry through.
	#[test]
	fn an_identical_target_appearing_at_install_time_is_accepted() {
		let dir = temp_dir();
		let target = preserved(&dir.join(store::FILE_NAME));
		let body: &[u8] = b"this import's source";
		fs::write(&target, body).expect("the target that appeared");

		let accepted = install_copy(&target, body);

		assert!(accepted.is_ok(), "the install refused its own bytes: {accepted:?}");
		assert_eq!(fs::read(&target).expect("the target"), body);
		assert_no_temporaries(&dir);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Half a copy is not a copy, however much of the source it happens to hold: the
	/// import is refused rather than allowed to commit against material nothing can
	/// restore from.
	#[test]
	fn a_half_written_copy_left_by_something_else_is_never_accepted() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let source = fs::read(&path).expect("the legacy bytes");
		fs::write(preserved(&path), &source[..source.len() / 2]).expect("half a copy");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::Unpreserved);
		assert_eq!(stored_marker(&connection).expect("query"), None);
		assert_nothing_landed(&connection);
		assert_eq!(
			fs::read(preserved(&path)).expect("the copy"),
			source[..source.len() / 2],
			"the half copy was completed or replaced"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The crash this ordering is built for: a boot installed the copy and died before
	/// it could commit. The next one finds no marker, reads the same snapshot, finds
	/// the same bytes already preserved and carries on from there.
	#[test]
	fn a_copy_this_import_had_already_installed_lets_the_retry_through() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let source = fs::read(&path).expect("the legacy bytes");
		fs::write(preserved(&path), &source).expect("the copy the crashed boot installed");

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, IMPORTED_SAMPLE, "the retry was refused its own copy");
		assert_eq!(stored_marker(&connection).expect("query").as_deref(), Some(MARKER_IMPORTED));
		assert_eq!(rows_in(&connection, "messages"), 7);
		assert_eq!(fs::read(preserved(&path)).expect("the copy"), source);
		assert_eq!(fs::read(&path).expect("read"), source, "the source was touched");
		assert_no_temporaries(&dir);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The second boot is the common one: the marker is there, so the file is not read
	/// and not one row is written a second time.
	#[test]
	fn a_boot_after_a_completed_import_reads_nothing_and_writes_nothing() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		let first = import(&mut connection, Some(&path));
		let landed = counts(&connection);

		let again = import(&mut connection, Some(&path));

		assert_eq!(first, IMPORTED_SAMPLE);
		assert_eq!(again, LegacyImport::AlreadyImported);
		assert_eq!(counts(&connection), landed, "a second boot wrote the transcript again");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The legacy writer is still live, and the file it saves after the import holds
	/// the conversation the app is having now. Migrating it a second time would
	/// duplicate a transcript the reader is already looking at.
	#[test]
	fn a_legacy_file_written_after_the_import_is_never_swept_in() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());
		import(&mut connection, Some(&path));
		let landed = counts(&connection);
		store::save(
			&path,
			&SessionSnapshot {
				session_id: Some("claude-2".into()),
				messages: vec![a_user_message("later", 90)],
				activities: Vec::new(),
			},
		);

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::AlreadyImported);
		assert_eq!(counts(&connection), landed, "the live conversation was migrated as history");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Activities with no message to sit behind still describe work that was done, so
	/// a turn is opened to hold them and the count says so.
	#[test]
	fn activities_with_no_messages_are_kept_under_a_turn_of_their_own() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &SessionSnapshot { messages: Vec::new(), ..sample() });

		let outcome = import(&mut connection, Some(&path));

		assert_eq!(outcome, LegacyImport::Imported { turns: 1, messages: 0, activities: 4 });
		let turns = turns_in(&connection);
		assert_eq!(turns.len(), 1);
		assert!(
			activities_in(&connection).iter().all(|activity| activity.turn_id == turns[0].id),
			"the activities were left with no turn to belong to"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// No path is not an empty transcript: nothing was examined, so nothing is
	/// decided and a later boot with a path still imports.
	#[test]
	fn a_boot_with_no_legacy_path_decides_nothing() {
		let dir = temp_dir();
		let mut connection = migrated(&dir);

		let outcome = import(&mut connection, None);

		assert_eq!(outcome, LegacyImport::Unavailable);
		assert_eq!(
			stored_marker(&connection).expect("query"),
			None,
			"a boot that examined nothing decided anyway"
		);
		assert_nothing_landed(&connection);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn the_preserved_copy_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let mut connection = migrated(&dir);
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());

		import(&mut connection, Some(&path));

		let mode = fs::metadata(preserved(&path)).expect("metadata").permissions().mode();
		assert_eq!(mode & 0o777, 0o600, "the transcript must not be world readable");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The import is part of opening the database rather than something a caller has
	/// to remember, and its outcome is read off the state the host manages.
	#[tokio::test]
	async fn opening_the_database_imports_the_legacy_snapshot_and_reports_it() {
		let dir = temp_dir();
		let path = dir.join(store::FILE_NAME);
		store::save(&path, &sample());

		let database = crate::db::open_with_legacy(&dir, &path);

		assert_eq!(database.legacy_import(), &IMPORTED_SAMPLE);
		assert_eq!(crate::db::count_of(&database, "messages").await, 7);
		assert!(preserved(&path).exists(), "the source was not preserved");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
