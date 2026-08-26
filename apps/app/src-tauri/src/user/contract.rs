use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::conversations::contract::{AvatarRejection, StorageFailure};
use crate::db::repositories::user;
use crate::db::DatabaseError;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
	pub display_name: String,
	pub profile_picture_path: Option<String>,
	pub color_scheme: ColorScheme,
	pub palette: String,
	pub language: Option<String>,
	pub notify_on_question: bool,
	pub notify_on_permission: bool,
	pub notify_on_finished_turn: bool,
	pub notify_with_sound: bool,
	pub sidebar_width: Option<u32>,
	pub last_space_id: Option<String>,
	#[serde(default)]
	pub last_bot_id_by_space: BTreeMap<String, String>,
}

impl UserPreferences {
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
			notify_with_sound: preferences.notify_with_sound,
			sidebar_width: preferences.sidebar_width,
			last_space_id: preferences.last_space_id,
			last_bot_id_by_space: preferences.last_bot_id_by_space,
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
			notify_with_sound: preferences.notify_with_sound,
			sidebar_width: preferences.sidebar_width,
			last_space_id: preferences.last_space_id,
			last_bot_id_by_space: preferences.last_bot_id_by_space,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UserPreferencesError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
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
