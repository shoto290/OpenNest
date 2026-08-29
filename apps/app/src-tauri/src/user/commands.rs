
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::contract::{UserPreferences, UserPreferencesError};
use crate::avatars;
use crate::bundles;
use crate::conversations::commands::{bundled, recounted};
use crate::conversations::contract::{BotHistoryEntry, Skill, SkillDraft, TranscriptStoreError};
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

fn plugin_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TranscriptStoreError> {
	bundles::user::laid_down(app).ok_or_else(|| TranscriptStoreError::UnwritableBundle {
		detail: "the person's own plugin has not been laid down yet".to_owned(),
	})
}

fn read_history(path: &Path) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	recounted(bundles::user::history(path))
		.map(|entries| entries.into_iter().map(BotHistoryEntry::from).collect())
}

#[tauri::command]
pub async fn user_plugin_skills<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<Skill>, TranscriptStoreError> {
	let Some(path) = bundles::user::laid_down(&app) else {
		return Ok(Vec::new());
	};
	Ok(bundles::user::skills(&path).into_iter().map(Skill::from).collect())
}

#[tauri::command]
pub async fn user_plugin_create_skill<R: Runtime>(
	app: AppHandle<R>,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::create_skill(&path, &draft.into())).map(Skill::from)
}

#[tauri::command]
pub async fn user_plugin_update_skill<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::update_skill(&path, &skill_id, &draft.into())).map(Skill::from)
}

#[tauri::command]
pub async fn user_plugin_set_skill_preloaded<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
	is_preloaded: bool,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::set_skill_preloaded(&path, &skill_id, is_preloaded)).map(Skill::from)
}

#[tauri::command]
pub async fn user_plugin_delete_skill<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
) -> Result<(), TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::remove_skill(&path, &skill_id))
}

#[tauri::command]
pub async fn user_plugin_skill_file<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
	path: String,
) -> Result<String, TranscriptStoreError> {
	let plugin = plugin_path(&app)?;
	bundled(bundles::user::skill_file(&plugin, &skill_id, &path))
}

#[tauri::command]
pub async fn user_plugin_write_skill_file<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
	path: String,
	text: String,
) -> Result<(), TranscriptStoreError> {
	let plugin = plugin_path(&app)?;
	bundled(bundles::user::write_skill_file(&plugin, &skill_id, &path, &text))
}

#[tauri::command]
pub async fn user_plugin_delete_skill_file<R: Runtime>(
	app: AppHandle<R>,
	skill_id: String,
	path: String,
) -> Result<(), TranscriptStoreError> {
	let plugin = plugin_path(&app)?;
	bundled(bundles::user::remove_skill_file(&plugin, &skill_id, &path))
}

#[tauri::command]
pub async fn user_plugin_history<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let Some(path) = bundles::user::laid_down(&app) else {
		return Ok(Vec::new());
	};
	read_history(&path)
}

#[tauri::command]
pub async fn user_plugin_history_diff<R: Runtime>(
	app: AppHandle<R>,
	commit_id: String,
) -> Result<String, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	recounted(bundles::user::diff(&path, &commit_id))
}

#[tauri::command]
pub async fn user_plugin_revert<R: Runtime>(
	app: AppHandle<R>,
	commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundles::user::revert(&path, &commit_id)
		.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })?;
	read_history(&path)
}
