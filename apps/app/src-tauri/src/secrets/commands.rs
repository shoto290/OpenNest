use tauri::State;

use super::contract::SecretError;
use super::store::{SecretStore, StoreStatus, StoredKeys};

#[tauri::command]
pub async fn secret_set(
	store: State<'_, SecretStore>,
	bot_id: String,
	key: String,
	value: String,
) -> Result<(), SecretError> {
	store.set(&bot_id, &key, &value)
}

#[tauri::command]
pub async fn secret_keys(
	store: State<'_, SecretStore>,
	bot_id: String,
) -> Result<StoredKeys, SecretError> {
	Ok(store.stored_keys(&bot_id))
}

#[tauri::command]
pub async fn secret_delete(
	store: State<'_, SecretStore>,
	bot_id: String,
	key: String,
) -> Result<(), SecretError> {
	store.delete(&bot_id, &key)
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
