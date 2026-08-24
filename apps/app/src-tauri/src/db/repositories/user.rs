
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};

use crate::db::{Access, DatabaseError};

const DISPLAY_NAME_KEY: &str = "user.display_name";
const AVATAR_IMAGE_PATH_KEY: &str = "user.avatar_image_path";
const COLOR_SCHEME_KEY: &str = "user.color_scheme";
const PALETTE_KEY: &str = "user.palette";
const LANGUAGE_KEY: &str = "user.language";
const NOTIFY_ON_QUESTION_KEY: &str = "user.notify_on_question";
const NOTIFY_ON_PERMISSION_KEY: &str = "user.notify_on_permission";
const NOTIFY_ON_FINISHED_TURN_KEY: &str = "user.notify_on_finished_turn";

const SWITCH_ON: &str = "on";
const SWITCH_OFF: &str = "off";

const DEFAULT_PALETTE: &str = "amber";

const READ_SETTING: &str = "SELECT value FROM app_settings WHERE key = ?1";
const WRITE_SETTING: &str = "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
	ON CONFLICT (key) DO UPDATE SET value = excluded.value";
const CLEAR_SETTING: &str = "DELETE FROM app_settings WHERE key = ?1";

fn switch_as_stored(notifies: bool) -> &'static str {
	if notifies {
		SWITCH_ON
	} else {
		SWITCH_OFF
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ColorScheme {
	#[default]
	System,
	Light,
	Dark,
}

impl ColorScheme {
	fn as_stored(self) -> &'static str {
		match self {
			ColorScheme::System => "system",
			ColorScheme::Light => "light",
			ColorScheme::Dark => "dark",
		}
	}

	fn of(stored: &str) -> Self {
		match stored {
			"light" => ColorScheme::Light,
			"dark" => ColorScheme::Dark,
			_ => ColorScheme::System,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preferences {
	pub display_name: String,
	pub avatar_image_path: Option<String>,
	pub color_scheme: ColorScheme,
	pub palette: String,
	pub language: Option<String>,
	pub notify_on_question: bool,
	pub notify_on_permission: bool,
	pub notify_on_finished_turn: bool,
}

impl Default for Preferences {
	fn default() -> Self {
		Self {
			display_name: String::new(),
			avatar_image_path: None,
			color_scheme: ColorScheme::default(),
			palette: DEFAULT_PALETTE.to_owned(),
			language: None,
			notify_on_question: true,
			notify_on_permission: true,
			notify_on_finished_turn: true,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PictureSwap {
	pub stored: Preferences,
	pub previous: Option<String>,
}

pub struct UserRepository {
	access: Access,
}

impl UserRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn preferences(&self) -> Result<Preferences, DatabaseError> {
		self.access.call(stored_in).await
	}

	pub async fn set_preferences(
		&self,
		preferences: Preferences,
	) -> Result<Preferences, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				write_in(&transaction, &preferences)?;
				let stored = stored_in(&transaction)?;
				transaction.commit()?;
				Ok(stored)
			})
			.await
	}

	pub async fn swap_avatar_image_path(
		&self,
		path: Option<String>,
	) -> Result<PictureSwap, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				let previous = setting_in(&transaction, AVATAR_IMAGE_PATH_KEY)?;
				write_picture_in(&transaction, path.as_deref())?;
				let stored = stored_in(&transaction)?;
				transaction.commit()?;
				Ok(PictureSwap { stored, previous })
			})
			.await
	}

	pub async fn avatar_image_path(&self) -> Result<Option<String>, DatabaseError> {
		self.access.call(|connection| setting_in(connection, AVATAR_IMAGE_PATH_KEY)).await
	}
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn stored_in(connection: &Connection) -> Result<Preferences, DatabaseError> {
	let defaults = Preferences::default();
	Ok(Preferences {
		display_name: setting_in(connection, DISPLAY_NAME_KEY)?.unwrap_or(defaults.display_name),
		avatar_image_path: setting_in(connection, AVATAR_IMAGE_PATH_KEY)?,
		color_scheme: setting_in(connection, COLOR_SCHEME_KEY)?
			.map_or(defaults.color_scheme, |stored| ColorScheme::of(&stored)),
		palette: setting_in(connection, PALETTE_KEY)?.unwrap_or(defaults.palette),
		language: setting_in(connection, LANGUAGE_KEY)?,
		notify_on_question: switch_in(connection, NOTIFY_ON_QUESTION_KEY)?,
		notify_on_permission: switch_in(connection, NOTIFY_ON_PERMISSION_KEY)?,
		notify_on_finished_turn: switch_in(connection, NOTIFY_ON_FINISHED_TURN_KEY)?,
	})
}

fn switch_in(connection: &Connection, key: &str) -> Result<bool, DatabaseError> {
	Ok(setting_in(connection, key)?.is_none_or(|stored| stored != SWITCH_OFF))
}

fn setting_in(connection: &Connection, key: &str) -> Result<Option<String>, DatabaseError> {
	Ok(connection.query_row(READ_SETTING, [key], |row| row.get(0)).optional()?)
}

fn write_in(transaction: &Transaction<'_>, preferences: &Preferences) -> Result<(), DatabaseError> {
	transaction.execute(WRITE_SETTING, params![DISPLAY_NAME_KEY, preferences.display_name])?;
	transaction
		.execute(WRITE_SETTING, params![COLOR_SCHEME_KEY, preferences.color_scheme.as_stored()])?;
	transaction.execute(WRITE_SETTING, params![PALETTE_KEY, preferences.palette])?;
	write_optional_in(transaction, LANGUAGE_KEY, preferences.language.as_deref())?;
	write_switch_in(transaction, NOTIFY_ON_QUESTION_KEY, preferences.notify_on_question)?;
	write_switch_in(transaction, NOTIFY_ON_PERMISSION_KEY, preferences.notify_on_permission)?;
	write_switch_in(transaction, NOTIFY_ON_FINISHED_TURN_KEY, preferences.notify_on_finished_turn)?;
	write_picture_in(transaction, preferences.avatar_image_path.as_deref())
}

fn write_switch_in(
	transaction: &Transaction<'_>,
	key: &str,
	notifies: bool,
) -> Result<(), DatabaseError> {
	transaction.execute(WRITE_SETTING, params![key, switch_as_stored(notifies)])?;
	Ok(())
}

fn write_picture_in(
	transaction: &Transaction<'_>,
	path: Option<&str>,
) -> Result<(), DatabaseError> {
	write_optional_in(transaction, AVATAR_IMAGE_PATH_KEY, path)
}

fn write_optional_in(
	transaction: &Transaction<'_>,
	key: &str,
	value: Option<&str>,
) -> Result<(), DatabaseError> {
	match value {
		Some(value) => {
			transaction.execute(WRITE_SETTING, params![key, value])?;
		}
		None => {
			transaction.execute(CLEAR_SETTING, [key])?;
		}
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	fn a_record() -> Preferences {
		Preferences {
			display_name: "Nyx".to_owned(),
			avatar_image_path: Some("/data/avatars/one.png".to_owned()),
			color_scheme: ColorScheme::Dark,
			palette: "moss".to_owned(),
			language: Some("fr".to_owned()),
			notify_on_question: false,
			notify_on_permission: true,
			notify_on_finished_turn: false,
		}
	}

	async fn setting(database: &Database, key: &'static str) -> Option<String> {
		database.call(move |connection| setting_in(connection, key)).await.expect("the read")
	}

	#[tokio::test]
	async fn a_record_nobody_has_written_reads_as_the_defaults() {
		let dir = temp_dir();
		let database = open(&dir);

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(
			read,
			Preferences {
				display_name: String::new(),
				avatar_image_path: None,
				color_scheme: ColorScheme::System,
				palette: DEFAULT_PALETTE.to_owned(),
				language: None,
				notify_on_question: true,
				notify_on_permission: true,
				notify_on_finished_turn: true,
			}
		);
	}

	#[tokio::test]
	async fn a_written_record_is_answered_and_read_back_whole() {
		let dir = temp_dir();
		let database = open(&dir);

		let answered = database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(answered, a_record());
		assert_eq!(database.user().preferences().await.expect("the record"), a_record());
	}

	#[tokio::test]
	async fn a_second_write_replaces_every_field_of_the_first() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_preferences(a_record()).await.expect("the first write");

		let replaced = database
			.user()
			.set_preferences(Preferences::default())
			.await
			.expect("the second write");

		assert_eq!(replaced, Preferences::default());
		assert_eq!(
			setting(&database, AVATAR_IMAGE_PATH_KEY).await,
			None,
			"a picture taken off the record was left in the file"
		);
		assert_eq!(
			setting(&database, LANGUAGE_KEY).await,
			None,
			"a language taken off the record was left in the file"
		);
	}

	#[tokio::test]
	async fn swapping_the_picture_answers_the_path_it_replaced() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_preferences(a_record()).await.expect("the write");

		let swapped = database
			.user()
			.swap_avatar_image_path(Some("/data/avatars/two.png".to_owned()))
			.await
			.expect("the swap");

		assert_eq!(swapped.previous, a_record().avatar_image_path);
		assert_eq!(swapped.stored.avatar_image_path, Some("/data/avatars/two.png".to_owned()));
		assert_eq!(swapped.stored.display_name, "Nyx", "a picture write moved another field");
	}

	#[tokio::test]
	async fn the_sweep_is_told_about_the_picture_the_record_points_at() {
		let dir = temp_dir();
		let database = open(&dir);

		assert_eq!(database.user().avatar_image_path().await.expect("the path"), None);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(
			database.user().avatar_image_path().await.expect("the path"),
			a_record().avatar_image_path
		);
	}

	#[tokio::test]
	async fn a_scheme_outside_the_three_words_reads_as_following_the_system() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				transaction.execute(WRITE_SETTING, params![COLOR_SCHEME_KEY, "sepia"])?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.color_scheme, ColorScheme::System);
	}

	#[tokio::test]
	async fn a_record_without_a_language_answers_the_rest_of_it() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				transaction.execute(WRITE_SETTING, params![DISPLAY_NAME_KEY, "Nyx"])?;
				transaction.execute(WRITE_SETTING, params![PALETTE_KEY, "moss"])?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the older build's rows");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.language, None);
		assert_eq!(read.display_name, "Nyx");
		assert_eq!(read.palette, "moss");
		assert!(read.notify_on_question, "a switch the older build never wrote must read as on");
	}

	#[tokio::test]
	async fn a_switch_outside_the_two_words_reads_as_notifying() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				transaction.execute(WRITE_SETTING, params![NOTIFY_ON_QUESTION_KEY, "maybe"])?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert!(read.notify_on_question);
	}

	#[tokio::test]
	async fn every_switch_is_stored_under_a_key_of_its_own() {
		let dir = temp_dir();
		let database = open(&dir);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(setting(&database, NOTIFY_ON_QUESTION_KEY).await, Some("off".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_PERMISSION_KEY).await, Some("on".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_FINISHED_TURN_KEY).await, Some("off".to_owned()));
	}

	#[tokio::test]
	async fn a_language_the_host_has_never_heard_of_is_stored_as_written() {
		let dir = temp_dir();
		let database = open(&dir);

		let stored = database
			.user()
			.set_preferences(Preferences { language: Some("br".to_owned()), ..a_record() })
			.await
			.expect("the write");

		assert_eq!(stored.language, Some("br".to_owned()));
		assert_eq!(
			database.user().preferences().await.expect("the record").language,
			Some("br".to_owned())
		);
	}
}
