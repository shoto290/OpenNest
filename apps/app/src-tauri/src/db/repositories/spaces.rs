use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row, Transaction, TransactionBehavior};
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

#[derive(Debug)]
pub enum SpaceError {
	Database(DatabaseError),
	UnknownSpace { id: String },
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

	pub async fn delete(&self, id: String) -> Result<(), SpaceError> {
		self.access.call_mut(move |connection| Ok(deleted(connection, &id))).await?
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
	for (position, id) in ids.iter().enumerate() {
		let written = transaction.execute(
			"UPDATE spaces SET position = ?2 WHERE id = ?1",
			params![id, position as i64],
		)?;
		refuse_if_untouched(written, id)?;
	}
	if ids.iter().collect::<HashSet<_>>().len() < counted(&transaction)? as usize {
		return Err(SpaceError::IncompleteOrder);
	}
	transaction.commit()?;
	Ok(())
}

fn deleted(connection: &mut Connection, id: &str) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	if !held(&transaction, id)? {
		return Err(SpaceError::UnknownSpace { id: id.to_owned() });
	}
	if counted(&transaction)? <= 1 {
		return Err(SpaceError::LastSpace);
	}
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	transaction.execute(
		"DELETE FROM conversations WHERE id IN
			(SELECT conversation_id FROM conversation_participants
				WHERE bot_id IN (SELECT id FROM bots WHERE space_id = ?1))",
		[id],
	)?;
	transaction.execute("DELETE FROM spaces WHERE id = ?1", [id])?;
	transaction.commit()?;
	Ok(())
}

fn held(connection: &Connection, id: &str) -> Result<bool, SpaceError> {
	Ok(connection
		.query_row("SELECT EXISTS (SELECT 1 FROM spaces WHERE id = ?1)", [id], |row| row.get(0))?)
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
	use crate::db::repositories::conversations::{AvatarAnimal, BotIdentity};
	use crate::db::{count_of, open};

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
			names_of(&repository).await,
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
		let first = repository.list().await.expect("the spaces")[0].id.clone();
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
			names_of(&repository).await,
			vec!["Personal".to_owned(), "Vocca".to_owned()],
			"a refused order moved the spaces"
		);
		assert_eq!(first, repository.list().await.expect("the spaces")[0].id);

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
		database
			.conversations()
			.create_bot(an_identity("Ada"), Some(dropped.id.clone()), None)
			.await
			.expect("the bot of the space that goes");

		spaces.delete(dropped.id).await.expect("the space is deleted");

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
