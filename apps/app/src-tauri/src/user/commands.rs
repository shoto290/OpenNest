
use tauri::{AppHandle, Runtime, State};

use super::contract::{UserPreferences, UserPreferencesError};
use crate::avatars;
use crate::db;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, UserPreferencesError> {
	state.as_ref().map_err(|failure| UserPreferencesError::Unavailable { failure: failure.into() })
}

#[tauri::command]
pub async fn user_preferences<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<UserPreferences, UserPreferencesError> {
	let dir = avatars::dir(&app);
	let stored = ready(&state)?.user().preferences().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

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
