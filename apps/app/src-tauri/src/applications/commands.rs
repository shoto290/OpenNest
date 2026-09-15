use super::contract::{Application, ApplicationsError};
use super::{catalogue, registry};

#[tauri::command]
pub async fn application_catalogue() -> Result<Vec<Application>, ApplicationsError> {
	catalogue::curated()
}

#[tauri::command]
pub async fn application_search(query: String) -> Result<Vec<Application>, ApplicationsError> {
	registry::search(registry::REGISTRY, &query).await
}
