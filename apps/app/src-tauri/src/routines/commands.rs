use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use super::contract::TriggerSource;
use super::sources;
use crate::bundles;
use crate::conversations::commands::{bot_row, ready};
use crate::conversations::contract::TranscriptStoreError;
use crate::db;

#[tauri::command]
pub async fn routine_trigger_sources<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	sources::stacked(&stacked_bundles(&app, &bot.space_id, &bot.id))
}

fn stacked_bundles<R: Runtime>(app: &AppHandle<R>, space_id: &str, bot_id: &str) -> Vec<PathBuf> {
	[
		bundles::system::laid_down(app),
		bundles::space::laid_down(app, space_id),
		bundles::root(app).map(|root| bundles::dir(&root, bot_id)),
	]
	.into_iter()
	.flatten()
	.collect()
}
