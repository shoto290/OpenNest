use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "kiroshi";

const MANIFEST: &str = ".claude-plugin/plugin.json";

const LEARN: &str = "skills/learn/SKILL.md";

const ROUTINES: &str = "skills/routines/SKILL.md";

const MISSIONS: &str = "skills/missions/SKILL.md";

const INSTALLS: &str = "skills/applications/SKILL.md";

const TRIGGERS: &str = ".triggers.json";

pub(crate) const APPLICATIONS: &str = "applications/catalogue.json";

const FILES: [(&str, &[u8]); 14] = [
	(MANIFEST, include_bytes!("../../plugins/kiroshi/.claude-plugin/plugin.json")),
	(TRIGGERS, include_bytes!("../../plugins/kiroshi/.triggers.json")),
	(LEARN, include_bytes!("../../plugins/kiroshi/skills/learn/SKILL.md")),
	(ROUTINES, include_bytes!("../../plugins/kiroshi/skills/routines/SKILL.md")),
	(INSTALLS, include_bytes!("../../plugins/kiroshi/skills/applications/SKILL.md")),
	(MISSIONS, include_bytes!("../../plugins/kiroshi/skills/missions/SKILL.md")),
	(
		"skills/learn/references/skills.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/skills.md"),
	),
	(
		"skills/learn/references/mcp.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/mcp.md"),
	),
	(
		"skills/learn/references/determinism.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/determinism.md"),
	),
	(APPLICATIONS, include_bytes!("../../plugins/kiroshi/applications/catalogue.json")),
	(
		"applications/logos/github.svg",
		include_bytes!("../../plugins/kiroshi/applications/logos/github.svg"),
	),
	(
		"applications/logos/linear.svg",
		include_bytes!("../../plugins/kiroshi/applications/logos/linear.svg"),
	),
	(
		"applications/logos/paper.svg",
		include_bytes!("../../plugins/kiroshi/applications/logos/paper.svg"),
	),
	(
		"applications/logos/superset.svg",
		include_bytes!("../../plugins/kiroshi/applications/logos/superset.svg"),
	),
];

pub(crate) fn file(name: &str) -> Option<&'static [u8]> {
	FILES.iter().find(|(held, _)| *held == name).map(|(_, bytes)| *bytes)
}

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn write(path: &Path) -> std::io::Result<()> {
	for (name, bytes) in FILES {
		private_files::replace(&path.join(name), bytes)?;
	}
	prune(path, &embedded_paths(path));
	Ok(())
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| path.join(MANIFEST).is_file())
}

fn embedded_paths(path: &Path) -> HashSet<PathBuf> {
	FILES.iter().map(|(name, _)| path.join(name)).collect()
}

fn prune(dir: &Path, embedded: &HashSet<PathBuf>) {
	let Ok(entries) = fs::read_dir(dir) else {
		return;
	};
	for found in entries.flatten().map(|entry| entry.path()) {
		if found.is_dir() {
			prune(&found, embedded);
			let _ = fs::remove_dir(&found);
		} else if !embedded.contains(&found) {
			let _ = fs::remove_file(&found);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::super::{MEMORY_CLOSE, MEMORY_OPEN, SKILL_NAME};
	use super::*;

	fn a_path(name: &str) -> PathBuf {
		let path = std::env::temp_dir().join(format!("kiroshi-system-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	fn committed() -> PathBuf {
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join(PLUGIN_NAME)
	}

	fn committed_files(dir: &Path) -> Vec<PathBuf> {
		let Ok(entries) = fs::read_dir(dir) else {
			return Vec::new();
		};
		entries
			.flatten()
			.map(|entry| entry.path())
			.flat_map(|path| if path.is_dir() { committed_files(&path) } else { vec![path] })
			.collect()
	}

	fn embedded(name: &str) -> &'static [u8] {
		FILES
			.iter()
			.find(|(held, _)| *held == name)
			.map(|(_, bytes)| *bytes)
			.unwrap_or_else(|| panic!("{name} is embedded"))
	}

	#[test]
	fn the_manifest_carries_the_crate_version() {
		let manifest: serde_json::Value =
			serde_json::from_slice(embedded(MANIFEST)).expect("the manifest is JSON");

		assert_eq!(manifest["name"], PLUGIN_NAME);
		assert_eq!(manifest["version"], env!("CARGO_PKG_VERSION"));
	}

	#[test]
	fn the_learn_skill_carries_its_frontmatter_and_the_memory_markers() {
		let text = String::from_utf8_lossy(embedded(LEARN));

		assert!(text.contains("disable-model-invocation: true"), "got {text}");
		assert!(text.contains("preload: true"), "got {text}");
		assert!(text.contains(MEMORY_OPEN), "got {text}");
		assert!(text.contains(MEMORY_CLOSE), "got {text}");
	}

	#[test]
	fn the_routines_skill_is_preloaded_and_says_when_to_ask_before_it_writes() {
		let text = String::from_utf8_lossy(embedded(ROUTINES));

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"List first.",
			"wait for their yes",
			"never a cron expression",
			"Routines panel",
			"works there exactly as anywhere else",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_missions_skill_is_preloaded_and_says_when_a_mission_closes() {
		let text = String::from_utf8_lossy(embedded(MISSIONS));

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"`working`",
			"`waiting_bot`",
			"`waiting_human`",
			"`ready_to_merge`",
			"`failed`",
			"`done`",
			"`mission_list`, the missions of this conversation with their id, their ticket and where",
			"Close every mission you opened that nothing else closed, once the work is over.",
			"When the pull request of a watched mission is merged, the mission closes as done on its",
			"A mission reaches `ready_to_merge` and `done` from its checkout only while its branch is",
			"A red CI, a failing test and a coding agent that is blocked are work still to do in the",
			"Ask, never guess.",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_applications_skill_is_preloaded_and_says_where_an_install_goes_and_what_follows() {
		let text = String::from_utf8_lossy(embedded(INSTALLS));

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"Search before you install.",
			"`AskUserQuestion`",
			"`metadata.source` set to `application-scope:`",
			"exactly as it answered it",
			"`companion`, you",
			"`space`, every companion of",
			"`user`, the person",
			"Install only in the destination the person picked",
			"Never ask for a key",
			"never repeat one",
			"there is nothing left to do",
			"the name of the secret",
			"Settings panel of that destination",
			"Connect lives in the Settings panel of that destination",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn every_committed_file_is_embedded() {
		let root = committed();

		for file in committed_files(&root) {
			let name = file
				.strip_prefix(&root)
				.expect("the file sits under the plugin")
				.to_string_lossy()
				.replace('\\', "/");
			assert_eq!(embedded(&name), fs::read(&file).expect("it reads"), "got {name}");
		}
	}

	#[test]
	fn the_written_plugin_is_the_embedded_directory() {
		let path = a_path("written");

		write(&path).expect("the plugin is written");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_write_overwrites_a_hand_edit_and_drops_a_stray_file() {
		let path = a_path("rewritten");
		write(&path).expect("the plugin is written");
		private_files::replace(&path.join(MANIFEST), b"{\"name\":\"mine\"}")
			.expect("the hand edit lands");
		let stray = path.join("skills").join("mine").join(SKILL_NAME);
		private_files::replace(&stray, b"mine").expect("the stray file lands");

		write(&path).expect("the plugin is written again");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}
		assert!(!stray.exists(), "the stray file is gone");
		assert!(!stray.parent().expect("it has a directory").exists(), "the directory is gone");

		let _ = fs::remove_dir_all(&path);
	}
}
