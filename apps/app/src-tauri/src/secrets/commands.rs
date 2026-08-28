use tauri::State;

use super::contract::SecretError;
use super::store::SecretStore;

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
) -> Result<Vec<String>, SecretError> {
	Ok(store.keys(&bot_id))
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
pub async fn secret_store_ready(store: State<'_, SecretStore>) -> Result<bool, SecretError> {
	Ok(store.is_ready())
}
