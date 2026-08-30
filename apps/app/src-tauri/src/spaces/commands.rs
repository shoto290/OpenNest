use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::contract::{Space, SpaceError, SpacePreferences};
use crate::bundles;
use crate::conversations::commands::{bundled, list_bundles, recounted};
use crate::conversations::contract::{
	AvatarBlot, BotHistoryEntry, Skill, SkillDraft, TranscriptStoreError,
};
use crate::db;
use crate::environment;

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
	colour: Option<AvatarBlot>,
) -> Result<Space, SpaceError> {
	Ok(ready(&state)?
		.spaces()
		.update(id, name, colour.map(Into::into))
		.await
		.map(Space::from)?)
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
	let database = ready(&state)?;
	let held_bots = database.spaces().delete(id.clone()).await?;
	bundles::space::remove(&app, &id);
	forget_bundles(bundles::root(&app).as_deref(), database, &held_bots).await;
	environment::store::forget_space(&app, &id, &held_bots);
	Ok(())
}

#[tauri::command]
pub async fn space_preferences(
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<SpacePreferences, SpaceError> {
	Ok(ready(&state)?.space_settings().preferences(space_id).await.map(SpacePreferences::from)?)
}

#[tauri::command]
pub async fn space_set_preferences(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	preferences: SpacePreferences,
) -> Result<SpacePreferences, SpaceError> {
	Ok(ready(&state)?
		.space_settings()
		.set_preferences(space_id, preferences.into())
		.await
		.map(SpacePreferences::from)?)
}

async fn forget_bundles(root: Option<&Path>, database: &db::Database, bot_ids: &[String]) {
	if let Some(root) = root {
		for bot_id in bot_ids {
			bundles::remove(root, bot_id);
		}
	}
	list_bundles(root, database).await;
}

#[tauri::command]
pub async fn bot_move_to_space(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	Ok(ready(&state)?.spaces().move_bot(bot_id, space_id).await?)
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
pub async fn space_plugin_skill_file<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
	path: String,
) -> Result<String, TranscriptStoreError> {
	let plugin = plugin_path(&app, &space_id)?;
	bundled(bundles::space::skill_file(&plugin, &skill_id, &path))
}

#[tauri::command]
pub async fn space_plugin_write_skill_file<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
	path: String,
	text: String,
) -> Result<Skill, TranscriptStoreError> {
	let plugin = plugin_path(&app, &space_id)?;
	bundled(bundles::space::write_skill_file(&plugin, &skill_id, &path, &text)).map(Skill::from)
}

#[tauri::command]
pub async fn space_plugin_delete_skill_file<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	skill_id: String,
	path: String,
) -> Result<(), TranscriptStoreError> {
	let plugin = plugin_path(&app, &space_id)?;
	bundled(bundles::space::remove_skill_file(&plugin, &skill_id, &path))
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

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::repositories::conversations::{AvatarAnimal, BotIdentity};

	fn a_root(name: &str) -> PathBuf {
		let root = std::env::temp_dir().join(format!("opennest-space-bundles-{name}"));
		let _ = fs::remove_dir_all(&root);
		root
	}

	fn bundle_name(slug: &str, bot_id: &str) -> String {
		format!("{slug}-{}", &bot_id[..8])
	}

	fn a_bundle(root: &Path, bot_id: &str) -> PathBuf {
		let bundle = bundles::dir(root, bot_id);
		fs::create_dir_all(&bundle).expect("the bundle stands");
		bundle
	}

	fn a_database(root: &Path) -> db::Database {
		fs::create_dir_all(root).expect("the root stands");
		db::open(root)
	}

	async fn a_bot_of(database: &db::Database, space_id: &str, name: &str) -> String {
		let identity = BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: AvatarAnimal::Owl,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: "Answer briefly.".to_owned(),
			denied_tools: Vec::new(),
		};
		database
			.conversations()
			.create_bot(identity, Some(space_id.to_owned()), None)
			.await
			.expect("the bot is created")
			.id
	}

	#[tokio::test]
	async fn the_bundles_the_deletion_cascaded_leave_the_disk() {
		let root = a_root("cascaded");
		let database = a_database(&root);
		let held = a_bundle(&root, "b1");
		let other = a_bundle(&root, "b2");
		let kept = a_bundle(&root, "b3");

		forget_bundles(Some(&root), &database, &["b1".to_owned(), "b2".to_owned()]).await;

		assert!(!held.exists());
		assert!(!other.exists());
		assert!(kept.exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn a_bundle_that_is_already_gone_does_not_hold_back_the_next_one() {
		let root = a_root("absent");
		let database = a_database(&root);
		let held = a_bundle(&root, "b2");

		forget_bundles(Some(&root), &database, &["b1".to_owned(), "b2".to_owned()]).await;

		assert!(!held.exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn a_deleted_space_leaves_the_marketplace_listing_only_the_bots_that_remain() {
		let root = a_root("marketplace");
		let database = a_database(&root);
		let leaving = database.spaces().create("Leaving".to_owned()).await.expect("a space");
		let staying = database.spaces().create("Staying".to_owned()).await.expect("a space");
		let cascaded = a_bot_of(&database, &leaving.id, "Bean").await;
		let kept = a_bot_of(&database, &staying.id, "Sprout").await;

		let held_bots =
			database.spaces().delete(leaving.id.clone()).await.expect("the space is deleted");
		forget_bundles(Some(&root), &database, &held_bots).await;

		let listed =
			fs::read_to_string(bundles::marketplace_file(&root)).expect("the marketplace is there");
		assert!(!listed.contains(&bundle_name("bean", &cascaded)), "got {listed}");
		assert!(listed.contains(&bundle_name("sprout", &kept)), "got {listed}");
		assert!(!bundles::dir(&root, &cascaded).exists());

		let _ = fs::remove_dir_all(&root);
	}
}
