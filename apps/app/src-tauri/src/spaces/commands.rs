use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::contract::{Space, SpaceError};
use crate::bundles;
use crate::conversations::commands::{bundled, recounted};
use crate::conversations::contract::{
	AvatarBlot, BotHistoryEntry, Skill, SkillDraft, TranscriptStoreError,
};
use crate::db;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, SpaceError> {
	state.as_ref().map_err(|failure| SpaceError::Unavailable { failure: failure.into() })
}

#[tauri::command]
pub async fn space_list(state: State<'_, db::DatabaseState>) -> Result<Vec<Space>, SpaceError> {
	let stored = ready(&state)?.spaces().list().await?;
	Ok(stored.into_iter().map(Space::from).collect())
}

#[tauri::command]
pub async fn space_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	name: String,
) -> Result<Space, SpaceError> {
	let created = ready(&state)?.spaces().create(name).await?;
	bundles::space::lay_down(&app, &created.id);
	Ok(Space::from(created))
}

#[tauri::command]
pub async fn space_update(
	state: State<'_, db::DatabaseState>,
	id: String,
	name: String,
	colour: AvatarBlot,
) -> Result<Space, SpaceError> {
	Ok(ready(&state)?.spaces().update(id, name, colour.into()).await.map(Space::from)?)
}

#[tauri::command]
pub async fn space_reorder(
	state: State<'_, db::DatabaseState>,
	ids: Vec<String>,
) -> Result<(), SpaceError> {
	Ok(ready(&state)?.spaces().reorder(ids).await?)
}

#[tauri::command]
pub async fn space_delete<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), SpaceError> {
	ready(&state)?.spaces().delete(id.clone()).await?;
	bundles::space::remove(&app, &id);
	Ok(())
}

fn plugin_path<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
) -> Result<PathBuf, TranscriptStoreError> {
	bundles::space::laid_down(app, space_id).ok_or_else(|| TranscriptStoreError::UnwritableBundle {
		detail: "the space's plugin has not been laid down yet".to_owned(),
	})
}

fn read_history(path: &Path) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	recounted(bundles::space::history(path))
		.map(|entries| entries.into_iter().map(BotHistoryEntry::from).collect())
}

#[tauri::command]
pub async fn space_plugin_skills<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<Vec<Skill>, TranscriptStoreError> {
	let Some(path) = bundles::space::laid_down(&app, &space_id) else {
		return Ok(Vec::new());
	};
	Ok(bundles::space::skills(&path).into_iter().map(Skill::from).collect())
}

#[tauri::command]
pub async fn space_plugin_create_skill<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	bundled(bundles::space::create_skill(&path, &draft.into())).map(Skill::from)
}

#[tauri::command]
pub async fn space_plugin_update_skill<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	bundled(bundles::space::update_skill(&path, &skill_id, &draft.into())).map(Skill::from)
}

#[tauri::command]
pub async fn space_plugin_set_skill_preloaded<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
	is_preloaded: bool,
) -> Result<Skill, TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	bundled(bundles::space::set_skill_preloaded(&path, &skill_id, is_preloaded)).map(Skill::from)
}

#[tauri::command]
pub async fn space_plugin_delete_skill<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
) -> Result<(), TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	bundled(bundles::space::remove_skill(&path, &skill_id))
}

#[tauri::command]
pub async fn space_plugin_history<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let Some(path) = bundles::space::laid_down(&app, &space_id) else {
		return Ok(Vec::new());
	};
	read_history(&path)
}

#[tauri::command]
pub async fn space_plugin_history_diff<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	commit_id: String,
) -> Result<String, TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	recounted(bundles::space::diff(&path, &commit_id))
}

#[tauri::command]
pub async fn space_plugin_revert<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let path = plugin_path(&app, &space_id)?;
	bundles::space::revert(&path, &commit_id)
		.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })?;
	read_history(&path)
}
