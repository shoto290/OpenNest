use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

use super::contract::{EnvEntry, EnvError, EnvScope};
use super::store;

fn writable_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, EnvError> {
	store::root(app).ok_or_else(|| EnvError::Unwritable {
		detail: "the application data directory is unavailable".to_owned(),
	})
}

#[tauri::command]
pub async fn env_set<R: Runtime>(
	app: AppHandle<R>,
	scope: EnvScope,
	name: String,
	value: String,
) -> Result<(), EnvError> {
	store::set(&writable_root(&app)?, &scope, &name, &value)
}

#[tauri::command]
pub async fn env_delete<R: Runtime>(
	app: AppHandle<R>,
	scope: EnvScope,
	name: String,
) -> Result<(), EnvError> {
	store::delete(&writable_root(&app)?, &scope, &name)
}

#[tauri::command]
pub async fn env_list<R: Runtime>(
	app: AppHandle<R>,
	scope: EnvScope,
) -> Result<Vec<EnvEntry>, EnvError> {
	store::list(&writable_root(&app)?, &scope)
}
