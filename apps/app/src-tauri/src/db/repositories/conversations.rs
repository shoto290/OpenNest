//! The durable chat a bot holds, and the bot itself: `conversations`,
//! `conversation_participants` and `bots`.
//!
//! The product shows one continuous chat per bot. There is no list, nothing to
//! create, rename, archive or pick between, so nothing here offers those: the
//! many-rowed concept underneath is the runtime sessions a chat is carried by,
//! not conversations a user ever sees. The one question this module answers is
//! which chat a bot has, and it answers it by the participant link rather than by
//! a singleton row — the bot is what the chat belongs to.
//!
//! The table names are the schema's, not the product's. `conversations` is
//! shipped and stays as it is; `Chat` is what the row means here, and the columns
//! the product no longer distinguishes are given a fixed value on the way in.
//!
//! Ids and moments are minted here rather than taken from a caller: two call
//! sites reading their own clock would disagree about which row came first, and
//! an id handed in is an id something outside this module could reuse.
//!
//! The one rule the file cannot state for itself lives in
//! [`ConversationError::IdentityConflict`]. Everything else SQLite already
//! refuses on its own.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use crate::db::{Access, DatabaseError};

/// The bot the app ships with. Fixed rather than generated: seeding has to
/// recognise its own work on the next launch, which a UUID minted at install time
/// would make impossible.
pub const DEFAULT_BOT_ID: &str = "default";
const DEFAULT_BOT_NAME: &str = "Claude";
/// A label the row carries, not a setting anything acts on: the host spawns
/// Claude Code without `--model` and lets it pick.
const DEFAULT_BOT_MODEL: &str = "sonnet";
/// The only role a participant takes today. It stays free text in the schema —
/// which words are allowed is this module's business, and the schema is shipped.
const PARTICIPANT_ROLE: &str = "assistant";
/// `conversations.title` is `NOT NULL` and the product has nowhere to show or
/// change a chat's title, so every chat is written under this one. It is not user
/// copy and nothing renames it.
const CHAT_TITLE: &str = "Chat";
/// `conversations.kind` is `CHECK`-constrained to two words the product no longer
/// tells apart. One of them has to be written, nothing here reads it back.
const CHAT_KIND: &str = "main";

/// What this module refuses that SQLite would have accepted. It stays here rather
/// than joining `DatabaseError`: it is not a database that went wrong, and a
/// caller reading it off the same enum as a poisoned connection would have no way
/// to tell a bug from a rule.
#[derive(Debug)]
pub enum ConversationError {
	Database(DatabaseError),
	/// A row already sits at an id this module writes by hand, and it does not say
	/// what this build would have written. Finding that id taken is no proof the
	/// seed wrote it — another build's row is another build's bot, and adopting it
	/// would run the chat on something nobody here agreed to. So it is refused and
	/// left as it was found, with both sides carried so the caller can say what
	/// disagreed instead of guessing which build wrote first.
	IdentityConflict {
		id: &'static str,
		field: &'static str,
		expected: String,
		stored: String,
	},
}

impl From<DatabaseError> for ConversationError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for ConversationError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

/// A row of `conversations`, under the name the product gives it. `title`, `kind`
/// and `archived_at` are not projected: they are columns the schema keeps and
/// this module writes blind or not at all.
#[derive(Debug, PartialEq, Eq)]
pub struct Chat {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
}

/// `role` is not projected for the same reason: every seat is written under
/// [`PARTICIPANT_ROLE`], so reading it back says nothing.
#[derive(Debug, PartialEq, Eq)]
pub struct Participant {
	pub conversation_id: String,
	pub bot_id: String,
	pub joined_at: i64,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Bot {
	pub id: String,
	pub name: String,
	pub model: String,
	pub created_at: i64,
}

pub struct ConversationsRepository {
	access: Access,
}

impl ConversationsRepository {
	/// Only the `db` module builds a repository: `Access` is what makes one able to
	/// reach the file, and it is not a capability the rest of the host may hand out.
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	/// The one way the queries below reach SQLite — see [`crate::db::Database::call`]
	/// for why the connection is only ever a closure's argument. Kept inside `db`:
	/// the rules this module holds are in the operations, and a caller writing
	/// `bots` or `conversations` through the raw seam would meet none of them.
	pub(in crate::db) async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub(in crate::db) async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	/// Idempotent by the primary key: a second call neither duplicates the bot nor
	/// rewrites what the first one wrote, and the row that is actually in the file
	/// is what comes back — unless it is not this build's, per
	/// [`ConversationError::IdentityConflict`].
	pub async fn ensure_default_bot(&self) -> Result<Bot, ConversationError> {
		self.call_mut(|connection| Ok(ensured_default_bot(connection))).await?
	}

	/// The rule above is the row's, not the write path's: a caller that only reads
	/// is owed the same refusal as one that seeds.
	pub async fn default_bot(&self) -> Result<Option<Bot>, ConversationError> {
		self.call(|connection| Ok(stored_default_bot(connection))).await?
	}

	/// The chat a bot holds, created on the first ask and handed back unchanged on
	/// every one after: the same id, the same moment, never rewritten. That is what
	/// makes it the durable place a transcript accumulates in.
	///
	/// The lookup goes through the participant link, so the chat belongs to the bot
	/// rather than to the app.
	pub async fn ensure_chat(&self, bot_id: String) -> Result<Chat, ConversationError> {
		self.call_mut(move |connection| Ok(ensured_chat(connection, &bot_id))).await?
	}

	pub async fn participants(
		&self,
		conversation_id: String,
	) -> Result<Vec<Participant>, DatabaseError> {
		self.call(move |connection| {
			let mut statement = connection.prepare(
				"SELECT conversation_id, bot_id, joined_at
					FROM conversation_participants
					WHERE conversation_id = ?1
					ORDER BY joined_at ASC, bot_id ASC",
			)?;
			let rows = statement.query_map([conversation_id], participant)?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}
}

const SELECT_BOT: &str = "SELECT id, name, model, created_at FROM bots WHERE id = ?1";

/// A bot holds one chat, and the participant link is what says which. The order
/// and the limit are for the case nothing here can create: a file that somehow
/// holds two must still answer the same one every time it is asked.
const SELECT_CHAT_OF_BOT: &str = "SELECT conversations.id,
		conversations.created_at, conversations.updated_at
	FROM conversations
	JOIN conversation_participants ON conversation_participants.conversation_id = conversations.id
	WHERE conversation_participants.bot_id = ?1
	ORDER BY conversations.created_at ASC, conversations.id ASC
	LIMIT 1";

/// The steady state is a row that already exists, and reading it needs no
/// transaction at all: the write lock is taken only once the first read comes back
/// empty. The read inside the transaction is the one that decides — between the
/// two, another connection may have written the very row this was about to.
fn ensured_default_bot(connection: &mut Connection) -> Result<Bot, ConversationError> {
	if let Some(stored) = stored_default_bot(connection)? {
		return Ok(stored);
	}
	let transaction = write_transaction(connection)?;
	let seeded = seed_default_bot(&transaction)?;
	transaction.commit()?;
	Ok(seeded)
}

fn stored_default_bot(connection: &Connection) -> Result<Option<Bot>, ConversationError> {
	let Some(stored) = connection.query_row(SELECT_BOT, [DEFAULT_BOT_ID], bot).optional()? else {
		return Ok(None);
	};
	verify_default_bot(&stored)?;
	Ok(Some(stored))
}

/// Same shape as [`ensured_default_bot`], for the same reason: every launch asks
/// for the chat, and all but the first find it.
fn ensured_chat(connection: &mut Connection, bot_id: &str) -> Result<Chat, ConversationError> {
	if let Some(held) = chat_of(connection, bot_id)? {
		return Ok(held);
	}
	let transaction = write_transaction(connection)?;
	let held = match chat_of(&transaction, bot_id)? {
		Some(found) => found,
		None => insert_chat(&transaction, bot_id)?,
	};
	transaction.commit()?;
	Ok(held)
}

fn chat_of(connection: &Connection, bot_id: &str) -> Result<Option<Chat>, ConversationError> {
	Ok(connection.query_row(SELECT_CHAT_OF_BOT, [bot_id], chat).optional()?)
}

/// Immediate rather than deferred wherever a read decides what is written next:
/// the write lock is taken on `BEGIN`, so nothing can land between the two.
fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

/// A chat is never member-less, so the seat is written in the same transaction as
/// the chat itself: a crash between the two would leave a thread nothing can
/// speak in.
///
/// Only the default bot is seeded on the way in: it is the one bot this build
/// owns, and its fixed id is the only one that can already be taken by another
/// build's row. A chat asked for any other bot needs that bot on the record
/// already, which the participant's foreign key is what enforces.
fn insert_chat(transaction: &Transaction<'_>, bot_id: &str) -> Result<Chat, ConversationError> {
	if bot_id == DEFAULT_BOT_ID {
		seed_default_bot(transaction)?;
	}
	let id = Uuid::new_v4().to_string();
	let at = now();
	let created = transaction.query_row(
		"INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?4)
			RETURNING id, created_at, updated_at",
		params![id, CHAT_KIND, CHAT_TITLE, at],
		chat,
	)?;
	transaction.execute(
		"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
			VALUES (?1, ?2, ?3, ?4)",
		params![created.id, bot_id, PARTICIPANT_ROLE, at],
	)?;
	Ok(created)
}

/// The only way the default bot is written, so no path can insert it without
/// meeting the check. Runs inside the caller's transaction: a refusal here takes
/// down whatever that transaction was in the middle of, which is what leaves the
/// file exactly as it was found.
fn seed_default_bot(transaction: &Transaction<'_>) -> Result<Bot, ConversationError> {
	transaction.execute(
		"INSERT OR IGNORE INTO bots (id, name, model, created_at) VALUES (?1, ?2, ?3, ?4)",
		params![DEFAULT_BOT_ID, DEFAULT_BOT_NAME, DEFAULT_BOT_MODEL, now()],
	)?;
	let stored = transaction.query_row(SELECT_BOT, [DEFAULT_BOT_ID], bot)?;
	verify_default_bot(&stored)?;
	Ok(stored)
}

/// What this build would have written, compared against what is there.
/// `created_at` is left out on purpose: it says when the row was written, not
/// which bot it is.
fn verify_default_bot(stored: &Bot) -> Result<(), ConversationError> {
	for (field, expected, found) in [
		("name", DEFAULT_BOT_NAME, stored.name.as_str()),
		("model", DEFAULT_BOT_MODEL, stored.model.as_str()),
	] {
		if expected != found {
			return Err(ConversationError::IdentityConflict {
				id: DEFAULT_BOT_ID,
				field,
				expected: expected.to_owned(),
				stored: found.to_owned(),
			});
		}
	}
	Ok(())
}

fn chat(row: &Row<'_>) -> rusqlite::Result<Chat> {
	Ok(Chat { id: row.get(0)?, created_at: row.get(1)?, updated_at: row.get(2)? })
}

fn participant(row: &Row<'_>) -> rusqlite::Result<Participant> {
	Ok(Participant { conversation_id: row.get(0)?, bot_id: row.get(1)?, joined_at: row.get(2)? })
}

fn bot(row: &Row<'_>) -> rusqlite::Result<Bot> {
	Ok(Bot { id: row.get(0)?, name: row.get(1)?, model: row.get(2)?, created_at: row.get(3)? })
}

/// Unix millis, the unit the schema stores. A clock behind the epoch answers zero
/// rather than an error: it is not a reason to refuse the write it is part of.
fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};

	/// A bot the repository did not write, so a build with another idea of what
	/// lives at an id can be put in the file and the seed made to meet it.
	async fn insert_bot(
		database: &Database,
		id: &'static str,
		name: &'static str,
		model: &'static str,
	) -> Bot {
		database
			.conversations()
			.call(move |connection| {
				let written = Bot {
					id: id.to_owned(),
					name: name.to_owned(),
					model: model.to_owned(),
					created_at: 1,
				};
				connection.execute(
					"INSERT INTO bots (id, name, model, created_at) VALUES (?1, ?2, ?3, ?4)",
					params![written.id, written.name, written.model, written.created_at],
				)?;
				Ok(written)
			})
			.await
			.expect("the bot is inserted")
	}

	/// A conflict is only useful if it says what disagreed, so every field of it is
	/// asserted rather than the variant alone. Generic over what the refused call
	/// would have returned: the same rule guards the bot and the chat seated by it.
	fn assert_conflict<T: std::fmt::Debug>(
		outcome: &Result<T, ConversationError>,
		mismatched: &str,
		wanted: &str,
		found: &str,
	) {
		assert!(
			matches!(
				outcome,
				Err(ConversationError::IdentityConflict { id, field, expected, stored })
					if *id == DEFAULT_BOT_ID
						&& *field == mismatched
						&& expected.as_str() == wanted
						&& stored.as_str() == found
			),
			"the call answered something other than a conflict on {mismatched}: {outcome:?}"
		);
	}

	/// A refusal must cost nothing at all: not the chat, not the seat that would
	/// have been written with it, and not the bot the refusal was about.
	async fn assert_nothing_landed(database: &Database, stored: &Bot) {
		assert_eq!(
			count_of(database, "conversations").await,
			0,
			"a refused chat was written anyway"
		);
		assert_eq!(
			count_of(database, "conversation_participants").await,
			0,
			"a refused chat left a seat behind"
		);
		assert_eq!(
			stored_bot(database).await.as_ref(),
			Some(stored),
			"a refusal rewrote the row it was refused over"
		);
	}

	/// Reads the row past the rule `default_bot` applies: after a conflict, what is
	/// in the file is exactly what the assertion is about.
	async fn stored_bot(database: &Database) -> Option<Bot> {
		database
			.conversations()
			.call(|connection| {
				Ok(connection.query_row(SELECT_BOT, [DEFAULT_BOT_ID], bot).optional()?)
			})
			.await
			.expect("query")
	}

	/// A launch on a fresh file asks before anything has been written, and neither
	/// answer may be invented: the bot is not seeded by opening either.
	#[tokio::test]
	async fn a_database_nobody_has_written_to_has_no_bot_and_no_participants() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		assert_eq!(repository.default_bot().await.expect("the bot"), None);
		assert!(repository.participants("missing".into()).await.expect("participants").is_empty());

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Every launch seeds, so all but the first find the row already there: as long
	/// as it says what this build would have written, the second call must neither
	/// add a bot, rewrite the one it finds, nor refuse it.
	#[tokio::test]
	async fn seeding_the_default_bot_again_leaves_the_row_the_first_seed_wrote() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let first = repository.ensure_default_bot().await.expect("the default bot");
		let second = repository.ensure_default_bot().await.expect("the default bot");

		assert_eq!(first, second, "a second seed rewrote the bot");
		assert_eq!(first.id, DEFAULT_BOT_ID);
		assert_eq!(first.name, DEFAULT_BOT_NAME);
		assert_eq!(first.model, DEFAULT_BOT_MODEL);
		assert_eq!(count_of(&database, "bots").await, 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The seed meeting another build's bot — see
	/// [`ConversationError::IdentityConflict`].
	#[tokio::test]
	async fn a_stored_default_bot_under_another_name_makes_the_seed_conflict() {
		let dir = temp_dir();
		let database = open(&dir);
		let stored = insert_bot(&database, DEFAULT_BOT_ID, "Someone else", DEFAULT_BOT_MODEL).await;

		let refused = database.conversations().ensure_default_bot().await;

		assert_conflict(&refused, "name", DEFAULT_BOT_NAME, "Someone else");
		assert_nothing_landed(&database, &stored).await;

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The same rule on the other field the row is known by: the model a bot answers
	/// under is part of which bot it is.
	#[tokio::test]
	async fn a_stored_default_bot_on_another_model_makes_the_seed_conflict() {
		let dir = temp_dir();
		let database = open(&dir);
		let stored = insert_bot(&database, DEFAULT_BOT_ID, DEFAULT_BOT_NAME, "opus").await;

		let refused = database.conversations().ensure_default_bot().await;

		assert_conflict(&refused, "model", DEFAULT_BOT_MODEL, "opus");
		assert_nothing_landed(&database, &stored).await;

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Reading is not a way around the rule: a caller that never seeds would
	/// otherwise be handed another build's bot as a plain answer.
	#[tokio::test]
	async fn reading_the_default_bot_refuses_another_builds_row_just_as_seeding_does() {
		let dir = temp_dir();
		let database = open(&dir);
		let stored = insert_bot(&database, DEFAULT_BOT_ID, "Someone else", DEFAULT_BOT_MODEL).await;

		let refused = database.conversations().default_bot().await;

		assert_conflict(&refused, "name", DEFAULT_BOT_NAME, "Someone else");
		assert_nothing_landed(&database, &stored).await;

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Asking for the chat seeds the bot it seats, so it meets the same refusal:
	/// letting it through here would be worse than the seed letting it through,
	/// since the chat would come back looking written while its only member is a bot
	/// this build never agreed to.
	#[tokio::test]
	async fn a_chat_asked_for_against_a_default_bot_under_another_name_is_refused_whole() {
		let dir = temp_dir();
		let database = open(&dir);
		let stored = insert_bot(&database, DEFAULT_BOT_ID, "Someone else", DEFAULT_BOT_MODEL).await;

		let refused = database.conversations().ensure_chat(DEFAULT_BOT_ID.into()).await;

		assert_conflict(&refused, "name", DEFAULT_BOT_NAME, "Someone else");
		assert_nothing_landed(&database, &stored).await;

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The other field, through the chat rather than through the seed: both paths
	/// reach the same rule, and both must leave the same nothing behind.
	#[tokio::test]
	async fn a_chat_asked_for_against_a_default_bot_on_another_model_is_refused_whole() {
		let dir = temp_dir();
		let database = open(&dir);
		let stored = insert_bot(&database, DEFAULT_BOT_ID, DEFAULT_BOT_NAME, "opus").await;

		let refused = database.conversations().ensure_chat(DEFAULT_BOT_ID.into()).await;

		assert_conflict(&refused, "model", DEFAULT_BOT_MODEL, "opus");
		assert_nothing_landed(&database, &stored).await;

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The whole point of the chat being durable: every ask after the first is the
	/// same row, seated by the same participant, and the transcript a later step
	/// hangs off it has one place to be.
	#[tokio::test]
	async fn asking_for_the_chat_again_gives_back_the_one_the_bot_already_has() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let first = repository.ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the chat");
		let again = repository.ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the same chat");

		assert_eq!(first, again, "a second ask minted another chat");
		assert_eq!(count_of(&database, "conversations").await, 1);
		let seats = repository.participants(first.id).await.expect("the participants");
		assert_eq!(seats.len(), 1, "the chat was left with nobody in it");
		assert_eq!(seats[0].bot_id, DEFAULT_BOT_ID);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The launch this module exists for: the chat a bot had before the app closed
	/// is the one it is handed when the file is opened again, down to the id and the
	/// moment it was created.
	#[tokio::test]
	async fn the_chat_a_bot_has_is_the_same_one_after_the_file_is_reopened() {
		let dir = temp_dir();
		let before = {
			let database = open(&dir);
			let repository = database.conversations();
			repository.ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the chat")
		};

		let database = open(&dir);
		let after =
			database.conversations().ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the chat");

		assert_eq!(after, before, "reopening the file minted another chat");
		assert_eq!(count_of(&database, "conversations").await, 1);
		assert_eq!(count_of(&database, "conversation_participants").await, 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
