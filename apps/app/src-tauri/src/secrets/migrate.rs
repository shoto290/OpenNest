use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::bundles::{object_at, MCP_NAME, SERVERS_KEY};
use crate::private_files;

use super::contract::{is_interpolated, placeholder_for};
use super::store::SecretStore;

const MARKER_NAME: &str = ".mcp-secrets-moved";
const CREDENTIAL_BEARING_KEYS: [&str; 2] = ["env", "headers"];

const CREDENTIAL_WORDS: [&str; 7] =
	["KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "AUTHORIZATION", "CREDENTIAL"];

pub fn run_once(store: &SecretStore, plugins_dir: &Path) {
	let marker = store.dir().join(MARKER_NAME);
	if marker.exists() || !store.is_ready() {
		return;
	}

	for (bot_id, path) in mcp_files(plugins_dir) {
		move_one_file(store, &bot_id, &path);
	}

	let _ = private_files::replace(&marker, b"");
}

fn mcp_files(plugins_dir: &Path) -> Vec<(String, PathBuf)> {
	let Ok(entries) = std::fs::read_dir(plugins_dir) else {
		return Vec::new();
	};
	entries
		.flatten()
		.filter_map(|entry| {
			let path = entry.path().join(MCP_NAME);
			let bot_id = entry.file_name().to_string_lossy().into_owned();
			path.is_file().then_some((bot_id, path))
		})
		.collect()
}

fn move_one_file(store: &SecretStore, bot_id: &str, path: &Path) {
	let mut document = object_at(path);
	let Some(Value::Object(servers)) = document.get_mut(SERVERS_KEY) else {
		return;
	};

	let mut rewritten = false;
	for (server_name, server) in servers.iter_mut() {
		let Some(server) = server.as_object_mut() else {
			continue;
		};
		for field in CREDENTIAL_BEARING_KEYS {
			let Some(Value::Object(holder)) = server.get_mut(field) else {
				continue;
			};
			rewritten |= replace_credentials(store, bot_id, server_name, holder);
		}
	}

	if rewritten {
		let _ = private_files::replace(path, Value::Object(document).to_string().as_bytes());
	}
}

fn replace_credentials(
	store: &SecretStore,
	bot_id: &str,
	server_name: &str,
	holder: &mut Map<String, Value>,
) -> bool {
	let mut rewritten = false;
	for (field, value) in holder.iter_mut() {
		let Some(plaintext) = value.as_str() else {
			continue;
		};
		if !looks_like_a_credential(field) || plaintext.is_empty() || is_interpolated(plaintext) {
			continue;
		}

		let key = format!("{server_name}.{field}");
		if store.set(bot_id, &key, plaintext).is_ok() {
			*value = Value::String(placeholder_for(&key));
			rewritten = true;
		}
	}
	rewritten
}

fn looks_like_a_credential(field: &str) -> bool {
	let upper = field.to_ascii_uppercase();
	CREDENTIAL_WORDS.iter().any(|word| upper.contains(word))
}

#[cfg(test)]
mod tests {
	use super::*;

	struct Layout {
		plugins: PathBuf,
		store: SecretStore,
	}

	fn a_layout(unlocked: bool) -> Layout {
		let app_data =
			std::env::temp_dir().join(format!("opennest-migrate-{}", uuid::Uuid::new_v4()));
		let plugins = app_data.join("bots").join("plugins");
		std::fs::create_dir_all(&plugins).expect("temp dir");
		let store = SecretStore::under(app_data);
		store.force_vault_for_tests();
		if unlocked {
			store.unlock("open sesame").expect("unlocks");
		}
		Layout { plugins, store }
	}

	fn write_mcp(layout: &Layout, bot_id: &str, body: &str) -> PathBuf {
		let dir = layout.plugins.join(bot_id);
		std::fs::create_dir_all(&dir).expect("bot dir");
		let path = dir.join(MCP_NAME);
		std::fs::write(&path, body).expect("mcp file");
		path
	}

	fn read(path: &Path) -> String {
		std::fs::read_to_string(path).expect("the file is there")
	}

	#[test]
	fn a_plaintext_credential_becomes_a_placeholder_and_a_stored_secret() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"command":"x","env":{"GITHUB_TOKEN":"ghp_livevalue"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);

		assert!(read(&path).contains("${secret:github.GITHUB_TOKEN}"));
		assert!(!read(&path).contains("ghp_livevalue"));
		assert_eq!(
			layout.store.resolve("bot").values.get("github.GITHUB_TOKEN").map(String::as_str),
			Some("ghp_livevalue")
		);
	}

	#[test]
	fn a_second_start_moves_nothing_more() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_livevalue"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);
		let once = read(&path);
		std::fs::write(&path, r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_second"}}}}"#)
			.expect("a later plaintext");

		run_once(&layout.store, &layout.plugins);

		assert!(once.contains("${secret:github.GITHUB_TOKEN}"));
		assert!(read(&path).contains("ghp_second"));
		assert_eq!(layout.store.keys("bot"), vec!["github.GITHUB_TOKEN".to_owned()]);
	}

	#[test]
	fn a_value_that_is_not_a_credential_is_left_alone() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_HOST":"example.com"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);

		assert!(read(&path).contains("example.com"));
		assert!(layout.store.keys("bot").is_empty());
	}

	#[test]
	fn a_placeholder_already_in_place_is_never_moved_again() {
		let layout = a_layout(true);
		write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"${secret:github.GITHUB_TOKEN}"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);

		assert!(layout.store.keys("bot").is_empty());
	}

	#[test]
	fn a_header_credential_moves_the_same_way() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"remote":{"headers":{"Authorization":"Bearer livetoken"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);

		assert!(read(&path).contains("${secret:remote.Authorization}"));
		assert!(!read(&path).contains("Bearer livetoken"));
	}

	#[test]
	fn a_store_that_is_not_ready_leaves_the_file_for_the_next_start() {
		let layout = a_layout(false);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_livevalue"}}}}"#,
		);

		run_once(&layout.store, &layout.plugins);
		assert!(read(&path).contains("ghp_livevalue"));

		layout.store.unlock("open sesame").expect("unlocks");
		run_once(&layout.store, &layout.plugins);

		assert!(read(&path).contains("${secret:github.GITHUB_TOKEN}"));
	}
}
