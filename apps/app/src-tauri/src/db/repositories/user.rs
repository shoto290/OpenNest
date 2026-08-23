//! What the person at the keyboard chose to be called, to look at, to read in and
//! to be told about: one record, held as one row per field of the shipped
//! `app_settings` table.
//!
//! A table of its own would be a table that can only ever hold one row, so the
//! key/value store already in the schema is what carries it. One key per field
//! rather than one key holding a document: a value stays a word a human can read
//! out of the file, and nothing here has to parse — which is also what lets a
//! value this build has never heard of fall back to the default instead of taking
//! the whole record down with it.
//!
//! There is no row to create and none to delete. A field nobody has set is a key
//! that is not there, and [`Preferences::default`] is what it reads as, so the
//! first launch and a launch after a write answer through the same path. The
//! picture and the language are the two fields whose absence is written by removing
//! their key: a path is what the sweep reads and an empty string would point
//! nowhere, and no language is the machine's own rather than a name.

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

/// The two words a switch is stored as.
const SWITCH_ON: &str = "on";
const SWITCH_OFF: &str = "off";

/// What the app opens on before anyone has chosen: the palette the product ships
/// its surfaces in. A palette is a name the frontend holds the list of — see
/// [`Preferences::palette`] — so this side names one and refuses none.
const DEFAULT_PALETTE: &str = "amber";

const READ_SETTING: &str = "SELECT value FROM app_settings WHERE key = ?1";
/// The key is the primary key, so a second write of the same field is an update
/// rather than a refusal — the record is replaced whole every time it is written.
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

/// Which of the two themes the app paints in, or that it follows the system. The
/// three words are the frontend's own, and the boundary refuses a fourth, so a
/// scheme read out of the file names something the UI can already draw.
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

	/// Anything but the two explicit words is `System`, including a value some later
	/// build wrote and this one has never heard of: following the system is the
	/// answer that is right for every install, and a read that refused would leave
	/// the app with no scheme to paint in at all.
	fn of(stored: &str) -> Self {
		match stored {
			"light" => ColorScheme::Light,
			"dark" => ColorScheme::Dark,
			_ => ColorScheme::System,
		}
	}
}

/// The whole record. `avatar_image_path` is the path as it was stored, exactly as
/// `bots.avatar_image_path` is: whether it names a file the webview may be pointed
/// at is decided where a row becomes an answer, never here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preferences {
	pub display_name: String,
	pub avatar_image_path: Option<String>,
	pub color_scheme: ColorScheme,
	/// Free text, for the reason `bots.model` is: which palettes exist is the
	/// frontend's to change, and a name this build refused would be a palette the UI
	/// could paint and the file could not remember.
	pub palette: String,
	/// Which language the app reads in, as free text for the reason `palette` is.
	/// `None` is nobody having chosen, which the frontend reads as the language of
	/// the machine — a default named here would be a choice this side made for a
	/// catalogue it does not hold.
	pub language: Option<String>,
	/// Whether the bot asking a question is worth a notification.
	pub notify_on_question: bool,
	/// Whether the bot asking for a permission is worth a notification.
	pub notify_on_permission: bool,
	/// Whether the bot finishing a turn is worth a notification. A turn that failed
	/// is not this event: it is a turn the screen already says something about.
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

/// A picture replaced, and the one it replaced. Both come out of the same
/// transaction because the caller writes the file after the row and has to put
/// back exactly what it moved off if that write fails — a path read before the
/// swap would be a path another write could have changed in between.
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

	/// The record as it stands, defaults included. Never fails for being unset:
	/// there is nothing to find on a fresh install and that is an answer, not a miss.
	pub async fn preferences(&self) -> Result<Preferences, DatabaseError> {
		self.access.call(stored_in).await
	}

	/// The record replaced whole: every field is written, so one the caller left out
	/// is a field it meant to clear rather than one it meant to keep. Answers with
	/// what the file holds after the write rather than with what was handed in.
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

	/// Where the record's picture points, moved and read back in one transaction.
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

	/// The picture the record still points at, for the sweep that decides which
	/// files survive. Answered exactly as stored, for the reason
	/// [`super::conversations::ConversationsRepository::avatar_image_paths`] is.
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

/// A switch, off and on: the key gone and every word but the one that turns it off.
/// Read the way a scheme is — see [`ColorScheme::of`], and for the same reason. It
/// also makes a key nobody has written and a word this build has never heard of the
/// one answer, so the default cannot drift from the fallback.
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

/// A switch turned off is a word in the file rather than a key removed, which is
/// why this is not [`write_optional_in`]: a key that is not there already reads as
/// on.
fn write_switch_in(
	transaction: &Transaction<'_>,
	key: &str,
	notifies: bool,
) -> Result<(), DatabaseError> {
	transaction.execute(WRITE_SETTING, params![key, switch_as_stored(notifies)])?;
	Ok(())
}

/// No picture is the key gone rather than an empty value: every reader of this
/// field treats it as a path, and the sweep is one of them.
fn write_picture_in(
	transaction: &Transaction<'_>,
	path: Option<&str>,
) -> Result<(), DatabaseError> {
	write_optional_in(transaction, AVATAR_IMAGE_PATH_KEY, path)
}

/// A field nobody has set is the key gone rather than a value that has to be read
/// as nothing: what the file holds and what [`Preferences::default`] answers stay
/// the same shape.
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

	/// A file nobody has written preferences into still answers a record, and it is
	/// the one the app opens on.
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

	/// A field left out of a write is cleared rather than kept: the record is one
	/// value the caller emits whole.
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

	/// The whole point of swapping rather than reading and then writing: the caller
	/// is handed the path it moved off, so a file write that fails can put back
	/// exactly that one.
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

	/// A scheme this build has never heard of is followed by the system rather than
	/// refused: a read that failed would leave the app with nothing to paint in.
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

	/// A file written before the language had a key of its own answers a record with
	/// no language, and everything the older build did write is still on it.
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

	/// A switch a build has never heard of notifies rather than being refused, for
	/// the reason a scheme outside the three words follows the system.
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

	/// Each switch is a word under a key of its own, so no reader of one has to know
	/// what the other two hold.
	#[tokio::test]
	async fn every_switch_is_stored_under_a_key_of_its_own() {
		let dir = temp_dir();
		let database = open(&dir);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(setting(&database, NOTIFY_ON_QUESTION_KEY).await, Some("off".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_PERMISSION_KEY).await, Some("on".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_FINISHED_TURN_KEY).await, Some("off".to_owned()));
	}

	/// A language name is free text, exactly as a palette is: the file remembers what
	/// the frontend chose whether or not this build ships a catalogue for it.
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
