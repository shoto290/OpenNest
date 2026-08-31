use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::{
	drafted, git, learned, unrecorded, Author, Evolution, HistoryEntry, Skill, SkillDraft,
	SkillFront, LEARNED_NAME, MANIFEST_DIR, MANIFEST_NAME, OPENNEST_KEY, PRELOAD_KEY, SKILLS_DIR,
	SKILL_NAME, VERSION,
};
use crate::private_files;

const DIR_NAME: &str = "user";

const PLUGIN_NAME: &str = "me";

const DESCRIPTION: &str = "What every bot in OpenNest knows about the person it talks to.";

const ABOUT_ID: &str = "about-me";

const ABOUT_DESCRIPTION: &str = "Who the person you are talking to is, and how they work.";

const WRITTEN_TITLE: &str = "The bot changed what it knows about the person";

const LAID_DOWN_TITLE: &str = "The person's own plugin was laid down";

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn lay_down(path: &Path) -> std::io::Result<()> {
	kept(&path.join(SKILLS_DIR).join(ABOUT_ID).join(SKILL_NAME), about()?.as_bytes())?;
	kept(&manifest_file(path), manifest().as_bytes())?;
	let _serialised = super::serialised(path);
	git::commit(path, Author::User, LAID_DOWN_TITLE, "").map(|_| ()).map_err(unrecorded)
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| manifest_file(path).is_file())
}

pub fn evolve(path: &Path) -> Option<Evolution> {
	let _serialised = super::serialised(path);
	let changed = git::changes(path);
	if changed.is_empty() {
		return None;
	}
	let (title, body) =
		learned(path).unwrap_or_else(|| (WRITTEN_TITLE.to_owned(), changed.join("\n")));
	let commit_id = git::commit(path, Author::Bot, &title, &body).ok().flatten()?;
	let _ = fs::remove_file(path.join(LEARNED_NAME));
	Some(Evolution { commit_id, title })
}

pub fn skills(path: &Path) -> Vec<Skill> {
	super::skills_at(path)
}

pub fn create_skill(path: &Path, draft: &SkillDraft) -> std::io::Result<Skill> {
	super::create_skill_at(path, draft)
}

pub fn update_skill(path: &Path, skill_id: &str, draft: &SkillDraft) -> std::io::Result<Skill> {
	super::update_skill_at(path, skill_id, draft)
}

pub fn set_skill_preloaded(
	path: &Path,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	super::set_skill_preloaded_at(path, skill_id, is_preloaded)
}

pub fn remove_skill(path: &Path, skill_id: &str) -> std::io::Result<()> {
	super::remove_skill_at(path, skill_id)
}

pub fn skill_file(path: &Path, skill_id: &str, relative: &str) -> std::io::Result<String> {
	super::skill_file_at(path, skill_id, relative)
}

pub fn write_skill_file(
	path: &Path,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	super::write_skill_file_at(path, skill_id, relative, text)
}

pub fn remove_skill_file(path: &Path, skill_id: &str, relative: &str) -> std::io::Result<()> {
	super::remove_skill_file_at(path, skill_id, relative)
}

pub fn history(path: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	super::history_at(path)
}

pub fn diff(path: &Path, commit_id: &str) -> Result<String, git2::Error> {
	super::diff_at(path, commit_id)
}

pub fn revert(path: &Path, commit_id: &str) -> Result<String, git2::Error> {
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
		let path = std::env::temp_dir().join(format!("opennest-user-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	fn about_file(path: &Path) -> PathBuf {
		path.join(SKILLS_DIR).join(ABOUT_ID).join(SKILL_NAME)
	}

	#[test]
	fn the_plugin_is_the_manifest_and_a_skill_with_nothing_in_it_yet() {
		let path = a_path("written");

		lay_down(&path).expect("the plugin is laid down");

		let manifest: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
				.expect("the manifest is JSON");
		assert_eq!(manifest["name"], PLUGIN_NAME);

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(text.contains(&format!("{PRELOAD_KEY}: true")), "got {text}");
		assert!(text.contains(&format!("{INVOCATION_KEY}: true")), "got {text}");
		let (_, body) = text.rsplit_once("\n---\n").expect("the skill has frontmatter");
		assert!(body.trim().is_empty(), "got {body}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_plugin_whose_repository_refuses_the_commit_reports_the_failure() {
		let path = a_path("commit-refused");
		fs::create_dir_all(&path).expect("the plugin directory is there");
		fs::write(path.join(".git"), "not a repository").expect("the gitfile lands");

		let failure = lay_down(&path).expect_err("the commit is refused");
		assert_eq!(failure.kind(), std::io::ErrorKind::Other);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_launch_leaves_what_the_person_owns_as_they_left_it() {
		let path = a_path("kept");
		lay_down(&path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"mine").expect("the hand edit lands");

		lay_down(&path).expect("the plugin is laid down again");

		assert_eq!(fs::read_to_string(about_file(&path)).expect("the skill reads"), "mine");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_that_changed_nothing_writes_no_commit() {
		let path = a_path("quiet");
		lay_down(&path).expect("the plugin is laid down");

		assert_eq!(evolve(&path), None);

		assert_eq!(git::history(&path).expect("the history reads").len(), 1);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_is_committed_under_the_title_the_bot_left_behind() {
		let path = a_path("learned");
		lay_down(&path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"They like figs.").expect("the write lands");
		private_files::replace(
			&path.join(LEARNED_NAME),
			b"I noted that they like figs\n\nThey said so.",
		)
		.expect("the note lands");

		let evolution = evolve(&path).expect("the turn is recorded");

		let history = git::history(&path).expect("the history reads");
		assert_eq!(evolution.commit_id, history[0].id);
		assert_eq!(evolution.title, history[0].title);
		assert_eq!(history[0].title, "I noted that they like figs");
		assert_eq!(history[0].author, Author::Bot);
		assert!(!path.join(LEARNED_NAME).exists(), "the note is cleared");
		assert!(git::changes(&path).is_empty(), "the plugin is left committed");

		let _ = fs::remove_dir_all(&path);
	}

	fn a_draft(name: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: "How the person likes to be answered".to_owned(),
			body: body.to_owned(),
			front: SkillFront::default(),
		}
	}

	#[test]
	fn a_skill_the_person_writes_is_kept_and_reaches_the_history() {
		let path = a_path("skilled");
		lay_down(&path).expect("the plugin is laid down");

		let created =
			create_skill(&path, &a_draft("how-i-work", "Short answers.")).expect("the skill lands");

		assert_eq!(created.id, "how-i-work");
		assert!(skills(&path).iter().any(|skill| skill.id == created.id));
		assert!(git::changes(&path).is_empty(), "the skill reached the history");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn undoing_a_change_puts_the_skill_back_as_it_was() {
		let path = a_path("undone");
		lay_down(&path).expect("the plugin is laid down");
		update_skill(&path, ABOUT_ID, &a_draft(ABOUT_ID, "They like figs.")).expect("the edit lands");
		let latest = history(&path).expect("the history reads")[0].id.clone();

		revert(&path, &latest).expect("the change is undone");

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(!text.contains("figs"), "got {text}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_skill_the_person_removes_leaves_the_plugin() {
		let path = a_path("pruned");
		lay_down(&path).expect("the plugin is laid down");
		create_skill(&path, &a_draft("passing", "Gone soon.")).expect("the skill lands");

		remove_skill(&path, "passing").expect("the skill is removed");

		assert!(!skills(&path).iter().any(|skill| skill.id == "passing"));
		assert!(git::changes(&path).is_empty(), "the removal reached the history");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn two_sessions_writing_at_once_both_reach_the_history() {
		let path = a_path("crowded");
		lay_down(&path).expect("the plugin is laid down");

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
					let _recorded = evolve(&path);
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
