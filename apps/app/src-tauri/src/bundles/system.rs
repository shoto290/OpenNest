use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "opennest";

const MANIFEST: &str = ".claude-plugin/plugin.json";

const LEARN: &str = "skills/learn/SKILL.md";

const TRIGGERS: &str = ".triggers.json";

const FILES: [(&str, &[u8]); 6] = [
	(MANIFEST, include_bytes!("../../plugins/opennest/.claude-plugin/plugin.json")),
	(TRIGGERS, include_bytes!("../../plugins/opennest/.triggers.json")),
	(LEARN, include_bytes!("../../plugins/opennest/skills/learn/SKILL.md")),
	(
		"skills/learn/references/skills.md",
		include_bytes!("../../plugins/opennest/skills/learn/references/skills.md"),
	),
	(
		"skills/learn/references/mcp.md",
		include_bytes!("../../plugins/opennest/skills/learn/references/mcp.md"),
	),
	(
		"skills/learn/references/determinism.md",
		include_bytes!("../../plugins/opennest/skills/learn/references/determinism.md"),
	),
];

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
		let path = std::env::temp_dir().join(format!("opennest-system-{name}"));
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
