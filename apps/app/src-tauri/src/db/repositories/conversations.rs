//! The durable chat a bot holds, and the bot itself: `conversations`,
//! `conversation_participants` and `bots`.
//!
//! The product shows one continuous chat per bot, and a bot is what a user makes,
//! describes and throws away. So bots are listed, written and deleted here while
//! chats still are not: the chat is not a thing anyone picks between — it is the
//! one thread its bot has, created with it and gone with it. That is also why
//! creating a bot writes the chat and the seat in the same transaction: a bot with
//! no thread would be a row nothing could ever be said to.
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
//! [`ConversationError::UnknownBot`]. Everything else SQLite already refuses on
//! its own — the eight animals and the eight poses included, which the
//! vocabularies below and the `CHECK` on those two columns spell the same way on
//! purpose. [`BotModel`] is the vocabulary without a `CHECK` behind it: the column
//! is shipped as free text, and adding one to it would mean rebuilding a table
//! three foreign keys point at. The boundary refuses an unknown label first, and
//! nothing else writes here.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::messages::stored_as_text;
use crate::db::{Access, DatabaseError};

/// The bot the app ships with. Fixed rather than generated: seeding has to
/// recognise its own work on the next launch, which a UUID minted at install time
/// would make impossible.
pub const DEFAULT_BOT_ID: &str = "default";
const DEFAULT_BOT_NAME: &str = "Claude";
/// What a bot is seeded on. Which model a bot answers under is a user's to change
/// from there — see [`BotModel`].
const DEFAULT_BOT_MODEL: BotModel = BotModel::Sonnet;
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

/// The model labels the host accepts, which are Claude Code's own aliases: the
/// column holds one of these three words or the row is not one this build wrote.
/// Nothing is passed to the process today — the host spawns Claude Code without
/// `--model` — but which model a bot answers under is the user's choice, so it is
/// stored as a closed vocabulary rather than as free text a typo could enter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BotModel {
	Opus,
	Sonnet,
	Haiku,
}

impl BotModel {
	fn as_sql(self) -> &'static str {
		match self {
			BotModel::Opus => "opus",
			BotModel::Sonnet => "sonnet",
			BotModel::Haiku => "haiku",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"opus" => Some(BotModel::Opus),
			"sonnet" => Some(BotModel::Sonnet),
			"haiku" => Some(BotModel::Haiku),
			_ => None,
		}
	}
}

/// The eight animals the avatar engine draws, and the only ones a row may hold.
/// The words are the engine's own, so a face read out of the file names a shape
/// the UI already has: a ninth animal would be a bot nothing could draw.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl AvatarAnimal {
	fn as_sql(self) -> &'static str {
		match self {
			AvatarAnimal::Cat => "cat",
			AvatarAnimal::Rabbit => "rabbit",
			AvatarAnimal::Bear => "bear",
			AvatarAnimal::Chick => "chick",
			AvatarAnimal::Dog => "dog",
			AvatarAnimal::Mouse => "mouse",
			AvatarAnimal::Owl => "owl",
			AvatarAnimal::Koala => "koala",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"cat" => Some(AvatarAnimal::Cat),
			"rabbit" => Some(AvatarAnimal::Rabbit),
			"bear" => Some(AvatarAnimal::Bear),
			"chick" => Some(AvatarAnimal::Chick),
			"dog" => Some(AvatarAnimal::Dog),
			"mouse" => Some(AvatarAnimal::Mouse),
			"owl" => Some(AvatarAnimal::Owl),
			"koala" => Some(AvatarAnimal::Koala),
			_ => None,
		}
	}
}

/// The eight poses a bot is identified by, out of the many states the engine can
/// animate. These are the ones a user picks to say who the bot is; the rest are
/// the runtime's — what a bot is doing right now is not stored at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AvatarPose {
	Idle,
	Happy,
	Curious,
	Proud,
	Shy,
	Playful,
	Bored,
	Sleeping,
}

impl AvatarPose {
	fn as_sql(self) -> &'static str {
		match self {
			AvatarPose::Idle => "idle",
			AvatarPose::Happy => "happy",
			AvatarPose::Curious => "curious",
			AvatarPose::Proud => "proud",
			AvatarPose::Shy => "shy",
			AvatarPose::Playful => "playful",
			AvatarPose::Bored => "bored",
			AvatarPose::Sleeping => "sleeping",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"idle" => Some(AvatarPose::Idle),
			"happy" => Some(AvatarPose::Happy),
			"curious" => Some(AvatarPose::Curious),
			"proud" => Some(AvatarPose::Proud),
			"shy" => Some(AvatarPose::Shy),
			"playful" => Some(AvatarPose::Playful),
			"bored" => Some(AvatarPose::Bored),
			"sleeping" => Some(AvatarPose::Sleeping),
			_ => None,
		}
	}
}

stored_as_text!(BotModel);
stored_as_text!(AvatarAnimal);
stored_as_text!(AvatarPose);

/// What the bot the app ships with is given when the step that added a face runs
/// over it, and what a caller gets nowhere else: every other bot arrives with a
/// face of its own.
const DEFAULT_BOT_ANIMAL: AvatarAnimal = AvatarAnimal::Cat;
const DEFAULT_BOT_POSE: AvatarPose = AvatarPose::Idle;

/// What this module refuses that SQLite would have accepted. It stays here rather
/// than joining `DatabaseError`: it is not a database that went wrong, and a
/// caller reading it off the same enum as a poisoned connection would have no way
/// to tell a bug from a rule.
#[derive(Debug)]
pub enum ConversationError {
	Database(DatabaseError),
	/// A write named a bot the file does not hold. SQLite answers a `WHERE` that
	/// matches nothing with success and no rows, which is the one refusal a caller
	/// must not be told twice about: an update that changed nothing and a delete
	/// that removed nothing are the same fact, and it is that the bot is gone.
	UnknownBot {
		id: String,
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

/// `instructions` and `memory` are what the bot brings to a context rebuilt for
/// it. Both are empty until something says otherwise, and empty is a part a
/// context leaves out rather than a value it prints. Neither is part of
/// [`BotIdentity`]: they are what the bot was told, not who it is, and no write
/// here touches them.
#[derive(Debug, PartialEq, Eq)]
pub struct Bot {
	pub id: String,
	pub name: String,
	pub title: String,
	pub description: String,
	pub model: BotModel,
	pub avatar_animal: AvatarAnimal,
	pub avatar_pose: AvatarPose,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	pub memory: String,
	pub created_at: i64,
}

/// Who a bot is, as the one thing a caller submits: [`ConversationsRepository::create_bot`]
/// writes it under an id it mints, [`ConversationsRepository::update_bot`] writes
/// it over the one it names. Whole rather than field by field — a partial write
/// would have to tell "leave this alone" from "clear this", which for the two
/// nullable columns is a distinction no wire shape carries for free.
///
/// `model` is in here because a bot is moved between models from its own settings.
/// `created_at` is not, and neither are `instructions` and `memory`: the first is
/// when the row was written, the other two are what the bot was told, and none of
/// the three is who it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BotIdentity {
	pub name: String,
	pub title: String,
	pub description: String,
	pub model: BotModel,
	pub avatar_animal: AvatarAnimal,
	pub avatar_pose: AvatarPose,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
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
	/// is what comes back — including every change a user has made to it since,
	/// which is all of it.
	pub async fn ensure_default_bot(&self) -> Result<Bot, ConversationError> {
		self.call_mut(|connection| Ok(ensured_default_bot(connection))).await?
	}

	/// The same row, read and never seeded.
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

	/// Any bot by its id, read and not seeded: a context is rebuilt for the bot a
	/// participant names, which is not always the one this build ships. `None` is a
	/// bot the file does not hold, and the caller says what that means for it.
	pub async fn bot(&self, id: String) -> Result<Option<Bot>, ConversationError> {
		Ok(self
			.call(move |connection| Ok(connection.query_row(SELECT_BOT, [id], bot).optional()?))
			.await?)
	}

	/// Every bot on the record, oldest first. The id breaks a tie between two
	/// written in the same millisecond, so a list rendered twice is in the same
	/// order both times.
	pub async fn bots(&self) -> Result<Vec<Bot>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached(SELECT_BOTS)?;
			let rows = statement.query_map([], bot)?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	/// A bot and the chat it will be spoken to in, written together: a bot with no
	/// thread is a row the product has nowhere to show, so the two land as one unit
	/// or neither does.
	pub async fn create_bot(&self, identity: BotIdentity) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(created_bot(connection, &identity))).await?
	}

	/// Who the bot is, replaced whole — see [`BotIdentity`]. What it was told and
	/// what it has said are untouched: `instructions`, `memory` and the transcript
	/// belong to the bot across every rename it lives through.
	pub async fn update_bot(
		&self,
		id: String,
		identity: BotIdentity,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(updated_bot(connection, &id, &identity))).await?
	}

	/// The bot, its chat and everything said in it. Nothing is left pointing at a
	/// bot that is gone — see [`deleted_bot`] for how the file is made to prove it
	/// rather than the statement order being trusted to.
	pub async fn delete_bot(&self, id: String) -> Result<(), ConversationError> {
		self.call_mut(move |connection| Ok(deleted_bot(connection, &id))).await?
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

/// The projection [`bot`] maps position by position. Both statements list the
/// columns in the same order for that reason, and a column added to one without
/// the other is a field read out of its neighbour.
const SELECT_BOT: &str = "SELECT id, name, title, description, model, avatar_animal, avatar_pose,
		avatar_image_path, working_dir, instructions, memory, created_at
	FROM bots WHERE id = ?1";

const SELECT_BOTS: &str = "SELECT id, name, title, description, model, avatar_animal, avatar_pose,
		avatar_image_path, working_dir, instructions, memory, created_at
	FROM bots ORDER BY created_at ASC, id ASC";

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
	Ok(connection.query_row(SELECT_BOT, [DEFAULT_BOT_ID], bot).optional()?)
}

/// Same shape as [`ensured_default_bot`], for the same reason: every launch asks
/// for the chat, and all but the first find it.
fn ensured_chat(connection: &mut Connection, bot_id: &str) -> Result<Chat, ConversationError> {
	if let Some(held) = chat_of(connection, bot_id)? {
		return Ok(held);
	}
	let transaction = write_transaction(connection)?;
	let held = ensure_chat_in(&transaction, bot_id)?;
	transaction.commit()?;
	Ok(held)
}

/// Which chat the bot has, and — when it has none yet — the bot, the chat and the
/// seat written together. One decision, so it reads inside the same transaction
/// that would write: between a read outside and a write inside, another connection
/// may have written the very row this was about to.
///
/// Takes the caller's transaction rather than opening one, which is the whole reason
/// it is reachable across `db`: a caller with more to land in the same unit — the
/// legacy import, which writes a whole transcript beside it — meets these rules
/// instead of composing them again from the outside.
pub(in crate::db) fn ensure_chat_in(
	transaction: &Transaction<'_>,
	bot_id: &str,
) -> Result<Chat, ConversationError> {
	match chat_of(transaction, bot_id)? {
		Some(found) => Ok(found),
		None => insert_chat(transaction, bot_id),
	}
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

/// A bot and its chat, as one unit. The id and the moment are minted here and
/// the chat is written through [`ensure_chat_in`], so a bot created this way is
/// seated exactly the way the launch seats the one the app ships with.
fn created_bot(
	connection: &mut Connection,
	identity: &BotIdentity,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO bots (id, name, title, description, model, avatar_animal, avatar_pose,
				avatar_image_path, working_dir, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
		params![
			id,
			identity.name,
			identity.title,
			identity.description,
			identity.model,
			identity.avatar_animal,
			identity.avatar_pose,
			identity.avatar_image_path,
			identity.working_dir,
			now(),
		],
	)?;
	ensure_chat_in(&transaction, &id)?;
	let created = transaction.query_row(SELECT_BOT, [&id], bot)?;
	transaction.commit()?;
	Ok(created)
}

/// The row as it stands after the write, read back inside the same transaction:
/// what the caller displays is what the file holds, not what it asked for.
fn updated_bot(
	connection: &mut Connection,
	id: &str,
	identity: &BotIdentity,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE bots SET name = ?2, title = ?3, description = ?4, model = ?5,
				avatar_animal = ?6, avatar_pose = ?7, avatar_image_path = ?8, working_dir = ?9
			WHERE id = ?1",
		params![
			id,
			identity.name,
			identity.title,
			identity.description,
			identity.model,
			identity.avatar_animal,
			identity.avatar_pose,
			identity.avatar_image_path,
			identity.working_dir,
		],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_BOT, [id], bot)?;
	transaction.commit()?;
	Ok(stored)
}

/// The chat goes first and the bot after it, and both are one unit: a bot deleted
/// without its thread would leave a transcript nobody can open, and a thread
/// deleted without its bot a bot nothing can be said to.
///
/// A message names its author through the seat the bot holds, and that reference
/// is the schema's one refusal to cascade — it is what keeps a participant from
/// being dropped out from under the words it spoke. Deferring the checks to the
/// commit is what lets the two statements below stand for the whole deletion
/// anyway: SQLite walks every cascade first and verifies the file after, so an
/// orphan of any kind is the transaction failing rather than a row nobody notices.
fn deleted_bot(connection: &mut Connection, id: &str) -> Result<(), ConversationError> {
	let transaction = write_transaction(connection)?;
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	transaction.execute(
		"DELETE FROM conversations WHERE id IN
			(SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1)",
		[id],
	)?;
	let deleted = transaction.execute("DELETE FROM bots WHERE id = ?1", [id])?;
	refuse_if_untouched(deleted, id)?;
	transaction.commit()?;
	Ok(())
}

/// What a write that matched no row means, spelled once for the two that can
/// meet it — see [`ConversationError::UnknownBot`]. Called inside the
/// transaction, so the refusal takes the rest of the write back with it.
fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), ConversationError> {
	match rows {
		0 => Err(ConversationError::UnknownBot { id: id.to_owned() }),
		_ => Ok(()),
	}
}

/// The only way the default bot is written, and `INSERT OR IGNORE` is the whole
/// of it: a row already sitting at that id is the seed's own work from an earlier
/// launch, changed since by the only thing that changes it, which is a user. It is
/// read back rather than compared — every field of it is now theirs to set.
fn seed_default_bot(transaction: &Transaction<'_>) -> Result<Bot, ConversationError> {
	transaction.execute(
		"INSERT OR IGNORE INTO bots (id, name, model, avatar_animal, avatar_pose, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
		params![
			DEFAULT_BOT_ID,
			DEFAULT_BOT_NAME,
			DEFAULT_BOT_MODEL,
			DEFAULT_BOT_ANIMAL,
			DEFAULT_BOT_POSE,
			now(),
		],
	)?;
	Ok(transaction.query_row(SELECT_BOT, [DEFAULT_BOT_ID], bot)?)
}

fn chat(row: &Row<'_>) -> rusqlite::Result<Chat> {
	Ok(Chat { id: row.get(0)?, created_at: row.get(1)?, updated_at: row.get(2)? })
}

fn participant(row: &Row<'_>) -> rusqlite::Result<Participant> {
	Ok(Participant { conversation_id: row.get(0)?, bot_id: row.get(1)?, joined_at: row.get(2)? })
}

fn bot(row: &Row<'_>) -> rusqlite::Result<Bot> {
	Ok(Bot {
		id: row.get(0)?,
		name: row.get(1)?,
		title: row.get(2)?,
		description: row.get(3)?,
		model: row.get(4)?,
		avatar_animal: row.get(5)?,
		avatar_pose: row.get(6)?,
		avatar_image_path: row.get(7)?,
		working_dir: row.get(8)?,
		instructions: row.get(9)?,
		memory: row.get(10)?,
		created_at: row.get(11)?,
	})
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

	/// The plainest identity there is: a name, the model a bot is seeded on and the
	/// face the shipped one wears. Every test that only cares about one field says
	/// that field and takes the rest from here.
	fn an_identity(name: &str) -> BotIdentity {
		BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			description: String::new(),
			model: DEFAULT_BOT_MODEL,
			avatar_animal: DEFAULT_BOT_ANIMAL,
			avatar_pose: DEFAULT_BOT_POSE,
			avatar_image_path: None,
			working_dir: None,
		}
	}

	/// Everything that can hang off a bot, written at once: a turn, a message with
	/// no author and one the bot signed, a step under that turn, the run it was
	/// answered in and the recovery point folded out of it. Deleting the bot has to
	/// take every one of them, and a test that wrote fewer would not prove it.
	async fn a_transcript_for(database: &Database, conversation_id: &str, bot_id: &str) {
		let conversation_id = conversation_id.to_owned();
		let bot_id = bot_id.to_owned();
		database
			.conversations()
			.call(move |connection| {
				connection.execute_batch(&format!(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t1', '{conversation_id}', 1, 1);
					INSERT INTO messages
						(id, conversation_id, turn_id, author_bot_id, seq, role, content,
							completion_state, created_at)
						VALUES ('m1', '{conversation_id}', 't1', NULL, 1, 'user', 'hello',
								'complete', 1),
							('m2', '{conversation_id}', 't1', '{bot_id}', 2, 'assistant',
								'hi there', 'complete', 2);
					INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
						VALUES ('a1', 't1', 'tool', 'succeeded', '{{}}', 1, 1);
					INSERT INTO runtime_sessions
						(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
						VALUES ('s1', '{conversation_id}', '{bot_id}', 'claude-1', 1, 'active', 1);
					INSERT INTO context_checkpoints
						(id, conversation_id, bot_id, runtime_session_id, summary,
							last_message_seq, token_count, created_at)
						VALUES ('k1', '{conversation_id}', '{bot_id}', 's1', 'so far', 1, 10, 1);"
				))?;
				Ok(())
			})
			.await
			.expect("the transcript is written")
	}

	/// Nothing at all is left of a bot that was deleted: not a row that pointed at
	/// it, not one that pointed at its chat.
	async fn assert_file_is_empty(database: &Database) {
		for table in [
			"bots",
			"conversations",
			"conversation_participants",
			"turns",
			"messages",
			"activities",
			"runtime_sessions",
			"context_checkpoints",
		] {
			assert_eq!(count_of(database, table).await, 0, "`{table}` was left holding a row");
		}
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

	/// The bot the app ships with is renameable, and every launch after the rename
	/// has to hand it back under the name it was given: the seed recognising its own
	/// work by the name would undo the first thing the product lets anyone do.
	#[tokio::test]
	async fn a_renamed_default_bot_comes_back_under_its_new_name_on_every_launch() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		repository.ensure_default_bot().await.expect("the default bot");
		let renamed = repository
			.update_bot(DEFAULT_BOT_ID.to_owned(), an_identity("Nyx"))
			.await
			.expect("the bot is renamed");

		let seeded = repository.ensure_default_bot().await.expect("the default bot");
		let read = repository.default_bot().await.expect("the default bot");

		assert_eq!(renamed.name, "Nyx");
		assert_eq!(seeded, renamed, "a launch after the rename wrote the shipped name back");
		assert_eq!(read.as_ref(), Some(&renamed));
		assert_eq!(count_of(&database, "bots").await, 1);

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

	/// A bot is created with the thread it will be spoken to in, so the frontend can
	/// open it straight away: the chat and the seat land in the same transaction as
	/// the bot itself.
	#[tokio::test]
	async fn creating_a_bot_writes_the_chat_and_the_seat_it_is_spoken_in() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");

		let chat = repository.ensure_chat(created.id.clone()).await.expect("the chat");
		let seats = repository.participants(chat.id.clone()).await.expect("the participants");
		assert_eq!(seats.len(), 1, "a bot was created with a thread nobody sits in");
		assert_eq!(seats[0].bot_id, created.id);
		assert_eq!(count_of(&database, "conversations").await, 1, "a second chat was minted");
		assert_eq!(
			repository.bot(created.id.clone()).await.expect("the bot").as_ref(),
			Some(&created),
			"the bot handed back is not the row that was written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Every field of an identity, read back off the disk as it was given. The two
	/// nullable ones are the point: they name something outside the database, and a
	/// path that turned them into empty strings would be a picture at no path.
	#[tokio::test]
	async fn a_bot_is_read_back_exactly_as_it_was_described() {
		let dir = temp_dir();
		let database = open(&dir);
		let described = BotIdentity {
			name: "Nyx".to_owned(),
			title: "Reviewer".to_owned(),
			description: "Reads a diff and says what it would change.".to_owned(),
			model: BotModel::Haiku,
			avatar_animal: AvatarAnimal::Owl,
			avatar_pose: AvatarPose::Curious,
			avatar_image_path: Some("/pictures/owl.png".to_owned()),
			working_dir: Some("/work/opennest".to_owned()),
		};

		let created =
			database.conversations().create_bot(described.clone()).await.expect("the bot");

		let listed = database.conversations().bots().await.expect("the bots");
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, described.name);
		assert_eq!(listed[0].title, described.title);
		assert_eq!(listed[0].description, described.description);
		assert_eq!(listed[0].model, BotModel::Haiku);
		assert_eq!(listed[0].avatar_animal, AvatarAnimal::Owl);
		assert_eq!(listed[0].avatar_pose, AvatarPose::Curious);
		assert_eq!(listed[0].avatar_image_path.as_deref(), Some("/pictures/owl.png"));
		assert_eq!(listed[0].working_dir.as_deref(), Some("/work/opennest"));
		assert_eq!(listed[0].id, created.id);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Who the bot is is replaced whole; what it was told and when it was written
	/// are not. A rename that cleared the instructions would be a bot that forgot
	/// how to answer the moment it was given a nicer face.
	#[tokio::test]
	async fn updating_a_bot_replaces_who_it_is_and_leaves_what_it_was_told() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let id = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET instructions = 'answer briefly', memory = 'they use bun'
						WHERE id = ?1",
					[&id],
				)?;
				Ok(())
			})
			.await
			.expect("what the bot was told");

		let updated = repository
			.update_bot(
				created.id.clone(),
				BotIdentity {
					name: "Ada".to_owned(),
					title: "Reviewer".to_owned(),
					description: "Reads a diff.".to_owned(),
					model: BotModel::Opus,
					avatar_animal: AvatarAnimal::Koala,
					avatar_pose: AvatarPose::Sleeping,
					avatar_image_path: Some("/pictures/koala.png".to_owned()),
					working_dir: Some("/work/opennest".to_owned()),
				},
			)
			.await
			.expect("the bot is updated");

		assert_eq!(updated.name, "Ada");
		assert_eq!(updated.title, "Reviewer");
		assert_eq!(updated.avatar_animal, AvatarAnimal::Koala);
		assert_eq!(updated.avatar_pose, AvatarPose::Sleeping);
		assert_eq!(updated.working_dir.as_deref(), Some("/work/opennest"));
		assert_eq!(updated.model, BotModel::Opus, "an update left the bot on its old model");
		assert_eq!(updated.instructions, "answer briefly", "an update cleared the instructions");
		assert_eq!(updated.memory, "they use bun", "an update cleared the memory");
		assert_eq!(updated.created_at, created.created_at, "an update moved the moment");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A `WHERE` matching nothing is a success SQLite reports with a row count, and
	/// both writes have to read it: a caller told its update landed would go on
	/// showing a bot that is not there.
	#[tokio::test]
	async fn a_write_naming_a_bot_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let updated = repository.update_bot("missing".to_owned(), an_identity("Nyx")).await;
		let deleted = repository.delete_bot("missing".to_owned()).await;

		for refused in [format!("{updated:?}"), format!("{deleted:?}")] {
			assert!(
				refused.contains("UnknownBot"),
				"a write on a bot the file does not hold was accepted: {refused}"
			);
		}
		assert_eq!(count_of(&database, "bots").await, 0, "a refused write wrote a bot");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Deleting a bot takes the thread it was spoken to in and everything under it,
	/// and touches nothing that belongs to another bot. The message signed by the
	/// bot is what makes this more than a cascade: its author is the seat, which the
	/// schema refuses to drop out from under it.
	#[tokio::test]
	async fn deleting_a_bot_takes_its_chat_and_everything_said_in_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let deleted = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let kept = repository.create_bot(an_identity("Ada")).await.expect("the bot");
		let chat = repository.ensure_chat(deleted.id.clone()).await.expect("the chat");
		let kept_chat = repository.ensure_chat(kept.id.clone()).await.expect("the chat");
		a_transcript_for(&database, &chat.id, &deleted.id).await;

		repository.delete_bot(deleted.id.clone()).await.expect("the bot is deleted");

		assert_eq!(repository.bot(deleted.id).await.expect("the bot"), None);
		assert_eq!(count_of(&database, "bots").await, 1, "the other bot went with it");
		assert_eq!(count_of(&database, "conversations").await, 1);
		assert_eq!(count_of(&database, "messages").await, 0, "a message outlived its chat");
		assert_eq!(count_of(&database, "turns").await, 0, "a turn outlived its chat");
		assert_eq!(count_of(&database, "activities").await, 0, "a step outlived its turn");
		assert_eq!(count_of(&database, "runtime_sessions").await, 0, "a run outlived its seat");
		assert_eq!(count_of(&database, "context_checkpoints").await, 0, "a summary outlived it");
		assert_eq!(
			repository.participants(kept_chat.id).await.expect("the participants").len(),
			1,
			"the other bot lost the seat it was sitting in"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The last bot is deletable like any other, and what is left is what a fresh
	/// install comes up as: no bots, no chats, and a read that answers `None`
	/// instead of failing.
	#[tokio::test]
	async fn deleting_the_last_bot_leaves_the_file_a_fresh_install_would_open() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let only = repository.ensure_default_bot().await.expect("the default bot");
		let chat = repository.ensure_chat(only.id.clone()).await.expect("the chat");
		a_transcript_for(&database, &chat.id, &only.id).await;

		repository.delete_bot(only.id).await.expect("the bot is deleted");

		assert_file_is_empty(&database).await;
		assert_eq!(repository.default_bot().await.expect("the default bot"), None);
		assert!(repository.bots().await.expect("the bots").is_empty());

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Two creations racing on the one connection the host shares: both land, each
	/// under an id and a chat of its own. The ids are minted inside the write, so
	/// nothing outside can hand the same one in twice.
	#[tokio::test]
	async fn two_bots_created_at_once_each_get_their_own_id_and_their_own_chat() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let (first, second) = tokio::join!(
			repository.create_bot(an_identity("Nyx")),
			repository.create_bot(an_identity("Ada"))
		);

		let first = first.expect("the first bot");
		let second = second.expect("the second bot");
		assert_ne!(first.id, second.id, "two bots were created under one id");
		assert_eq!(count_of(&database, "bots").await, 2);
		assert_eq!(count_of(&database, "conversations").await, 2, "two bots share one chat");
		assert_eq!(count_of(&database, "conversation_participants").await, 2);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The boot path, over a model the user changed. Every launch reads the default
	/// bot before anything else can, so a build that recognised its own row by the
	/// model would meet `opus` on the second launch and refuse to hand the app its
	/// own bot. Reopening is the whole point: the row is read off the disk by a
	/// connection that never saw it written.
	#[tokio::test]
	async fn a_default_bot_moved_to_another_model_still_reads_back_after_a_reopen() {
		let dir = temp_dir();
		let moved = {
			let database = open(&dir);
			let repository = database.conversations();
			repository.ensure_default_bot().await.expect("the default bot");
			repository
				.update_bot(
					DEFAULT_BOT_ID.to_owned(),
					BotIdentity { model: BotModel::Opus, ..an_identity(DEFAULT_BOT_NAME) },
				)
				.await
				.expect("the bot is moved to another model")
		};

		let database = open(&dir);
		let repository = database.conversations();
		let read = repository.default_bot().await.expect("the default bot");
		let seeded = repository.ensure_default_bot().await.expect("the default bot");
		let held = repository.ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the chat");

		assert_eq!(moved.model, BotModel::Opus);
		assert_eq!(read.as_ref(), Some(&moved), "a launch could not read its own default bot");
		assert_eq!(seeded, moved, "a launch wrote the shipped model back over the user's");
		assert_eq!(count_of(&database, "bots").await, 1);
		assert!(!held.id.is_empty(), "the chat was refused over a model the user chose");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
