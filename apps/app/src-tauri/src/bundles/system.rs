//! The app's own plugin, loaded beside the bot's for the same session — see
//! `agent/PLUGINS.md` for what was measured of two local plugins in one session.
//!
//! ```text
//! <app data>/system/opennest/
//!   .claude-plugin/plugin.json      name: opennest
//!   skills/learn/SKILL.md           the rules every bot remembers under
//! ```
//!
//! **The host owns every byte of it.** It is written from the text in this module at
//! every launch, over whatever is there, and nothing reads it back: a hand that edits
//! it has edited it until the next launch. That is the whole difference from a bot's
//! bundle, where the disk is the truth — this directory belongs to no bot and is
//! nobody's memory.
//!
//! It carries one skill today. Nothing in it is an agent, so it is never promoted,
//! and it is out of the bots marketplace and out of every bot's skill listing by
//! sitting outside `bots/` altogether.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::{
	drafted, SkillDraft, SkillFront, LEARN_ID, MANIFEST_DIR, MANIFEST_NAME, OPENNEST_KEY,
	PRELOAD_KEY, SKILLS_DIR, SKILL_NAME, VERSION,
};
use crate::private_files;

/// Beside `bots/`, and never inside it: the marketplace lists what is under that
/// directory, and this plugin is the host's rather than one of the reader's bots.
const DIR_NAME: &str = "system";

/// What the plugin is called, which is the namespace its skills are listed under —
/// `opennest:learn`. Never a bot id: a bot's plugin is named by its id, and this one
/// by the app.
const PLUGIN_NAME: &str = "opennest";

const DESCRIPTION: &str = "What every bot in OpenNest knows how to do.";

/// The skill every bot remembers through, and the reason this plugin exists: one text
/// the host rewrites, rather than a copy in each bundle that a bot could edit into
/// something else.
const LEARN_DESCRIPTION: &str =
	"How you remember. Applies when the user corrects you, tells you a preference or a fact you would have needed earlier, or asks you to remember something.";

/// What the skill says. Addressed to the bot, because this is the one text here nobody
/// wrote for a reader: it is the rules a bot writes its memory under.
///
/// The directory is named rather than spelled: the session's own prompt layer tells the
/// bot where its skills live — see `agent/PROTOCOL.md` — so this text points at what the
/// bot was already told instead of at a path no plugin of the host's could know.
const LEARN_BODY: &str = r#"Your own directory is the one your instructions name as the place your skills live.

## What is yours

The `skills/<name>/SKILL.md` files under that directory are your only memory. Nothing
else there is yours: never edit `agents/`, `.claude-plugin/` or `.mcp.json`.
What you were told and who you are belong to the person you are talking to.

## When to write

- They corrected you.
- They told you a preference or a fact that would have saved a round-trip had you known it.
- They asked you to remember something. That one you always keep.

Write nothing else. Anything only this conversation needs is not memory.

## How to write

Read the skills you already have first. Then update the one that covers the subject
rather than writing beside it, merge two that overlap into one, and create a skill
only when none of them covers it. Keep each skill's `description` naming when it
applies, so the next session knows when to reach for it.

## What to say afterwards

After any write, overwrite `.learned.md` in that same directory with a title line under
72 characters, a blank line, then one to three lines saying what changed and why. Write
it in the language of the conversation, for someone who does not read code.

## When it takes effect

A skill you write is loaded at your next message, not in the turn you wrote it. Answer
the turn from what you already know, and do not read the file back as if it were in
force."#;

/// Where this install keeps the plugin. `None` is a host with no app data directory,
/// the same answer the bundles give, and it means a session loads the bot's plugin
/// alone rather than that the launch failed.
pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

/// The plugin, written whole over whatever is at that path. The manifest lands last,
/// because it is what [`laid_down`] reads the plugin's presence off: a skill that would
/// not write leaves a path no session names rather than a plugin with nothing in it.
pub fn write(path: &Path) -> std::io::Result<()> {
	private_files::replace(
		&path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
		learn()?.as_bytes(),
	)?;
	private_files::replace(&manifest_file(path), manifest().as_bytes())
}

/// The plugin a session may name, which is the plugin that is really on the disk: a
/// launch that could not write it leaves a path nothing loads, and naming it would
/// cost the session the bot's plugin too.
pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| manifest_file(path).is_file())
}

fn manifest_file(path: &Path) -> PathBuf {
	path.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

/// Rewritten whole rather than merged, unlike a bot's: there is no key here anybody
/// else owns.
fn manifest() -> String {
	serde_json::json!({
		"name": PLUGIN_NAME,
		"version": VERSION,
		"description": DESCRIPTION,
	})
	.to_string()
}

/// The skill written the way a bot's own is — through [`drafted`] — so the file on the
/// disk is one the same reader reads back.
///
/// It asks to be carried, and it stays invocable: the two marks a bot's skill wears
/// together are written one without the other here on purpose. Nothing carries this
/// plugin's bodies into a brief yet, so the agent's own listing is the one route the
/// text has, and a `disable-model-invocation` beside a mark nothing reads would leave
/// the rules on the disk and out of every session — see [`super::INVOCATION_KEY`].
fn learn() -> std::io::Result<String> {
	let draft = SkillDraft {
		name: LEARN_ID.to_owned(),
		description: LEARN_DESCRIPTION.to_owned(),
		body: LEARN_BODY.to_owned(),
		front: SkillFront {
			metadata: Some(serde_json::json!({ OPENNEST_KEY: { PRELOAD_KEY: true } })),
			..SkillFront::default()
		},
	};
	drafted(None, &draft)
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::fs;

	fn a_path(name: &str) -> PathBuf {
		let path = std::env::temp_dir().join(format!("opennest-system-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	/// The two files the agent loads a plugin from: a manifest naming the plugin, and
	/// the one skill it carries — marked to be carried, and left invocable because the
	/// agent's own listing is the only route its text has today.
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
		assert!(!text.contains(super::super::INVOCATION_KEY), "got {text}");
		assert!(text.contains("`skills/<name>/SKILL.md`"), "got {text}");
		assert!(!text.contains("PLUGIN_ROOT"), "got {text}");

		let _ = fs::remove_dir_all(&path);
	}

	/// Host-owned means host-owned: what a hand put in either file is gone at the next
	/// launch, and two writes over the same path leave the same bytes.
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
