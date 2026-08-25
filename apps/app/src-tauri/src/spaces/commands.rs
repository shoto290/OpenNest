use tauri::State;

use super::contract::{Space, SpaceError};
use crate::conversations::contract::AvatarBlot;
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
pub async fn space_create(
	state: State<'_, db::DatabaseState>,
	name: String,
) -> Result<Space, SpaceError> {
	Ok(ready(&state)?.spaces().create(name).await.map(Space::from)?)
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
pub async fn space_delete(
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), SpaceError> {
	Ok(ready(&state)?.spaces().delete(id).await?)
}
