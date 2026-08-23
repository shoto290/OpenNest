//! The one preferences record as the frontend meets it.
//!
//! Mirrored rather than derived on the stored type, for the reason
//! [`crate::conversations::contract`] mirrors its own: the vocabulary the file
//! keeps and the vocabulary the webview reads are allowed to move apart, and a
//! `#[serde(rename)]` on a stored type would let a renamed word reach the disk.
//!
//! Whether a stored path names a file the webview may be pointed at is decided
//! here and nowhere else — [`UserPreferences::of`] does for the record exactly what
//! [`crate::conversations::contract::Bot::of`] does for a bot.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::conversations::contract::{AvatarRejection, StorageFailure};
use crate::db::repositories::user;
use crate::db::DatabaseError;

/// Which of the two themes the app paints in, or that it follows the system. A
/// fourth word fails deserialization, so the command is never entered and nothing
/// outside these three reaches the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorScheme {
	System,
	Light,
	Dark,
}

impl From<user::ColorScheme> for ColorScheme {
	fn from(scheme: user::ColorScheme) -> Self {
		match scheme {
			user::ColorScheme::System => ColorScheme::System,
			user::ColorScheme::Light => ColorScheme::Light,
			user::ColorScheme::Dark => ColorScheme::Dark,
		}
	}
}

impl From<ColorScheme> for user::ColorScheme {
	fn from(scheme: ColorScheme) -> Self {
		match scheme {
			ColorScheme::System => user::ColorScheme::System,
			ColorScheme::Light => user::ColorScheme::Light,
			ColorScheme::Dark => user::ColorScheme::Dark,
		}
	}
}

/// The record, in both directions: a caller writes exactly what a read answers,
/// so a field left out of a write is one it meant to clear rather than one it
/// meant to keep.
///
/// `profilePicturePath` is the host's to hand out and never a caller's to invent —
/// the same rule `avatarImagePath` follows on a bot. It comes back as an absolute
/// path inside the one directory avatars live in, and only while the file is still
/// there. Echo it to keep the picture, send `null` to take it off;
/// [`commands::user_set_profile_picture`] is how a new one is put on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
	pub display_name: String,
	pub profile_picture_path: Option<String>,
	pub color_scheme: ColorScheme,
	/// A name, not a vocabulary: see [`user::Preferences::palette`].
	pub palette: String,
	/// The language the app reads in, or `null` for nobody having chosen — which
	/// this side answers as sent and the frontend reads as the machine's own. A name
	/// no catalogue answers to is stored all the same: see
	/// [`user::Preferences::language`].
	pub language: Option<String>,
	/// The three events worth telling the reader about, each switched on its own and
	/// each shipped on: see [`user::Preferences::notify_on_question`]. A turn that
	/// failed is deliberately not one of them.
	pub notify_on_question: bool,
	pub notify_on_permission: bool,
	pub notify_on_finished_turn: bool,
}

impl UserPreferences {
	/// The stored record as the frontend meets it. Anything [`avatars::readable`]
	/// refuses — outside the directory, gone, not a file — comes back as no picture,
	/// which is the record back on its initials rather than a fetch the UI has to
	/// recover from. `None` for the directory is a run with nowhere to keep avatars,
	/// and reads the same way.
	pub fn of(preferences: user::Preferences, avatars: Option<&Path>) -> Self {
		let profile_picture_path = preferences
			.avatar_image_path
			.as_deref()
			.zip(avatars)
			.and_then(|(recorded, dir)| avatars::readable(dir, recorded))
			.map(|path| path.to_string_lossy().into_owned());
		Self {
			display_name: preferences.display_name,
			profile_picture_path,
			color_scheme: preferences.color_scheme.into(),
			palette: preferences.palette,
			language: preferences.language,
			notify_on_question: preferences.notify_on_question,
			notify_on_permission: preferences.notify_on_permission,
			notify_on_finished_turn: preferences.notify_on_finished_turn,
		}
	}
}

impl From<UserPreferences> for user::Preferences {
	fn from(preferences: UserPreferences) -> Self {
		Self {
			display_name: preferences.display_name,
			avatar_image_path: preferences.profile_picture_path,
			color_scheme: preferences.color_scheme.into(),
			palette: preferences.palette,
			language: preferences.language,
			notify_on_question: preferences.notify_on_question,
			notify_on_permission: preferences.notify_on_permission,
			notify_on_finished_turn: preferences.notify_on_finished_turn,
		}
	}
}

/// Every way a preferences command can refuse. The two storage failures are kept
/// apart for the reason [`crate::conversations::contract::TranscriptStoreError`]
/// keeps them apart: `unavailable` says nothing is being stored this whole run,
/// `storage` says this one call did not land. There is no "unknown record" — the
/// record is one the file always answers, written or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UserPreferencesError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	/// The bytes offered as a profile picture were not stored. The record still
	/// points at whatever it pointed at before the upload.
	#[serde(rename_all = "camelCase")]
	RejectedProfilePicture { reason: AvatarRejection },
}

impl From<DatabaseError> for UserPreferencesError {
	fn from(error: DatabaseError) -> Self {
		UserPreferencesError::Storage { failure: StorageFailure::from(&error) }
	}
}

impl From<avatars::Rejection> for UserPreferencesError {
	fn from(rejection: avatars::Rejection) -> Self {
		UserPreferencesError::RejectedProfilePicture { reason: rejection.into() }
	}
}
