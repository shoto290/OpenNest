use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::conversations::AvatarBlot;
use crate::db::{Access, DatabaseError};

const TINTS: [AvatarBlot; 8] = [
	AvatarBlot::Red,
	AvatarBlot::Yellow,
	AvatarBlot::Green,
	AvatarBlot::Cyan,
	AvatarBlot::Blue,
	AvatarBlot::Purple,
	AvatarBlot::Pink,
	AvatarBlot::Orange,
];

const SELECT_SPACE: &str =
	"SELECT id, name, colour, position, created_at FROM spaces WHERE id = ?1";

const SELECT_SPACES: &str = "SELECT id, name, colour, position, created_at FROM spaces
	ORDER BY position ASC, id ASC";

const SPACE_OF_BOT: &str = "SELECT space_id FROM bots WHERE id = ?1";

const BOTS_OF_SPACE: &str = "SELECT id FROM bots WHERE space_id = ?1";

#[derive(Debug)]
pub enum SpaceError {
	Database(DatabaseError),
	UnknownSpace { id: String },
	UnknownBot { id: String },
	IncompleteOrder,
	LastSpace,
}

impl From<DatabaseError> for SpaceError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for SpaceError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Space {
	pub id: String,
	pub name: String,
	pub colour: AvatarBlot,
	pub position: i64,
	pub created_at: i64,
}

pub struct SpacesRepository {
	access: Access,
}

impl SpacesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn list(&self) -> Result<Vec<Space>, DatabaseError> {
		self.access
			.call(|connection| {
				let mut statement = connection.prepare_cached(SELECT_SPACES)?;
				let rows = statement.query_map([], space)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
	}

	pub async fn create(&self, name: String) -> Result<Space, SpaceError> {
		self.access.call_mut(move |connection| Ok(created(connection, &name))).await?
	}

	pub async fn update(
		&self,
		id: String,
		name: String,
		colour: AvatarBlot,
	) -> Result<Space, SpaceError> {
		self.access.call_mut(move |connection| Ok(updated(connection, &id, &name, colour))).await?
	}

	pub async fn reorder(&self, ids: Vec<String>) -> Result<(), SpaceError> {
		self.access.call_mut(move |connection| Ok(reordered(connection, &ids))).await?
	}

	pub async fn delete(&self, id: String) -> Result<Vec<String>, SpaceError> {
		self.access.call_mut(move |connection| Ok(deleted(connection, &id))).await?
	}

	pub async fn move_bot(&self, bot_id: String, space_id: String) -> Result<(), SpaceError> {
		self.access
			.call_mut(move |connection| Ok(moved_bot(connection, &bot_id, &space_id)))
			.await?
	}
}

fn created(connection: &mut Connection, name: &str) -> Result<Space, SpaceError> {
	let transaction = write_transaction(connection)?;
	let held = counted(&transaction)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position) + 1, 0) FROM spaces), ?4)",
		params![id, name, TINTS[(held as usize) % TINTS.len()], now()],
	)?;
	let created = transaction.query_row(SELECT_SPACE, [&id], space)?;
	transaction.commit()?;
	Ok(created)
}

fn updated(
	connection: &mut Connection,
	id: &str,
	name: &str,
	colour: AvatarBlot,
) -> Result<Space, SpaceError> {
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE spaces SET name = ?2, colour = ?3 WHERE id = ?1",
		params![id, name, colour],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_SPACE, [id], space)?;
	transaction.commit()?;
	Ok(stored)
}

fn reordered(connection: &mut Connection, ids: &[String]) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	if distinct(ids) < counted(&transaction)? {
		return Err(SpaceError::IncompleteOrder);
	}
	for (position, id) in ids.iter().enumerate() {
		let written = transaction.execute(
			"UPDATE spaces SET position = ?2 WHERE id = ?1",
			params![id, position as i64],
		)?;
		refuse_if_untouched(written, id)?;
	}
	transaction.commit()?;
	Ok(())
}

fn deleted(connection: &mut Connection, id: &str) -> Result<Vec<String>, SpaceError> {
	let transaction = write_transaction(connection)?;
	if !held(&transaction, id)? {
		return Err(SpaceError::UnknownSpace { id: id.to_owned() });
	}
	if counted(&transaction)? <= 1 {
		return Err(SpaceError::LastSpace);
	}
	let cascaded = bots_of_space(&transaction, id)?;
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	transaction.execute(
		"DELETE FROM conversations WHERE id IN
			(SELECT conversation_id FROM conversation_participants
				WHERE bot_id IN (SELECT id FROM bots WHERE space_id = ?1))",
		[id],
	)?;
	transaction.execute("DELETE FROM spaces WHERE id = ?1", [id])?;
	transaction.commit()?;
	Ok(cascaded)
}

fn bots_of_space(connection: &Connection, space_id: &str) -> Result<Vec<String>, SpaceError> {
	let mut statement = connection.prepare(BOTS_OF_SPACE)?;
	let rows = statement.query_map([space_id], |row| row.get(0))?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn moved_bot(connection: &mut Connection, bot_id: &str, space_id: &str) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	let home = space_of_bot(&transaction, bot_id)?
		.ok_or_else(|| SpaceError::UnknownBot { id: bot_id.to_owned() })?;
	if !held(&transaction, space_id)? {
		return Err(SpaceError::UnknownSpace { id: space_id.to_owned() });
	}
	if home != space_id {
		transaction.execute(
			"UPDATE bots SET space_id = ?2, section_id = NULL WHERE id = ?1",
			params![bot_id, space_id],
		)?;
	}
	transaction.commit()?;
	Ok(())
}

fn space_of_bot(connection: &Connection, bot_id: &str) -> Result<Option<String>, SpaceError> {
	Ok(connection.query_row(SPACE_OF_BOT, [bot_id], |row| row.get(0)).optional()?)
}

fn held(connection: &Connection, id: &str) -> Result<bool, SpaceError> {
	Ok(connection
		.query_row("SELECT EXISTS (SELECT 1 FROM spaces WHERE id = ?1)", [id], |row| row.get(0))?)
}

fn distinct(ids: &[String]) -> i64 {
	ids.iter().collect::<HashSet<_>>().len() as i64
}

fn counted(connection: &Connection) -> Result<i64, SpaceError> {
	Ok(connection.query_row("SELECT count(*) FROM spaces", [], |row| row.get(0))?)
}

fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), SpaceError> {
	match rows {
		0 => Err(SpaceError::UnknownSpace { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn space(row: &Row<'_>) -> rusqlite::Result<Space> {
	Ok(Space {
		id: row.get("id")?,
		name: row.get("name")?,
		colour: row.get("colour")?,
		position: row.get("position")?,
		created_at: row.get("created_at")?,
	})
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::conversations::{AvatarAnimal, Bot, BotIdentity};
	use crate::db::{count_of, open, Database};

	fn an_identity(name: &str) -> BotIdentity {
		BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: AvatarAnimal::Cat,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
		}
	}

	async fn stored_bot(database: &Database, id: &str) -> Bot {
		database
			.conversations()
			.bot(id.to_owned())
			.await
			.expect("the bot")
			.expect("the bot is on the record")
	}

	#[tokio::test]
	async fn the_file_opens_holding_the_one_space_every_bot_belongs_to() {
		let dir = temp_dir();
		let database = open(&dir);

		let listed = database.spaces().list().await.expect("the spaces");

		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, "Personal");
		assert_eq!(listed[0].colour, AvatarBlot::Red);
		assert_eq!(listed[0].position, 0);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_created_space_lands_after_the_last_one_wearing_the_next_tint() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();

		let second = repository.create("Vocca".to_owned()).await.expect("the space");
		let third = repository.create("Vacances".to_owned()).await.expect("the space");

		assert_eq!((second.position, second.colour), (1, AvatarBlot::Yellow));
		assert_eq!((third.position, third.colour), (2, AvatarBlot::Green));
		assert_eq!(
			repository
				.list()
				.await
				.expect("the spaces")
				.into_iter()
				.map(|space| space.name)
				.collect::<Vec<_>>(),
			vec!["Personal".to_owned(), "Vocca".to_owned(), "Vacances".to_owned()]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_space_is_renamed_and_retinted_in_one_go() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let held = repository.create("Vocca".to_owned()).await.expect("the space");

		let written = repository
			.update(held.id.clone(), "Work".to_owned(), AvatarBlot::Cyan)
			.await
			.expect("the space is written");

		assert_eq!((written.name.as_str(), written.colour), ("Work", AvatarBlot::Cyan));
		assert_eq!(written.position, held.position, "writing a space moved it");
		assert!(matches!(
			repository.update("nobody".to_owned(), "Work".to_owned(), AvatarBlot::Cyan).await,
			Err(SpaceError::UnknownSpace { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn names_of(repository: &SpacesRepository) -> Vec<String> {
		repository.list().await.expect("the spaces").into_iter().map(|space| space.name).collect()
	}

	#[tokio::test]
	async fn a_written_order_ranks_the_spaces_and_leaves_the_next_one_last() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let first = repository.list().await.expect("the spaces")[0].id.clone();
		let second = repository.create("Vocca".to_owned()).await.expect("the space");
		let third = repository.create("Vacances".to_owned()).await.expect("the space");

		repository
			.reorder(vec![third.id.clone(), first.clone(), second.id.clone()])
			.await
			.expect("the order is written");

		assert_eq!(
			repository
				.list()
				.await
				.expect("the spaces")
				.into_iter()
				.map(|space| (space.name, space.position))
				.collect::<Vec<_>>(),
			vec![("Vacances".to_owned(), 0), ("Personal".to_owned(), 1), ("Vocca".to_owned(), 2)]
		);

		let latest = repository.create("Perso".to_owned()).await.expect("the space");

		assert_eq!(latest.position, 3);

		repository.delete(first).await.expect("the space is deleted");

		assert_eq!(
			names_of(repository).await,
			vec!["Vacances".to_owned(), "Vocca".to_owned(), "Perso".to_owned()],
			"deleting a space shuffled the ones that remain"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_order_naming_a_stranger_or_leaving_a_space_out_writes_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let second = repository.create("Vocca".to_owned()).await.expect("the space");

		assert!(matches!(
			repository.reorder(vec![second.id.clone(), "nobody".to_owned()]).await,
			Err(SpaceError::UnknownSpace { .. })
		));
		assert!(matches!(
			repository.reorder(vec![second.id.clone()]).await,
			Err(SpaceError::IncompleteOrder)
		));
		assert!(matches!(
			repository.reorder(vec![second.id.clone(), second.id.clone()]).await,
			Err(SpaceError::IncompleteOrder)
		));
		assert_eq!(
			names_of(repository).await,
			vec!["Personal".to_owned(), "Vocca".to_owned()],
			"a refused order moved the spaces"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_space_takes_its_bots_and_their_chats_with_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let kept = spaces.list().await.expect("the spaces")[0].id.clone();
		let dropped = spaces.create("Vocca".to_owned()).await.expect("the space");
		database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(kept), None)
			.await
			.expect("the kept bot");
		let held = database
			.conversations()
			.create_bot(an_identity("Ada"), Some(dropped.id.clone()), None)
			.await
			.expect("the bot of the space that goes");

		let cascaded = spaces.delete(dropped.id).await.expect("the space is deleted");

		assert_eq!(cascaded, vec![held.id]);

		assert_eq!(
			database
				.conversations()
				.bots(None)
				.await
				.expect("the bots")
				.into_iter()
				.map(|bot| bot.name)
				.collect::<Vec<_>>(),
			vec!["Nyx".to_owned()],
			"the bots of the space that went are still on the record"
		);
		assert_eq!(
			count_of(&database, "conversations").await,
			1,
			"the chats of the bots that went are still on the record"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_moved_bot_leaves_its_section_behind_and_keeps_everything_else() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let held = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), Some(held.id))
			.await
			.expect("the bot");

		spaces.move_bot(bot.id.clone(), elsewhere.id.clone()).await.expect("the bot moves");

		let moved = stored_bot(&database, &bot.id).await;
		assert_eq!(moved.space_id, elsewhere.id);
		assert_eq!(moved.section_id, None, "a moved bot carried a section of the space it left");
		assert_eq!(moved.name, bot.name, "a moved bot was renamed");
		assert!(
			database.conversations().bots(Some(home)).await.expect("the bots").is_empty(),
			"the space it left still lists it"
		);
		assert_eq!(
			database
				.conversations()
				.bots(Some(elsewhere.id))
				.await
				.expect("the bots")
				.into_iter()
				.map(|listed| listed.id)
				.collect::<Vec<_>>(),
			vec![bot.id],
			"the space it joined does not list it"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_moved_to_the_space_it_holds_stands_where_it_is() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let held = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), Some(held.id.clone()))
			.await
			.expect("the bot");

		spaces.move_bot(bot.id.clone(), home).await.expect("the bot stays");

		assert_eq!(
			stored_bot(&database, &bot.id).await.section_id,
			Some(held.id),
			"a bot moved to its own space lost its section"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_move_naming_no_bot_and_no_space_moves_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		assert!(matches!(
			spaces.move_bot("nobody".to_owned(), home.clone()).await,
			Err(SpaceError::UnknownBot { .. })
		));
		assert!(matches!(
			spaces.move_bot(bot.id.clone(), "nowhere".to_owned()).await,
			Err(SpaceError::UnknownSpace { .. })
		));
		assert_eq!(
			stored_bot(&database, &bot.id).await.space_id,
			home,
			"a refused move took the bot with it"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_last_space_standing_cannot_be_deleted() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let only = spaces.list().await.expect("the spaces")[0].id.clone();
		database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(only.clone()), None)
			.await
			.expect("the bot");

		let refused = spaces.delete(only.clone()).await;

		assert!(matches!(refused, Err(SpaceError::LastSpace)), "the last space was deleted");
		assert_eq!(spaces.list().await.expect("the spaces").len(), 1);
		assert_eq!(count_of(&database, "bots").await, 1, "a refused delete took a bot with it");
		assert!(matches!(
			spaces.delete("nobody".to_owned()).await,
			Err(SpaceError::UnknownSpace { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
