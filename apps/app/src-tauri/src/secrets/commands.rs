use tauri::State;

use crate::db;

use super::contract::{owner_for, space_owner, SecretError, SecretScope};
use super::store::{SecretStore, StoreStatus, StoredKeys};

async fn space_of(database: &db::DatabaseState, bot_id: &str) -> Option<String> {
	let database = database.as_ref().ok()?;
	let bot = database.conversations().bot(bot_id.to_owned()).await.ok()??;
	(!bot.space_id.is_empty()).then_some(bot.space_id)
}

#[tauri::command]
pub async fn secret_set(
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	bot_id: String,
	key: String,
	value: String,
	scope: Option<SecretScope>,
	server: Option<String>,
) -> Result<(), SecretError> {
	let scope = scope.unwrap_or_default();
	let space_id = space_of(&database, &bot_id).await;
	let owner = owner_for(scope, &bot_id, space_id.as_deref(), server.as_deref())?;
	store.set(&owner, &key, &value)
}

#[tauri::command]
pub async fn secret_space_set(
	store: State<'_, SecretStore>,
	space_id: String,
	key: String,
	value: String,
) -> Result<(), SecretError> {
	store.set(&space_owner(&space_id), &key, &value)
}

#[tauri::command]
pub async fn secret_space_keys(
	store: State<'_, SecretStore>,
	space_id: String,
) -> Result<StoredKeys, SecretError> {
	Ok(store.stored_space_keys(&space_id))
}

#[tauri::command]
pub async fn secret_space_delete(
	store: State<'_, SecretStore>,
	space_id: String,
	key: String,
) -> Result<(), SecretError> {
	store.delete(&space_owner(&space_id), &key)
}

#[tauri::command]
pub async fn secret_keys(
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<StoredKeys, SecretError> {
	let space_id = space_of(&database, &bot_id).await;
	Ok(store.stored_keys(&bot_id, space_id.as_deref()))
}

#[tauri::command]
pub async fn secret_delete(
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	bot_id: String,
	key: String,
	scope: Option<SecretScope>,
	server: Option<String>,
) -> Result<(), SecretError> {
	let scope = scope.unwrap_or_default();
	let space_id = space_of(&database, &bot_id).await;
	let owner = owner_for(scope, &bot_id, space_id.as_deref(), server.as_deref())?;
	store.delete(&owner, &key)
}

#[tauri::command]
pub async fn secret_unlock_vault(
	store: State<'_, SecretStore>,
	passphrase: String,
) -> Result<(), SecretError> {
	store.unlock(&passphrase)
}

#[tauri::command]
pub async fn secret_store_status(
	store: State<'_, SecretStore>,
) -> Result<StoreStatus, SecretError> {
	Ok(store.status())
}
