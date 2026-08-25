
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::{
	drafted, SkillDraft, SkillFront, LEARN_ID, MANIFEST_DIR, MANIFEST_NAME, MEMORY_CLOSE,
	MEMORY_OPEN, OPENNEST_KEY, PRELOAD_KEY, SKILLS_DIR, SKILL_NAME, VERSION,
};
use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "opennest";

const DESCRIPTION: &str = "What every bot in OpenNest knows how to do.";

const LEARN_DESCRIPTION: &str =
	"How you remember. Applies when the user corrects you, tells you a preference or a fact you would have needed earlier, or asks you to remember something.";

fn learn_body() -> String {
	format!(
		r#"Your own directory is the one your instructions name as the place your skills live.

## What is yours

Two places under that directory are yours. Your agent file, under `agents/`, holds what
you always know. The `skills/<name>/SKILL.md` files hold what a task calls for. Nothing
else there is yours: never edit `.claude-plugin/` or `.mcp.json`.

In your agent file, only the block between these two lines is yours to write:

{MEMORY_OPEN}
{MEMORY_CLOSE}

Everything above the opening line is who you are and what you were told. It belongs to
the person you are talking to and you never edit it. Everything below the block is
generated and gets overwritten. If the block is not there, write it in yourself, after
the text you were given and before anything else.

## When to write

- They corrected you.
- They told you a preference or a fact that would have saved a round-trip had you known it.
- They asked you to remember something. That one you always keep.

Write nothing else. Anything only this conversation needs is not memory.

## Yours, the space's or the person's

Your instructions name two other directories, and each one takes a different kind of fact.

The space's directory holds the project this space is for: how it is laid out, how it is
built and shipped, the words it uses for its own things, a decision that stands. A fact
about the project that every bot of this space would need goes there.

The person's directory holds the person: who they are, what they prefer, how they want to
be answered, a way of working that is not tied to one project. A fact about them goes
there.

Your own directory holds your job: the steps of a task only you carry out. That stays with
you and goes nowhere else.

Read a file of the space's directory again, as it stands on disk, immediately before you
write it: every bot of this space writes there, and one of them may have changed it since
your session opened. Then merge your line into what is there instead of writing over it.
Do the same in the person's directory, which every bot reads. Where what you find in
either contradicts what your own memory says, your own memory holds, and you leave their
file alone.

## Which of the two

Something true whatever you are asked — who they are, how they want you to answer, a
standing fact about their work — goes in the block, in a line or two. A procedure a task
triggers — the steps of a job you only do when it comes up — goes in a skill.

## How to write

Read what the block already says, and the skills you already have. Then rewrite the line
that covers the subject rather than adding beside it, and keep the block short enough to
read at a glance. For a skill, update the one that covers the subject, merge two that
overlap into one, and create one only when none of them covers it. Keep each skill's
`description` naming when it applies, so the next session knows when to reach for it.

## What to say afterwards

After any write, overwrite `.learned.md` in the directory you wrote in, with a title line under
72 characters, a blank line, then one to three lines saying what changed and why. Write
it in the language of the conversation, for someone who does not read code.

## When it takes effect

What you write is loaded at your next message, not in the turn you wrote it. Answer the
turn from what you already know, and do not read the file back as if it were in force."#
	)
}

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn write(path: &Path) -> std::io::Result<()> {
	private_files::replace(
		&path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
		learn()?.as_bytes(),
	)?;
	private_files::replace(&manifest_file(path), manifest().as_bytes())
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| manifest_file(path).is_file())
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

fn learn() -> std::io::Result<String> {
	let draft = SkillDraft {
		name: LEARN_ID.to_owned(),
		description: LEARN_DESCRIPTION.to_owned(),
		body: learn_body(),
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
	use std::fs;

	fn a_path(name: &str) -> PathBuf {
		let path = std::env::temp_dir().join(format!("opennest-system-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	#[test]
	fn the_written_plugin_is_the_manifest_and_the_learn_skill() {
		let path = a_path("written");

		write(&path).expect("the plugin is written");

		let manifest: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
				.expect("the manifest is JSON");
		assert_eq!(manifest["name"], PLUGIN_NAME);
		assert_eq!(manifest["version"], VERSION);

		let skill = path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME);
		let text = fs::read_to_string(&skill).expect("the skill reads");
		assert!(text.contains(&format!("{PRELOAD_KEY}: true")), "got {text}");
		assert!(text.contains(&format!("{INVOCATION_KEY}: true")), "got {text}");
		assert!(text.contains("`skills/<name>/SKILL.md`"), "got {text}");
		assert!(!text.contains("PLUGIN_ROOT"), "got {text}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_write_lays_the_same_plugin_down_over_a_hand_edit() {
		let path = a_path("rewritten");
		write(&path).expect("the plugin is written");
		let first = fs::read_to_string(path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME))
			.expect("the skill reads");
		private_files::replace(&manifest_file(&path), b"{\"name\":\"mine\"}")
			.expect("the hand edit lands");

		write(&path).expect("the plugin is written again");

		let manifest = fs::read_to_string(manifest_file(&path)).expect("it reads");
		assert!(manifest.contains(PLUGIN_NAME), "got {manifest}");
		assert_eq!(
			fs::read_to_string(path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME))
				.expect("the skill reads"),
			first
		);

		let _ = fs::remove_dir_all(&path);
	}
}
