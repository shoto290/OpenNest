//! The local SQLite database that will hold the conversations.
//!
//! Opening and migrating happen once, at launch, and the outcome is managed as a
//! whole: a file that cannot be opened or migrated must not stop the host from
//! starting, and whoever asks for the database later has to be told there is none
//! rather than handed a half-migrated one. Nothing reads or writes rows yet — the
//! repositories below are the seams the conversation features are built on.
//!
//! Every one of those seams reaches the file through [`Access`] and nothing else:
//! the connection is a `Mutex` no name outside this module can reach, and the
//! lock is taken inside a blocking task rather than on an async worker. That is
//! the whole reason the boundary exists. `rusqlite` is synchronous, and a
//! statement waiting on a busy file would otherwise stall every other task
//! sharing that thread — the event stream carrying a Claude turn included.

pub mod bootstrap;
pub mod connection;
pub mod migrations;
pub mod repositories;

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::{AppHandle, Runtime};

use bootstrap::LegacyImport;
pub use connection::DatabaseError;
use repositories::{ConversationsRepository, MessagesRepository, RuntimeContextRepository};

/// One connection, shared: SQLite serializes writers anyway, and a desktop host
/// with a single window has no read concurrency to win by opening more.
///
/// Private to this module, and handed out only as a closure's argument: a caller
/// holding the `Connection` itself could keep it across an `await`, which is the
/// stall the blocking task below exists to prevent.
#[derive(Clone)]
struct Access {
	connection: Arc<Mutex<Connection>>,
}

impl Access {
	fn new(connection: Connection) -> Self {
		Self { connection: Arc::new(Mutex::new(connection)) }
	}

	async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		let connection = self.connection.clone();
		tokio::task::spawn_blocking(move || {
			let connection = locked(&connection)?;
			f(&connection)
		})
		.await
		.map_err(|_| DatabaseError::CallInterrupted)?
	}

	async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		let connection = self.connection.clone();
		tokio::task::spawn_blocking(move || {
			let mut connection = locked(&connection)?;
			f(&mut connection)
		})
		.await
		.map_err(|_| DatabaseError::CallInterrupted)?
	}
}

/// The lock is taken here, inside the blocking task, and never by the caller: on
/// an async worker it would block the thread the runtime needs to make progress.
/// A poisoned lock is reported rather than unwrapped — the call that panicked
/// under it may have left a statement half-run, and a panic of our own would take
/// the host down with it.
fn locked(
	connection: &Arc<Mutex<Connection>>,
) -> Result<MutexGuard<'_, Connection>, DatabaseError> {
	connection.lock().map_err(|_| DatabaseError::PoisonedConnection)
}

/// What the host manages. `Err` is a first-class outcome, kept so the failure can
/// be read off the state instead of crashing the launch.
pub type DatabaseState = Result<Database, DatabaseError>;

pub struct Database {
	access: Access,
	conversations: ConversationsRepository,
	messages: MessagesRepository,
	runtime_context: RuntimeContextRepository,
	legacy_import: LegacyImport,
}

impl Database {
	/// The legacy snapshot is imported here, straight after migrating and before
	/// [`Access`] exists: the schema it writes into is installed, and the connection
	/// is still exclusively this call's, so the import needs no lock and no runtime.
	/// Its failures are outcomes rather than errors — the host boots without the
	/// migration just as it boots without the database.
	fn open(path: &Path, legacy: Option<&Path>) -> DatabaseState {
		let mut connection = connection::open(path)?;
		migrations::apply(&mut connection)?;
		let legacy_import = bootstrap::import(&mut connection, legacy);
		let access = Access::new(connection);
		Ok(Self {
			conversations: ConversationsRepository::new(access.clone()),
			messages: MessagesRepository::new(access.clone()),
			runtime_context: RuntimeContextRepository::new(access.clone()),
			legacy_import,
			access,
		})
	}

	/// Reads. The closure runs on a blocking thread, so nothing it waits on is
	/// waited on by the runtime.
	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	/// Writes that are one unit: `Connection::transaction` needs `&mut`, so this is
	/// the only way a multi-statement change either lands whole or leaves nothing.
	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub fn conversations(&self) -> &ConversationsRepository {
		&self.conversations
	}

	pub fn messages(&self) -> &MessagesRepository {
		&self.messages
	}

	pub fn runtime_context(&self) -> &RuntimeContextRepository {
		&self.runtime_context
	}

	/// What the launch that opened this file did about the legacy `session.json`. Read
	/// off the state like everything else here: it happened once, before anything
	/// could ask.
	pub fn legacy_import(&self) -> &LegacyImport {
		&self.legacy_import
	}
}

pub fn bootstrap<R: Runtime>(app: &AppHandle<R>) -> DatabaseState {
	Database::open(&connection::file(app)?, crate::claude::store::file(app).as_deref())
}

/// Every test module under `db` opens a database the same way, on a directory of
/// its own from [`connection::temp_dir`]. Lives here rather than in each of them
/// because `Database::open` is private to this module.
///
/// No legacy path: an import is a boot step of its own, and the tests around it are
/// the ones that ask for it.
#[cfg(test)]
pub(in crate::db) fn open(dir: &Path) -> Database {
	Database::open(&dir.join(connection::FILE_NAME), None).expect("the database opens")
}

#[cfg(test)]
pub(in crate::db) fn open_with_legacy(dir: &Path, legacy: &Path) -> Database {
	Database::open(&dir.join(connection::FILE_NAME), Some(legacy)).expect("the database opens")
}

/// Counting rows is how those modules check that a write landed, or that a
/// refused one left nothing behind. The table is a literal, never a value from
/// outside: it is interpolated, not bound.
#[cfg(test)]
pub(in crate::db) async fn count_of(database: &Database, table: &'static str) -> u32 {
	database
		.call(move |connection| {
			Ok(connection
				.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))?)
		})
		.await
		.expect("query")
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::atomic::{AtomicU64, Ordering};
	use std::time::Duration;

	use super::connection::{is_busy, temp_dir, FILE_NAME};
	use super::*;

	/// Short enough to keep the test quick, long enough to be several heartbeats.
	const CONTENDED_TIMEOUT: Duration = Duration::from_millis(300);
	const HEARTBEAT: Duration = Duration::from_millis(10);
	/// Well under what the timeout above has room for: the assertion is that the
	/// runtime kept running, not how fast the machine is.
	const MINIMUM_BEATS: u64 = 5;
	/// Only ever reached by a call that hangs, which is the failure this proves
	/// impossible — so it is long enough to be nobody's flake.
	const DEADLINE: Duration = Duration::from_secs(10);

	async fn version(database: &Database) -> u32 {
		database.call(migrations::version).await.expect("version")
	}

	async fn journal_mode(database: &Database) -> String {
		database
			.call(|connection| {
				Ok(connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?)
			})
			.await
			.expect("journal mode")
	}

	async fn object_count(database: &Database) -> u32 {
		database
			.call(|connection| {
				Ok(connection
					.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0))?)
			})
			.await
			.expect("query")
	}

	const A_CONVERSATION: &str =
		"INSERT INTO conversations (id, kind, title, created_at, updated_at)
		VALUES ('c1', 'main', 'First', 1, 1)";

	#[tokio::test]
	async fn a_fresh_path_becomes_a_database_at_the_latest_version() {
		let dir = temp_dir();

		let database = open(&dir);

		assert!(dir.join(FILE_NAME).exists(), "no file was created");
		assert_eq!(version(&database).await, migrations::latest_version());
		assert_eq!(
			journal_mode(&database).await,
			"wal",
			"a crash mid-write would cost the whole file"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The second launch is the common one, and the schema it finds is already
	/// there: the steps must recognise their own work and do nothing.
	#[tokio::test]
	async fn reopening_leaves_the_schema_and_the_version_as_they_were() {
		let dir = temp_dir();
		let first = open(&dir);
		let version_after_install = version(&first).await;
		let objects_after_install = object_count(&first).await;
		drop(first);

		let second = open(&dir);

		assert_eq!(version(&second).await, version_after_install, "a step ran twice");
		assert_eq!(
			object_count(&second).await,
			objects_after_install,
			"reopening duplicated an object"
		);

		drop(second);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The guarantee the whole boundary exists for, and the one a raw
	/// `lock()` on an async worker would break silently: the heartbeat is a task
	/// with nothing to do but tick, and it has to keep ticking while a call sits on
	/// a file somebody else holds. `#[tokio::test]` gives the runtime a single
	/// async thread on purpose — synchronous SQLite work running there would starve
	/// the heartbeat outright, so the beats below are what tells the two apart.
	#[tokio::test]
	async fn a_call_waiting_on_the_file_leaves_the_runtime_free() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call(|connection| Ok(connection.busy_timeout(CONTENDED_TIMEOUT)?))
			.await
			.expect("busy timeout");
		let holder = connection::open(&dir.join(FILE_NAME)).expect("a second connection");
		holder.execute_batch("BEGIN EXCLUSIVE;").expect("the write lock is held");

		let beats = Arc::new(AtomicU64::new(0));
		let heartbeat = tokio::spawn({
			let beats = beats.clone();
			async move {
				loop {
					tokio::time::sleep(HEARTBEAT).await;
					beats.fetch_add(1, Ordering::Relaxed);
				}
			}
		});

		let blocked = tokio::time::timeout(
			DEADLINE,
			database.call_mut(|connection| {
				let transaction = connection.transaction()?;
				transaction.execute(A_CONVERSATION, [])?;
				transaction.commit()?;
				Ok(())
			}),
		)
		.await;
		heartbeat.abort();

		let refused =
			blocked.expect("the call never came back").expect_err("the write was accepted");
		assert!(is_busy(&refused), "the contended write failed as something else: {refused:?}");
		assert!(
			beats.load(Ordering::Relaxed) >= MINIMUM_BEATS,
			"the runtime was held by a database call: {} beats",
			beats.load(Ordering::Relaxed)
		);

		drop(holder);
		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// What `call_mut` is for: the two rows are one change, and the second attempt
	/// trips on the turn's seq after having already written the conversation.
	#[tokio::test]
	async fn a_write_spanning_two_statements_lands_whole_or_not_at_all() {
		let dir = temp_dir();
		let database = open(&dir);

		let landed = database
			.call_mut(|connection| {
				let transaction = connection.transaction()?;
				transaction.execute(A_CONVERSATION, [])?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t1', 'c1', 1, 1)",
					[],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await;

		assert!(landed.is_ok(), "a transaction of two good statements was refused: {landed:?}");
		assert_eq!(count_of(&database, "turns").await, 1);

		let torn = database
			.call_mut(|connection| {
				let transaction = connection.transaction()?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t2', 'c1', 2, 2)",
					[],
				)?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t3', 'c1', 2, 3)",
					[],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await;

		assert!(torn.is_err(), "two turns took the same seq");
		assert_eq!(count_of(&database, "turns").await, 1, "half a transaction stayed behind");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A panic under the lock is reported twice over — once to the caller that
	/// caused it, then to every caller after it — and never as a panic of the
	/// host's own: the connection is shared, and what a half-run statement left is
	/// not knowable from here.
	#[tokio::test]
	async fn a_call_that_panics_is_reported_instead_of_taking_the_host_down() {
		let dir = temp_dir();
		let database = open(&dir);

		let interrupted: Result<(), DatabaseError> =
			database.call(|_| panic!("a query gave up under the lock")).await;
		let after = database.call(migrations::version).await;

		assert!(
			matches!(interrupted, Err(DatabaseError::CallInterrupted)),
			"a panicking call answered something else: {interrupted:?}"
		);
		assert!(
			matches!(after, Err(DatabaseError::PoisonedConnection)),
			"a call after a panic was served from a connection nobody vouches for: {after:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn the_database_file_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let database = open(&dir);

		let mode = fs::metadata(dir.join(FILE_NAME)).expect("metadata").permissions().mode();
		assert_eq!(mode & 0o777, 0o600, "the transcript must not be world readable");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
