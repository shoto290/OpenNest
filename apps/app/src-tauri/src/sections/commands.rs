use tauri::State;

use super::contract::{RosterPin, Section, SectionError};
use crate::db;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, SectionError> {
	state.as_ref().map_err(|failure| SectionError::Unavailable { failure: failure.into() })
}

#[tauri::command]
pub async fn section_list(
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<Section>, SectionError> {
	let stored = ready(&state)?.sections().list(space_id).await?;
	Ok(stored.into_iter().map(Section::from).collect())
}

#[tauri::command]
pub async fn section_create(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<Section, SectionError> {
	Ok(ready(&state)?.sections().create(space_id, name).await.map(Section::from)?)
}

#[tauri::command]
pub async fn section_rename(
	state: State<'_, db::DatabaseState>,
	id: String,
	name: String,
) -> Result<Section, SectionError> {
	Ok(ready(&state)?.sections().rename(id, name).await.map(Section::from)?)
}

#[tauri::command]
pub async fn roster_pin(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	pins: Vec<RosterPin>,
) -> Result<(), SectionError> {
	let held = pins.into_iter().map(Into::into).collect();
	Ok(ready(&state)?.sections().pin(space_id, held).await?)
}

#[tauri::command]
pub async fn section_delete(
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), SectionError> {
	Ok(ready(&state)?.sections().delete(id).await?)
}

#[tauri::command]
pub async fn bot_move_to_section(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	section_id: Option<String>,
) -> Result<(), SectionError> {
	Ok(ready(&state)?.sections().move_bot(bot_id, section_id).await?)
}
