use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Manager, Runtime};

use super::{
	drafted, git, learned, Author, HistoryEntry, Skill, SkillDraft, SkillFront, LEARNED_NAME,
	MANIFEST_DIR, MANIFEST_NAME, OPENNEST_KEY, PRELOAD_KEY, SKILLS_DIR, SKILL_NAME, VERSION,
};
use crate::private_files;

const DIR_NAME: &str = "spaces";

const PLUGIN_NAME: &str = "space";

const DESCRIPTION: &str = "What every bot in this space knows about the project it works on.";

const ABOUT_ID: &str = "about-this-space";

const ABOUT_DESCRIPTION: &str = "What this space is, and what every bot working in it needs.";

const WRITTEN_TITLE: &str = "The bot changed what it knows about the space";

const LAID_DOWN_TITLE: &str = "The space's plugin was laid down";

static COMMITS: Mutex<()> = Mutex::new(());

pub fn path<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(space_id))
}

pub fn lay_down<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let Some(path) = path(app, space_id) else {
		return;
	};
	let _ = lay_down_at(&path);
}

pub fn lay_down_at(path: &Path) -> std::io::Result<()> {
	kept(&path.join(SKILLS_DIR).join(ABOUT_ID).join(SKILL_NAME), about()?.as_bytes())?;
	kept(&manifest_file(path), manifest().as_bytes())?;
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	let _ = git::commit(path, Author::User, LAID_DOWN_TITLE, "");
	Ok(())
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Option<PathBuf> {
	path(app, space_id).filter(|path| manifest_file(path).is_file())
}

pub fn remove<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let Some(path) = path(app, space_id) else {
		return;
	};
	let _ = fs::remove_dir_all(path);
}

pub fn evolve(path: &Path) {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	let changed = git::changes(path);
	if changed.is_empty() {
		return;
	}
	let (title, body) =
		learned(path).unwrap_or_else(|| (WRITTEN_TITLE.to_owned(), changed.join("\n")));
	if git::commit(path, Author::Bot, &title, &body).is_err() {
		return;
	}
	let _ = fs::remove_file(path.join(LEARNED_NAME));
}

pub fn skills(path: &Path) -> Vec<Skill> {
	super::skills_at(path)
}

pub fn create_skill(path: &Path, draft: &SkillDraft) -> std::io::Result<Skill> {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	super::create_skill_at(path, draft)
}

pub fn update_skill(path: &Path, skill_id: &str, draft: &SkillDraft) -> std::io::Result<Skill> {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	super::update_skill_at(path, skill_id, draft)
}

pub fn set_skill_preloaded(
	path: &Path,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	super::set_skill_preloaded_at(path, skill_id, is_preloaded)
}

pub fn remove_skill(path: &Path, skill_id: &str) -> std::io::Result<()> {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	super::remove_skill_at(path, skill_id)
}

pub fn history(path: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	super::history_at(path)
}

pub fn diff(path: &Path, commit_id: &str) -> Result<String, git2::Error> {
	super::diff_at(path, commit_id)
}

pub fn revert(path: &Path, commit_id: &str) -> Result<String, git2::Error> {
	let _serialised = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	super::revert_at(path, commit_id)
}

fn kept(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	match private_files::write(path, bytes) {
		Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
		outcome => outcome,
	}
}

fn manifest_file(path: &Path) -> PathBuf {
	path.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

fn manifest() -> String {
	serde_json::json!({
		"name": PLUGIN_NAME,
		"version": VERSION,
		"description": DESCRIPTION,
	})
	.to_string()
}

fn about() -> std::io::Result<String> {
	let draft = SkillDraft {
		name: ABOUT_ID.to_owned(),
		description: ABOUT_DESCRIPTION.to_owned(),
		body: String::new(),
		front: SkillFront {
			metadata: Some(serde_json::json!({ OPENNEST_KEY: { PRELOAD_KEY: true } })),
			disable_model_invocation: Some(true),
			..SkillFront::default()
		},
	};
	drafted(None, &draft)
}

#[cfg(test)]
mod tests {
	use super::super::INVOCATION_KEY;
	use super::*;
	use std::thread;

	fn a_path(name: &str) -> PathBuf {
		let path = std::env::temp_dir().join(format!("opennest-space-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	fn about_file(path: &Path) -> PathBuf {
		path.join(SKILLS_DIR).join(ABOUT_ID).join(SKILL_NAME)
	}

	#[test]
	fn the_plugin_is_the_manifest_and_a_skill_with_nothing_in_it_yet() {
		let path = a_path("written");

		lay_down_at(&path).expect("the plugin is laid down");

		let manifest: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
				.expect("the manifest is JSON");
		assert_eq!(manifest["name"], PLUGIN_NAME);

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(text.contains(&format!("name: \"{ABOUT_ID}\"")), "got {text}");
		assert!(text.contains(&format!("{PRELOAD_KEY}: true")), "got {text}");
		assert!(text.contains(&format!("{INVOCATION_KEY}: true")), "got {text}");
		let (_, body) = text.rsplit_once("\n---\n").expect("the skill has frontmatter");
		assert!(body.trim().is_empty(), "got {body}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_launch_leaves_what_the_space_owns_as_it_was_left() {
		let path = a_path("kept");
		lay_down_at(&path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"ours").expect("the hand edit lands");

		lay_down_at(&path).expect("the plugin is laid down again");

		assert_eq!(fs::read_to_string(about_file(&path)).expect("the skill reads"), "ours");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_that_changed_nothing_writes_no_commit() {
		let path = a_path("quiet");
		lay_down_at(&path).expect("the plugin is laid down");

		evolve(&path);

		assert_eq!(git::history(&path).expect("the history reads").len(), 1);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_is_committed_under_the_title_the_bot_left_behind() {
		let path = a_path("learned");
		lay_down_at(&path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"The API lives in apps/api.")
			.expect("the write lands");
		private_files::replace(
			&path.join(LEARNED_NAME),
			b"I noted where the API lives\n\nThey pointed me at it.",
		)
		.expect("the note lands");

		evolve(&path);

		let history = git::history(&path).expect("the history reads");
		assert_eq!(history[0].title, "I noted where the API lives");
		assert_eq!(history[0].author, Author::Bot);
		assert!(!path.join(LEARNED_NAME).exists(), "the note is cleared");
		assert!(git::changes(&path).is_empty(), "the plugin is left committed");

		let _ = fs::remove_dir_all(&path);
	}

	fn a_draft(name: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: "How this project is laid out".to_owned(),
			body: body.to_owned(),
			front: SkillFront::default(),
		}
	}

	#[test]
	fn a_skill_written_in_the_space_is_kept_and_reaches_the_history() {
		let path = a_path("skilled");
		lay_down_at(&path).expect("the plugin is laid down");

		let created = create_skill(&path, &a_draft("how-we-ship", "Small commits."))
			.expect("the skill lands");

		assert_eq!(created.id, "how-we-ship");
		assert!(skills(&path).iter().any(|skill| skill.id == created.id));
		assert!(git::changes(&path).is_empty(), "the skill reached the history");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn undoing_a_change_puts_the_skill_back_as_it_was() {
		let path = a_path("undone");
		lay_down_at(&path).expect("the plugin is laid down");
		update_skill(&path, ABOUT_ID, &a_draft(ABOUT_ID, "The API lives in apps/api."))
			.expect("the edit lands");
		let latest = history(&path).expect("the history reads")[0].id.clone();

		revert(&path, &latest).expect("the change is undone");

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(!text.contains("apps/api"), "got {text}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_skill_removed_from_the_space_leaves_the_plugin() {
		let path = a_path("pruned");
		lay_down_at(&path).expect("the plugin is laid down");
		create_skill(&path, &a_draft("passing", "Gone soon.")).expect("the skill lands");

		remove_skill(&path, "passing").expect("the skill is removed");

		assert!(!skills(&path).iter().any(|skill| skill.id == "passing"));
		assert!(git::changes(&path).is_empty(), "the removal reached the history");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn the_diff_of_a_commit_reads_what_that_commit_changed() {
		let path = a_path("diffed");
		lay_down_at(&path).expect("the plugin is laid down");
		update_skill(&path, ABOUT_ID, &a_draft(ABOUT_ID, "The API lives in apps/api."))
			.expect("the edit lands");
		let latest = history(&path).expect("the history reads")[0].id.clone();

		let patch = diff(&path, &latest).expect("the diff reads");

		assert!(patch.contains("apps/api"), "got {patch}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn two_sessions_writing_at_once_both_reach_the_history() {
		let path = a_path("crowded");
		lay_down_at(&path).expect("the plugin is laid down");

		let writers: Vec<_> = ["one", "two"]
			.into_iter()
			.map(|name| {
				let path = path.clone();
				thread::spawn(move || {
					private_files::replace(
						&path.join(SKILLS_DIR).join(name).join(SKILL_NAME),
						name.as_bytes(),
					)
					.expect("the write lands");
					evolve(&path);
				})
			})
			.collect();
		for writer in writers {
			writer.join().expect("the session ends");
		}

		assert!(git::changes(&path).is_empty(), "every change reached the history");

		let _ = fs::remove_dir_all(&path);
	}
}
