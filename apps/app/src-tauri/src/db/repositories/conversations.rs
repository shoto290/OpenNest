
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::messages::stored_as_text;
use crate::agent::contract::AgentCommand;
use crate::db::bootstrap::unserializable;
use crate::db::{Access, DatabaseError};

pub const DEFAULT_BOT_ID: &str = "default";
const DEFAULT_BOT_NAME: &str = "Claude";
const DEFAULT_BOT_MODEL: &str = "sonnet";
const PARTICIPANT_ROLE: &str = "assistant";
const CHAT_TITLE: &str = "Chat";
const CHAT_KIND: &str = "main";

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl AvatarBlot {
	fn as_sql(self) -> &'static str {
		self.named()
	}

	pub fn named(self) -> &'static str {
		match self {
			AvatarBlot::Red => "red",
			AvatarBlot::Yellow => "yellow",
			AvatarBlot::Green => "green",
			AvatarBlot::Cyan => "cyan",
			AvatarBlot::Blue => "blue",
			AvatarBlot::Purple => "purple",
			AvatarBlot::Pink => "pink",
			AvatarBlot::Orange => "orange",
		}
	}

	pub fn parse(text: &str) -> Option<Self> {
		match text {
			"red" => Some(AvatarBlot::Red),
			"yellow" => Some(AvatarBlot::Yellow),
			"green" => Some(AvatarBlot::Green),
			"cyan" => Some(AvatarBlot::Cyan),
			"blue" => Some(AvatarBlot::Blue),
			"purple" => Some(AvatarBlot::Purple),
			"pink" => Some(AvatarBlot::Pink),
			"orange" => Some(AvatarBlot::Orange),
			_ => None,
		}
	}
}

stored_as_text!(AvatarAnimal);
stored_as_text!(AvatarBlot);

const DEFAULT_BOT_ANIMAL: AvatarAnimal = AvatarAnimal::Cat;

#[derive(Debug)]
pub enum ConversationError {
	Database(DatabaseError),
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

#[derive(Debug, PartialEq, Eq)]
pub struct Chat {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
}

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
	pub title: String,
	pub model: String,
	pub avatar_animal: AvatarAnimal,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub working_dir: Option<String>,
	pub instructions: String,
	pub memory: String,
	pub denied_tools: Vec<String>,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
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
}

impl From<Bot> for BotIdentity {
	fn from(bot: Bot) -> Self {
		Self {
			name: bot.name,
			title: bot.title,
			model: bot.model,
			avatar_animal: bot.avatar_animal,
			avatar_blot: bot.avatar_blot,
			avatar_image_path: bot.avatar_image_path,
			working_dir: bot.working_dir,
			instructions: bot.instructions,
			denied_tools: bot.denied_tools,
		}
	}
}

pub struct ConversationsRepository {
	access: Access,
}

impl ConversationsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

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

	pub async fn ensure_default_bot(&self) -> Result<Bot, ConversationError> {
		self.call_mut(|connection| Ok(ensured_default_bot(connection))).await?
	}

	pub async fn default_bot(&self) -> Result<Option<Bot>, ConversationError> {
		self.call(|connection| Ok(stored_default_bot(connection))).await?
	}

	pub async fn ensure_chat(&self, bot_id: String) -> Result<Chat, ConversationError> {
		self.call_mut(move |connection| Ok(ensured_chat(connection, &bot_id))).await?
	}

	pub async fn bot(&self, id: String) -> Result<Option<Bot>, ConversationError> {
		Ok(self
			.call(move |connection| Ok(connection.query_row(SELECT_BOT, [id], bot).optional()?))
			.await?)
	}

	pub async fn bots(&self) -> Result<Vec<Bot>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached(SELECT_BOTS)?;
			let rows = statement.query_map([], bot)?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn create_bot(&self, identity: BotIdentity) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(created_bot(connection, &identity))).await?
	}

	pub async fn update_bot(
		&self,
		id: String,
		identity: BotIdentity,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(updated_bot(connection, &id, &identity))).await?
	}

	pub async fn delete_bot(&self, id: String) -> Result<(), ConversationError> {
		self.call_mut(move |connection| Ok(deleted_bot(connection, &id))).await?
	}

	pub async fn set_avatar_image_path(
		&self,
		id: String,
		path: Option<String>,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(set_avatar_image_path(connection, &id, path.as_deref())))
			.await?
	}

	pub async fn set_memory(&self, id: String, memory: String) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(set_memory(connection, &id, &memory))).await?
	}

	pub async fn adopt_instructions(
		&self,
		id: String,
		instructions: String,
	) -> Result<(), ConversationError> {
		self.call(move |connection| {
			let written = connection.execute(
				"UPDATE bots SET instructions = ?2 WHERE id = ?1",
				params![&id, instructions],
			)?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn adopt_memory(&self, id: String, memory: String) -> Result<(), ConversationError> {
		self.call(move |connection| {
			let written = connection
				.execute("UPDATE bots SET memory = ?2 WHERE id = ?1", params![&id, memory])?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn record_bot_commands(
		&self,
		id: String,
		commands: Vec<AgentCommand>,
	) -> Result<(), ConversationError> {
		let listed = serde_json::to_string(&commands).map_err(unserializable)?;
		self.call(move |connection| {
			let written = connection
				.execute("UPDATE bots SET commands = ?2 WHERE id = ?1", params![&id, listed])?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn bot_commands(&self, id: String) -> Result<Vec<AgentCommand>, DatabaseError> {
		self.call(move |connection| {
			let stored: Option<String> = connection
				.query_row("SELECT commands FROM bots WHERE id = ?1", [id], |row| row.get(0))
				.optional()?;
			Ok(stored.and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default())
		})
		.await
	}

	pub async fn avatar_image_paths(&self) -> Result<Vec<String>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached(
				"SELECT avatar_image_path FROM bots WHERE avatar_image_path IS NOT NULL",
			)?;
			let rows = statement.query_map([], |row| row.get(0))?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn conversation_ids(&self) -> Result<Vec<String>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached("SELECT id FROM conversations")?;
			let rows = statement.query_map([], |row| row.get(0))?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
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

const SELECT_BOT: &str = "SELECT id, name, title, model, avatar_animal, avatar_color,
		avatar_image_path, working_dir, instructions, memory, denied_tools, created_at
	FROM bots WHERE id = ?1";

const SELECT_BOTS: &str = "SELECT id, name, title, model, avatar_animal, avatar_color,
		avatar_image_path, working_dir, instructions, memory, denied_tools, created_at
	FROM bots ORDER BY created_at ASC, id ASC";

const SELECT_CHAT_OF_BOT: &str = "SELECT conversations.id,
		conversations.created_at, conversations.updated_at
	FROM conversations
	JOIN conversation_participants ON conversation_participants.conversation_id = conversations.id
	WHERE conversation_participants.bot_id = ?1
	ORDER BY conversations.created_at ASC, conversations.id ASC
	LIMIT 1";

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

fn ensured_chat(connection: &mut Connection, bot_id: &str) -> Result<Chat, ConversationError> {
	if let Some(held) = chat_of(connection, bot_id)? {
		return Ok(held);
	}
	let transaction = write_transaction(connection)?;
	let held = ensure_chat_in(&transaction, bot_id)?;
	transaction.commit()?;
	Ok(held)
}

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

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

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

fn created_bot(
	connection: &mut Connection,
	identity: &BotIdentity,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO bots (id, name, title, model, avatar_animal, avatar_color,
				avatar_image_path, working_dir, instructions, denied_tools, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
		params![
			id,
			identity.name,
			identity.title,
			identity.model,
			identity.avatar_animal,
			identity.avatar_blot,
			identity.avatar_image_path,
			identity.working_dir,
			identity.instructions,
			denied(identity)?,
			now(),
		],
	)?;
	ensure_chat_in(&transaction, &id)?;
	let created = transaction.query_row(SELECT_BOT, [&id], bot)?;
	transaction.commit()?;
	Ok(created)
}

fn updated_bot(
	connection: &mut Connection,
	id: &str,
	identity: &BotIdentity,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE bots SET name = ?2, title = ?3, model = ?4,
				avatar_animal = ?5, avatar_color = ?6, avatar_image_path = ?7, working_dir = ?8,
				instructions = ?9, denied_tools = ?10
			WHERE id = ?1",
		params![
			id,
			identity.name,
			identity.title,
			identity.model,
			identity.avatar_animal,
			identity.avatar_blot,
			identity.avatar_image_path,
			identity.working_dir,
			identity.instructions,
			denied(identity)?,
		],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_BOT, [id], bot)?;
	transaction.commit()?;
	Ok(stored)
}

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

fn set_avatar_image_path(
	connection: &mut Connection,
	id: &str,
	path: Option<&str>,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction
		.execute("UPDATE bots SET avatar_image_path = ?2 WHERE id = ?1", params![id, path])?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_BOT, [id], bot)?;
	transaction.commit()?;
	Ok(stored)
}

fn set_memory(
	connection: &mut Connection,
	id: &str,
	memory: &str,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written =
		transaction.execute("UPDATE bots SET memory = ?2 WHERE id = ?1", params![id, memory])?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_BOT, [id], bot)?;
	transaction.commit()?;
	Ok(stored)
}

fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), ConversationError> {
	match rows {
		0 => Err(ConversationError::UnknownBot { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn seed_default_bot(transaction: &Transaction<'_>) -> Result<Bot, ConversationError> {
	transaction.execute(
		"INSERT OR IGNORE INTO bots (id, name, model, avatar_animal, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5)",
		params![DEFAULT_BOT_ID, DEFAULT_BOT_NAME, DEFAULT_BOT_MODEL, DEFAULT_BOT_ANIMAL, now()],
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
		id: row.get("id")?,
		name: row.get("name")?,
		title: row.get("title")?,
		model: row.get("model")?,
		avatar_animal: row.get("avatar_animal")?,
		avatar_blot: row.get("avatar_color")?,
		avatar_image_path: row.get("avatar_image_path")?,
		working_dir: row.get("working_dir")?,
		instructions: row.get("instructions")?,
		memory: row.get("memory")?,
		denied_tools: listed(row.get("denied_tools")?),
		created_at: row.get("created_at")?,
	})
}

fn denied(identity: &BotIdentity) -> Result<String, ConversationError> {
	serde_json::to_string(&identity.denied_tools).map_err(unserializable)
}

fn listed(stored: String) -> Vec<String> {
	serde_json::from_str(&stored).unwrap_or_default()
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};

	fn an_identity(name: &str) -> BotIdentity {
		BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: DEFAULT_BOT_MODEL.to_owned(),
			avatar_animal: DEFAULT_BOT_ANIMAL,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
		}
	}

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

	#[tokio::test]
	async fn a_bot_is_read_back_exactly_as_it_was_described() {
		let dir = temp_dir();
		let database = open(&dir);
		let described = BotIdentity {
			name: "Nyx".to_owned(),
			title: "Reviewer".to_owned(),
			model: "haiku".to_owned(),
			denied_tools: vec!["Bash".to_owned(), "Write".to_owned()],
			avatar_animal: AvatarAnimal::Owl,
			avatar_blot: Some(AvatarBlot::Red),
			avatar_image_path: Some("/pictures/owl.png".to_owned()),
			working_dir: Some("/work/opennest".to_owned()),
			instructions: "Answer briefly.".to_owned(),
		};

		let created =
			database.conversations().create_bot(described.clone()).await.expect("the bot");

		let listed = database.conversations().bots().await.expect("the bots");
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, described.name);
		assert_eq!(listed[0].title, described.title);
		assert_eq!(listed[0].model, "haiku");
		assert_eq!(listed[0].avatar_animal, AvatarAnimal::Owl);
		assert_eq!(listed[0].avatar_blot, Some(AvatarBlot::Red));
		assert_eq!(listed[0].avatar_image_path.as_deref(), Some("/pictures/owl.png"));
		assert_eq!(listed[0].working_dir.as_deref(), Some("/work/opennest"));
		assert_eq!(listed[0].instructions, described.instructions);
		assert_eq!(listed[0].denied_tools, described.denied_tools);
		assert_eq!(listed[0].id, created.id);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn saving_a_memory_replaces_what_the_bot_kept_and_clearing_it_leaves_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");

		let saved = repository
			.set_memory(created.id.clone(), "they use bun".to_owned())
			.await
			.expect("the memory is saved");
		assert_eq!(saved.memory, "they use bun");
		assert_eq!(saved.name, created.name);

		let cleared = repository
			.set_memory(created.id.clone(), String::new())
			.await
			.expect("the memory is cleared");
		assert_eq!(cleared.memory, "");

		let refused = repository.set_memory("nobody".to_owned(), "anything".to_owned()).await;
		assert!(matches!(refused, Err(ConversationError::UnknownBot { .. })));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn updating_a_bot_replaces_who_it_is_but_not_its_memory_or_the_pose_it_dropped() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let id = created.id.clone();
		let written = id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET instructions = 'answer briefly', memory = 'they use bun',
							avatar_pose = 'sleeping'
						WHERE id = ?1",
					[&written],
				)?;
				Ok(())
			})
			.await
			.expect("what the bot was told and the pose an older build wrote");

		let updated = repository
			.update_bot(
				created.id.clone(),
				BotIdentity {
					name: "Ada".to_owned(),
					title: "Reviewer".to_owned(),
					model: "opus".to_owned(),
					denied_tools: vec!["Bash".to_owned()],
					avatar_animal: AvatarAnimal::Koala,
					avatar_blot: Some(AvatarBlot::Orange),
					avatar_image_path: Some("/pictures/koala.png".to_owned()),
					working_dir: Some("/work/opennest".to_owned()),
					instructions: "answer at length".to_owned(),
				},
			)
			.await
			.expect("the bot is updated");

		assert_eq!(updated.name, "Ada");
		assert_eq!(updated.title, "Reviewer");
		assert_eq!(updated.avatar_animal, AvatarAnimal::Koala);
		assert_eq!(updated.avatar_blot, Some(AvatarBlot::Orange));
		assert_eq!(updated.working_dir.as_deref(), Some("/work/opennest"));
		assert_eq!(updated.model, "opus", "an update left the bot on its old model");
		assert_eq!(
			updated.instructions, "answer at length",
			"an update left the bot on its old instructions"
		);
		assert_eq!(updated.memory, "they use bun", "an update cleared the memory");
		assert_eq!(updated.created_at, created.created_at, "an update moved the moment");
		assert_eq!(
			repository
				.call(move |connection| Ok(connection.query_row(
					"SELECT avatar_pose FROM bots WHERE id = ?1",
					[&id],
					|row| row.get::<_, String>(0)
				)?))
				.await
				.expect("the stored pose"),
			"sleeping",
			"an update rewrote the pose column nothing projects any more"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_holds_the_commands_its_last_session_announced() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let silent = repository.create_bot(an_identity("Ada")).await.expect("the other bot");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"a bot no session has announced anything for offers a command"
		);

		repository
			.record_bot_commands(
				created.id.clone(),
				vec![AgentCommand::named("review"), AgentCommand::named("compact")],
			)
			.await
			.expect("the first session's commands");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			vec![AgentCommand::named("review"), AgentCommand::named("compact")],
		);

		repository
			.record_bot_commands(created.id.clone(), vec![AgentCommand::named("status")])
			.await
			.expect("the next session's commands");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			vec![AgentCommand::named("status")],
			"an announcement was added to the one before it instead of replacing it"
		);
		assert_eq!(
			repository.bot_commands(silent.id).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"one bot's session announced for another"
		);
		assert_eq!(
			repository.bot_commands("missing".to_owned()).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"a bot the file does not hold offered a command"
		);

		let refused = repository
			.record_bot_commands("missing".to_owned(), vec![AgentCommand::named("review")])
			.await;
		assert!(
			format!("{refused:?}").contains("UnknownBot"),
			"commands were written for a bot the file does not hold: {refused:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn commands_the_column_holds_as_bare_names_are_offered_as_commands() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let id = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					r#"UPDATE bots SET commands = '["review","compact"]' WHERE id = ?1"#,
					[&id],
				)?;
				Ok(())
			})
			.await
			.expect("the shape an older build wrote");

		assert_eq!(
			repository.bot_commands(created.id).await.expect("the commands"),
			vec![AgentCommand::named("review"), AgentCommand::named("compact")]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn commands_the_column_holds_unreadably_are_offered_as_none() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx")).await.expect("the bot");
		let id = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET commands = 'not a list at all' WHERE id = ?1",
					[&id],
				)?;
				Ok(())
			})
			.await
			.expect("text no build can read a list out of");

		assert_eq!(
			repository.bot_commands(created.id).await.expect("the commands"),
			Vec::<AgentCommand>::new()
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

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
					BotIdentity { model: "opus".to_owned(), ..an_identity(DEFAULT_BOT_NAME) },
				)
				.await
				.expect("the bot is moved to another model")
		};

		let database = open(&dir);
		let repository = database.conversations();
		let read = repository.default_bot().await.expect("the default bot");
		let seeded = repository.ensure_default_bot().await.expect("the default bot");
		let held = repository.ensure_chat(DEFAULT_BOT_ID.into()).await.expect("the chat");

		assert_eq!(moved.model, "opus");
		assert_eq!(read.as_ref(), Some(&moved), "a launch could not read its own default bot");
		assert_eq!(seeded, moved, "a launch wrote the shipped model back over the user's");
		assert_eq!(count_of(&database, "bots").await, 1);
		assert!(!held.id.is_empty(), "the chat was refused over a model the user chose");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
