//! The one preferences record as the frontend reaches it.
//!
//! Three crossings and no rules: the record is read, replaced or pointed at a new
//! picture, and what a value may be is decided by the vocabulary it deserializes
//! into or by the repository that stores it.
//!
//! A host whose file never opened still runs, so nothing here assumes there is a
//! database — the managed [`db::DatabaseState`] is read first and the frontend is
//! told the record is not being stored, and why, rather than handed defaults it
//! would go on writing over.

use tauri::{AppHandle, Runtime, State};

use super::contract::{UserPreferences, UserPreferencesError};
use crate::avatars;
use crate::db;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, UserPreferencesError> {
	state.as_ref().map_err(|failure| UserPreferencesError::Unavailable { failure: failure.into() })
}

/// The record as it stands. A file nobody has written preferences into answers the
/// defaults rather than nothing: there is one record, always, and the app opens on
/// it.
#[tauri::command]
pub async fn user_preferences<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<UserPreferences, UserPreferencesError> {
	let dir = avatars::dir(&app);
	let stored = ready(&state)?.user().preferences().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

/// The record replaced whole, which is also how the picture is taken off: a write
/// carrying no `profilePicturePath` leaves the record pointing at nothing, and the
/// sweep that follows takes the file with it. A caller echoing back the path it was
/// handed keeps the picture it already had.
#[tauri::command]
pub async fn user_set_preferences<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	preferences: UserPreferences,
) -> Result<UserPreferences, UserPreferencesError> {
	let dir = avatars::dir(&app);
	let database = ready(&state)?;
	let stored = database.user().set_preferences(preferences.into()).await?;
	avatars::sweep_referenced(database, dir.as_deref()).await;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

/// The picture the record wears, from bytes the user picked. The order is the same
/// one a bot's picture is written in and for the same reasons — see
/// [`crate::conversations::commands::conversation_set_bot_avatar_image`]: refused
/// in memory first, then the database, then the row, then the bytes, then the
/// sweep.
///
/// A write that fails puts the record back on the picture it held rather than on
/// none, and that path comes out of the same transaction that moved off it, so
/// what is restored is exactly what was replaced. The sweep then takes the file
/// nobody references, which is the half-written one.
#[tauri::command]
pub async fn user_set_profile_picture<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bytes: Vec<u8>,
) -> Result<UserPreferences, UserPreferencesError> {
	let normalised = avatars::picture::normalised(&bytes)?;
	let database = ready(&state)?;
	let dir = avatars::dir(&app).ok_or(avatars::Rejection::Unwritable {
		detail: "there is no application data directory to store avatars in".to_owned(),
	})?;
	let path = avatars::minted_path(&dir);
	// Lossy for the reason a bot's picture is: the name is this host's own UUID, so
	// nothing here can arrive as bytes no encoding survives.
	let recorded = path.to_string_lossy().into_owned();
	let swapped = database.user().swap_avatar_image_path(Some(recorded)).await?;
	if let Err(rejection) = avatars::write(&path, &normalised) {
		let _ = database.user().swap_avatar_image_path(swapped.previous).await;
		avatars::sweep_referenced(database, Some(&dir)).await;
		return Err(rejection.into());
	}
	avatars::sweep_referenced(database, Some(&dir)).await;
	Ok(UserPreferences::of(swapped.stored, Some(&dir)))
}
