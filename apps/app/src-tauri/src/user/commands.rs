
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::contract::{UserPreferences, UserPreferencesError};
use crate::avatars;
use crate::bundles;
use crate::conversations::commands::{bundled, recounted};
use crate::conversations::contract::{
	BotChangedFile, BotHistoryEntry, McpServer, Skill, SkillDraft, TranscriptStoreError,
};
use crate::db;
use crate::environment;
use crate::environment::contract::EnvOwner;

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
) -> Result<Skill, TranscriptStoreError> {
	let plugin = plugin_path(&app)?;
	bundled(bundles::user::write_skill_file(&plugin, &skill_id, &path, &text)).map(Skill::from)
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
pub async fn user_plugin_mcp_servers<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<McpServer>, TranscriptStoreError> {
	let Some(path) = bundles::user::laid_down(&app) else {
		return Ok(Vec::new());
	};
	Ok(bundles::user::mcp_servers(&path).into_iter().map(McpServer::from).collect())
}

#[tauri::command]
pub async fn user_plugin_set_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	name: String,
	config: serde_json::Value,
) -> Result<McpServer, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::set_mcp_server(&path, &name, &config)).map(McpServer::from)
}

#[tauri::command]
pub async fn user_plugin_delete_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	name: String,
) -> Result<(), TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundled(bundles::user::remove_mcp_server(&path, &name))?;
	environment::store::forget_server(&app, &EnvOwner::User, &name);
	Ok(())
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
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotChangedFile>, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	recounted(bundles::user::changed_files(&path, &oldest_commit_id, &newest_commit_id))
		.map(|files| files.into_iter().map(BotChangedFile::from).collect())
}

#[tauri::command]
pub async fn user_plugin_revert<R: Runtime>(
	app: AppHandle<R>,
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let path = plugin_path(&app)?;
	bundles::user::revert(&path, &oldest_commit_id, &newest_commit_id)
		.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })?;
	read_history(&path)
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::environment::contract::EnvScope;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::App;
	use tauri::Manager;

	fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.kiroshi.user-commands-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
		app
	}

	fn laid_down_for(app: &App<MockRuntime>) -> PathBuf {
		let path = bundles::user::path(app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&path).expect("the plugin is laid down");
		path
	}

	fn a_clock() -> serde_json::Value {
		serde_json::json!({ "command": "clock" })
	}

	fn the_person_server(name: &str) -> EnvScope {
		EnvScope::Server { name: name.to_owned(), owner: EnvOwner::User }
	}

	fn env_root(app: &App<MockRuntime>) -> PathBuf {
		environment::store::root(app.handle()).expect("the store has a home")
	}

	fn forget_host(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(dir);
		}
	}

	#[tokio::test]
	async fn a_person_whose_plugin_was_never_laid_down_declares_no_server() {
		let app = a_host("never-laid");

		let listed = user_plugin_mcp_servers(app.handle().clone()).await.expect("the list reads");

		assert!(listed.is_empty());
		forget_host(&app);
	}

	#[tokio::test]
	async fn a_server_set_for_the_person_is_listed_back() {
		let app = a_host("set");
		laid_down_for(&app);

		let written =
			user_plugin_set_mcp_server(app.handle().clone(), "clock".to_owned(), a_clock())
				.await
				.expect("the server lands");
		let listed = user_plugin_mcp_servers(app.handle().clone()).await.expect("the list reads");

		assert_eq!(written.name, "clock");
		assert_eq!(listed.iter().map(|server| server.name.as_str()).collect::<Vec<_>>(), ["clock"]);
		forget_host(&app);
	}

	#[tokio::test]
	async fn a_configuration_that_is_not_an_object_is_refused_and_the_file_stands() {
		let app = a_host("not-an-object");
		let path = laid_down_for(&app);
		user_plugin_set_mcp_server(app.handle().clone(), "clock".to_owned(), a_clock())
			.await
			.expect("the server lands");
		let held = fs::read_to_string(path.join(".mcp.json")).expect("the file reads");

		let refused = user_plugin_set_mcp_server(
			app.handle().clone(),
			"broken".to_owned(),
			serde_json::json!(["clock"]),
		)
		.await;

		assert!(matches!(refused, Err(TranscriptStoreError::UnwritableBundle { .. })));
		assert_eq!(fs::read_to_string(path.join(".mcp.json")).expect("the file reads"), held);
		forget_host(&app);
	}

	#[tokio::test]
	async fn a_server_deleted_for_the_person_takes_its_environment_with_it() {
		let app = a_host("delete");
		laid_down_for(&app);
		let root = env_root(&app);
		user_plugin_set_mcp_server(app.handle().clone(), "clock".to_owned(), a_clock())
			.await
			.expect("the server lands");
		environment::store::set(&root, &the_person_server("clock"), "REGION", "eu")
			.expect("the environment is written");

		user_plugin_delete_mcp_server(app.handle().clone(), "clock".to_owned())
			.await
			.expect("the server is removed");

		let listed = user_plugin_mcp_servers(app.handle().clone()).await.expect("the list reads");
		assert!(listed.is_empty());
		assert!(environment::store::values(&root, &the_person_server("clock"))
			.expect("the store reads")
			.is_empty());
		forget_host(&app);
	}

	#[tokio::test]
	async fn deleting_a_server_the_person_never_declared_is_refused_and_forgets_nothing() {
		let app = a_host("delete-undeclared");
		laid_down_for(&app);
		let root = env_root(&app);
		environment::store::set(&root, &the_person_server("clock"), "REGION", "eu")
			.expect("the environment is written");

		let refused = user_plugin_delete_mcp_server(app.handle().clone(), "clock".to_owned()).await;

		assert!(matches!(refused, Err(TranscriptStoreError::UnwritableBundle { .. })));
		assert_eq!(
			environment::store::values(&root, &the_person_server("clock"))
				.expect("the store reads")
				.get("REGION")
				.map(String::as_str),
			Some("eu")
		);
		forget_host(&app);
	}
}
