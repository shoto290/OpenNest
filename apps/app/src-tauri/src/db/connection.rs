//! Opens the one SQLite file the app owns, in the shape every query expects.
//!
//! Most of the settings below are per-connection, not per-database: SQLite starts
//! every connection with foreign keys off and no busy timeout, so a build that
//! sets them once at install time would enforce nothing on the next launch. They
//! are therefore part of opening, not part of migrating. The file is created
//! `0600` for the same reason `session.json` is: the transcript reaches the disk
//! as plain text.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

pub const FILE_NAME: &str = "conversations.sqlite3";

/// How long a write waits for whoever holds the file before giving up. Finite on
/// purpose: an unbounded wait would hold the blocking task issuing the write for
/// as long as the other writer keeps the lock, and a caller is owed a refusal it
/// can report rather than a call that never comes back.
const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

/// Why the database is unusable, kept apart from a ready one so the host can
/// boot without it and still say what went wrong.
#[derive(Debug)]
pub enum DatabaseError {
	AppDataDir,
	/// The journal mode SQLite answered with, when it is not WAL.
	JournalMode(String),
	/// A call panicked while holding the connection, so what the next one would
	/// find is unknown.
	PoisonedConnection,
	/// The blocking task carrying a call never delivered its result.
	CallInterrupted,
	/// A write the row it names has already moved past. Kept apart from a busy file
	/// and from a row that is simply not there: those are worth another attempt,
	/// while this one is the answer — somebody else recorded the ending first, and
	/// the caller is late rather than unlucky.
	Conflict,
	Sqlite(rusqlite::Error),
}

impl From<rusqlite::Error> for DatabaseError {
	fn from(error: rusqlite::Error) -> Self {
		DatabaseError::Sqlite(error)
	}
}

/// `app_data_dir()` only computes a path, so the directory is created here: on a
/// fresh install the open below would otherwise fail. This is the one place that
/// creates it, so `open` is handed a directory that already exists.
pub fn file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, DatabaseError> {
	let dir = app.path().app_data_dir().map_err(|_| DatabaseError::AppDataDir)?;
	fs::create_dir_all(&dir).map_err(|_| DatabaseError::AppDataDir)?;
	Ok(dir.join(FILE_NAME))
}

/// Expects the parent directory to exist: `file` above owns creating it.
pub fn open(path: &Path) -> Result<Connection, DatabaseError> {
	let connection = Connection::open(path)?;
	restrict_to_owner(path).map_err(|_| DatabaseError::AppDataDir)?;
	connection.pragma_update(None, "foreign_keys", "ON")?;
	connection.busy_timeout(BUSY_TIMEOUT)?;
	// `journal_mode` answers with the mode it settled on, so it cannot go through
	// the plain update: rusqlite refuses a statement that returns rows.
	connection.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
	require_wal(&connection)?;
	Ok(connection)
}

/// A journal mode SQLite cannot grant is answered with the one it kept instead of
/// an error, so the mode is read back rather than assumed: outside WAL a crash
/// mid-write costs the whole file, and that is not a database to hand out.
fn require_wal(connection: &Connection) -> Result<(), DatabaseError> {
	let mode: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
	if !mode.eq_ignore_ascii_case("wal") {
		return Err(DatabaseError::JournalMode(mode));
	}
	Ok(())
}

/// The mode is set through the path, not through a handle this call does not own,
/// and before WAL is switched on: SQLite gives the `-wal` and `-shm` siblings it
/// then creates the mode the database file already carries.
#[cfg(unix)]
fn restrict_to_owner(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) -> std::io::Result<()> {
	Ok(())
}

/// A directory of its own per test: `cargo test` runs a binary's tests in
/// parallel, and they would otherwise share one file. Lives here because `open`
/// is what every test module around the database already imports.
#[cfg(test)]
pub fn temp_dir() -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-db-{}", uuid::Uuid::new_v4()));
	fs::create_dir_all(&dir).expect("temp dir");
	dir
}

/// Contention has no variant of its own — it is what SQLite reports, not what the
/// host decides — so the code is read off the error rather than matched on a
/// shape of ours. Lives beside `temp_dir` for the same reason.
#[cfg(test)]
pub fn is_busy(error: &DatabaseError) -> bool {
	matches!(
		error,
		DatabaseError::Sqlite(rusqlite::Error::SqliteFailure(code, _))
			if code.code == rusqlite::ErrorCode::DatabaseBusy
	)
}

#[cfg(test)]
mod tests {
	use std::time::Instant;

	use super::*;

	const SHORT_TIMEOUT: Duration = Duration::from_millis(50);
	/// Generous next to the timeout above: the assertion is that the wait is
	/// bounded by it, not that it is quick.
	const GIVES_UP_WITHIN: Duration = Duration::from_secs(2);

	/// The point of a finite timeout: the second writer comes back with something
	/// to report. An unbounded one would leave this test hanging instead of
	/// failing, which is exactly what the production default must not do either.
	#[test]
	fn a_write_the_file_is_busy_for_gives_up_instead_of_waiting_forever() {
		let dir = temp_dir();
		let holder = open(&dir.join(FILE_NAME)).expect("open");
		let contender = open(&dir.join(FILE_NAME)).expect("open");
		contender.busy_timeout(SHORT_TIMEOUT).expect("busy timeout");
		holder.execute_batch("BEGIN EXCLUSIVE;").expect("the write lock is held");

		let started = Instant::now();
		let refused = contender.execute_batch("CREATE TABLE contended (id TEXT PRIMARY KEY);");

		let error = DatabaseError::from(refused.expect_err("a contended write was accepted"));
		assert!(
			is_busy(&error),
			"a contended write failed as something other than busy: {error:?}"
		);
		assert!(started.elapsed() < GIVES_UP_WITHIN, "the wait outlived the timeout it was given");

		drop(contender);
		drop(holder);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// An in-memory database cannot be in WAL, which makes it the honest negative:
	/// the mode it reports is the one the check has to refuse to open on.
	#[test]
	fn a_connection_that_is_not_in_wal_is_refused_by_its_own_mode() {
		let connection = Connection::open_in_memory().expect("in memory");

		let refused = require_wal(&connection);

		assert!(
			matches!(&refused, Err(DatabaseError::JournalMode(mode)) if mode == "memory"),
			"the check accepted a journal a crash mid-write would cost: {refused:?}"
		);
	}
}
