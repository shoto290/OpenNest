use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager, Runtime};

use super::contract::MissionError;
use crate::private_files;

const MISSIONS_DIR: &str = "missions";

const HOOK_DIR: &str = "hook";

const SCRIPT_NAME: &str = "opennest-agent-hook.sh";

const READER_NAME: &str = "opennest-agent-hook.py";

const CONFIG_NAME: &str = "agent-hook.json";

const CLAUDE_DIR: &str = ".claude";

const SETTINGS_NAME: &str = "settings.local.json";

const HOOKS_KEY: &str = "hooks";

const HOOKED_EVENTS: [&str; 2] = ["Notification", "Stop"];

const SCRIPT: &str = include_str!("../../hooks/opennest-agent-hook.sh");

const READER: &str = include_str!("../../hooks/opennest-agent-hook.py");

pub fn dir<R: Runtime>(app: &AppHandle<R>, mission_id: &str) -> Result<PathBuf, MissionError> {
	let data = app
		.path()
		.app_data_dir()
		.map_err(|_| unreachable("the app data directory is not named".to_owned()))?;
	Ok(data.join(MISSIONS_DIR).join(mission_id).join(HOOK_DIR))
}

pub fn installed(dir: &Path, workspace: &str, url: &str, key: &str) -> Result<(), MissionError> {
	let root = opened(workspace)?;
	let script = laid_out(dir, url, key)?;
	let settings = root.join(CLAUDE_DIR).join(SETTINGS_NAME);
	let held = read(&settings)?;
	let merged = merged(held, &command(&script))?;
	let written = serde_json::to_vec_pretty(&merged)
		.map_err(|error| unreachable(format!("the settings were not rendered: {error}")))?;
	private_files::replace(&settings, &written).map_err(|error| {
		unreachable(format!("the settings of the workspace were not written: {error}"))
	})
}

fn laid_out(dir: &Path, url: &str, key: &str) -> Result<PathBuf, MissionError> {
	private_files::create_dir(dir)
		.map_err(|error| unreachable(format!("the hook directory was not made: {error}")))?;
	let script = dir.join(SCRIPT_NAME);
	written(&script, SCRIPT.as_bytes())?;
	written(&dir.join(READER_NAME), READER.as_bytes())?;
	let config = json!({ "url": url, "key": key });
	written(&dir.join(CONFIG_NAME), config.to_string().as_bytes())?;
	Ok(script)
}

fn written(path: &Path, bytes: &[u8]) -> Result<(), MissionError> {
	private_files::replace_atomically(path, bytes)
		.map_err(|error| unreachable(format!("a hook file was not written: {error}")))
}

fn opened(workspace: &str) -> Result<PathBuf, MissionError> {
	let root = Path::new(workspace)
		.canonicalize()
		.map_err(|error| unreachable(format!("the workspace was not opened: {error}")))?;
	match root.is_dir() {
		true => Ok(root),
		false => Err(unreachable("the workspace is not a directory".to_owned())),
	}
}

fn read(settings: &Path) -> Result<Value, MissionError> {
	let text = match fs::read_to_string(settings) {
		Ok(text) => text,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
			return Ok(Value::Object(Map::new()))
		}
		Err(error) => {
			return Err(unreachable(format!(
				"the settings of the workspace were not read: {error}"
			)))
		}
	};
	if text.trim().is_empty() {
		return Ok(Value::Object(Map::new()));
	}
	serde_json::from_str(&text).map_err(|error| {
		unreachable(format!("the settings of the workspace are not JSON: {error}"))
	})
}

fn merged(held: Value, command: &str) -> Result<Value, MissionError> {
	let Value::Object(mut settings) = held else {
		return Err(unreachable("the settings of the workspace hold no object".to_owned()));
	};
	let Value::Object(mut hooks) =
		settings.remove(HOOKS_KEY).unwrap_or_else(|| Value::Object(Map::new()))
	else {
		return Err(unreachable("the hooks of the workspace hold no object".to_owned()));
	};
	for event in HOOKED_EVENTS {
		let held = hooks.remove(event).unwrap_or_else(|| Value::Array(Vec::new()));
		let Value::Array(entries) = held else {
			return Err(unreachable(format!("the {event} hooks hold no list")));
		};
		let mut kept: Vec<Value> = entries.into_iter().filter(|entry| !ours(entry)).collect();
		kept.push(json!({ "hooks": [{ "type": "command", "command": command }] }));
		hooks.insert(event.to_owned(), Value::Array(kept));
	}
	settings.insert(HOOKS_KEY.to_owned(), Value::Object(hooks));
	Ok(Value::Object(settings))
}

fn ours(entry: &Value) -> bool {
	entry[HOOKS_KEY]
		.as_array()
		.is_some_and(|hooks| hooks.iter().any(|hook| names_the_script(&hook["command"])))
}

fn names_the_script(command: &Value) -> bool {
	command.as_str().is_some_and(|command| command.contains(SCRIPT_NAME))
}

fn command(script: &Path) -> String {
	format!("bash {}", quoted(&script.to_string_lossy()))
}

fn quoted(path: &str) -> String {
	format!("'{}'", path.replace('\'', "'\\''"))
}

fn unreachable(detail: String) -> MissionError {
	MissionError::Undeliverable { detail }
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;
	use std::net::Ipv4Addr;
	use std::time::Duration;

	use tokio::net::TcpListener;

	use super::*;

	const A_URL: &str = "http://127.0.0.1:45367/missions/call";

	const A_KEY: &str = "the-delivery-key";

	const ANOTHER_HOOK: &str = "./scripts/another-hook.sh";

	fn a_dir(name: &str) -> PathBuf {
		let path =
			std::env::temp_dir().join(format!("opennest-hook-{name}-{}", std::process::id()));
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(path.join("workspace")).expect("the workspace is there");
		path
	}

	fn workspace_of(dir: &Path) -> String {
		dir.join("workspace").to_string_lossy().into_owned()
	}

	fn settings_of(dir: &Path) -> Value {
		let text = fs::read_to_string(dir.join("workspace").join(CLAUDE_DIR).join(SETTINGS_NAME))
			.expect("the settings read");
		serde_json::from_str(&text).expect("the settings are JSON")
	}

	fn planted(dir: &Path, settings: &Value) {
		let claude = dir.join("workspace").join(CLAUDE_DIR);
		fs::create_dir_all(&claude).expect("the claude directory is there");
		fs::write(claude.join(SETTINGS_NAME), settings.to_string()).expect("the settings land");
	}

	fn files_in(root: &Path) -> BTreeSet<String> {
		let mut held = BTreeSet::new();
		let Ok(entries) = fs::read_dir(root) else {
			return held;
		};
		for entry in entries.flatten() {
			let path = entry.path();
			let name = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().into_owned();
			match path.is_dir() {
				true => {
					held.extend(files_in(&path).into_iter().map(|below| format!("{name}/{below}")))
				}
				false => {
					held.insert(name);
				}
			}
		}
		held
	}

	fn entries_of(settings: &Value, event: &str) -> Vec<Value> {
		settings["hooks"][event].as_array().cloned().unwrap_or_default()
	}

	fn ours_in(settings: &Value, event: &str) -> usize {
		entries_of(settings, event).iter().filter(|entry| ours(entry)).count()
	}

	#[test]
	fn the_hook_of_another_matcher_and_a_key_the_install_does_not_own_both_survive() {
		let dir = a_dir("kept");
		planted(
			&dir,
			&json!({
				"permissions": { "allow": ["Bash(ls:*)"] },
				"hooks": {
					"Notification": [
						{ "matcher": "Bash", "hooks": [
							{ "type": "command", "command": ANOTHER_HOOK }
						] }
					],
					"PreToolUse": [
						{ "hooks": [{ "type": "command", "command": ANOTHER_HOOK }] }
					],
				},
			}),
		);

		installed(&dir.join("hook"), &workspace_of(&dir), A_URL, A_KEY).expect("the hook installs");

		let settings = settings_of(&dir);
		assert_eq!(settings["permissions"], json!({ "allow": ["Bash(ls:*)"] }));
		assert_eq!(
			settings["hooks"]["PreToolUse"],
			json!([{ "hooks": [{ "type": "command", "command": ANOTHER_HOOK }] }]),
			"the hooks of another event were dropped"
		);
		assert_eq!(
			entries_of(&settings, "Notification").first(),
			Some(&json!({
				"matcher": "Bash",
				"hooks": [{ "type": "command", "command": ANOTHER_HOOK }],
			})),
			"the hook of another matcher was dropped"
		);
		assert_eq!(ours_in(&settings, "Notification"), 1);
		assert_eq!(ours_in(&settings, "Stop"), 1);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn arming_twice_leaves_one_opennest_entry_on_each_event() {
		let dir = a_dir("twice");
		let workspace = workspace_of(&dir);

		installed(&dir.join("hook"), &workspace, A_URL, A_KEY).expect("the hook installs");
		installed(&dir.join("hook"), &workspace, A_URL, A_KEY).expect("the hook installs again");

		let settings = settings_of(&dir);
		for event in HOOKED_EVENTS {
			assert_eq!(entries_of(&settings, event).len(), 1, "{event} carries a second entry");
			assert_eq!(ours_in(&settings, event), 1);
		}

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_workspace_holds_the_settings_and_nothing_else_while_the_script_lands_beside_the_data() {
		let dir = a_dir("laid-out");

		installed(&dir.join("hook"), &workspace_of(&dir), A_URL, A_KEY).expect("the hook installs");

		assert_eq!(
			files_in(&dir.join("workspace")),
			BTreeSet::from([format!("{CLAUDE_DIR}/{SETTINGS_NAME}")]),
			"the install wrote inside the workspace beyond the settings it owns"
		);
		assert_eq!(
			files_in(&dir.join("hook")),
			BTreeSet::from([
				SCRIPT_NAME.to_owned(),
				READER_NAME.to_owned(),
				CONFIG_NAME.to_owned(),
			]),
		);
		assert_eq!(
			serde_json::from_str::<Value>(
				&fs::read_to_string(dir.join("hook").join(CONFIG_NAME)).expect("the config reads")
			)
			.expect("the config is JSON"),
			json!({ "url": A_URL, "key": A_KEY }),
		);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_settings_file_that_is_not_json_is_refused_rather_than_overwritten() {
		let dir = a_dir("unreadable");
		let claude = dir.join("workspace").join(CLAUDE_DIR);
		fs::create_dir_all(&claude).expect("the claude directory is there");
		fs::write(claude.join(SETTINGS_NAME), "{ not json").expect("the settings land");

		let refused = installed(&dir.join("hook"), &workspace_of(&dir), A_URL, A_KEY)
			.expect_err("the install is refused");

		assert!(matches!(refused, MissionError::Undeliverable { .. }), "got {refused:?}");
		assert_eq!(
			fs::read_to_string(claude.join(SETTINGS_NAME)).expect("the settings read"),
			"{ not json",
			"the settings the install could not merge were overwritten"
		);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn carried_by(script: &Path, hook: &Value) -> std::process::ExitStatus {
		let mut running = tokio::process::Command::new("bash")
			.arg(script)
			.stdin(std::process::Stdio::piped())
			.stdout(std::process::Stdio::null())
			.stderr(std::process::Stdio::null())
			.spawn()
			.expect("the script runs");
		let mut stdin = running.stdin.take().expect("the script reads its stdin");
		tokio::io::AsyncWriteExt::write_all(&mut stdin, hook.to_string().as_bytes())
			.await
			.expect("the hook payload lands");
		drop(stdin);
		tokio::time::timeout(Duration::from_secs(20), running.wait())
			.await
			.expect("the script ends")
			.expect("the script is waited on")
	}

	async fn one_call_to(listener: TcpListener) -> String {
		let (mut stream, _) = listener.accept().await.expect("the call lands");
		let mut held = Vec::new();
		let mut chunk = [0_u8; 1024];
		loop {
			let read = tokio::io::AsyncReadExt::read(&mut stream, &mut chunk)
				.await
				.expect("the call reads");
			held.extend_from_slice(&chunk[..read]);
			let request = String::from_utf8_lossy(&held).into_owned();
			let carried = request
				.split_once("\r\n\r\n")
				.map(|(head, body)| length_of(head) == Some(body.len()));
			if read == 0 || carried == Some(true) {
				tokio::io::AsyncWriteExt::write_all(
					&mut stream,
					b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\n\r\n",
				)
				.await
				.expect("the answer lands");
				return request;
			}
		}
	}

	fn length_of(head: &str) -> Option<usize> {
		head.lines().find_map(|line| line.strip_prefix("Content-Length: "))?.trim().parse().ok()
	}

	#[tokio::test]
	async fn the_installed_script_reads_its_config_at_call_time_keeps_the_message_and_exits_zero() {
		let dir = a_dir("called");
		let hook_dir = dir.join("hook");
		installed(&hook_dir, &workspace_of(&dir), A_URL, A_KEY).expect("the hook installs");
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		fs::write(
			hook_dir.join(CONFIG_NAME),
			json!({
				"url": format!("http://{address}/missions/call"),
				"key": "the-key-written-after-the-install",
			})
			.to_string(),
		)
		.expect("the config is rewritten");
		let called = tokio::spawn(one_call_to(listener));

		let ended = carried_by(
			&hook_dir.join(SCRIPT_NAME),
			&json!({
				"hook_event_name": "Notification",
				"session_id": "s1",
				"cwd": dir.join("workspace").to_string_lossy(),
				"message": "Claude needs your permission",
			}),
		)
		.await;

		assert_eq!(ended.code(), Some(0));
		let request = tokio::time::timeout(Duration::from_secs(20), called)
			.await
			.expect("the call lands")
			.expect("the listener is joined");
		assert!(
			request.contains("X-OpenNest-Delivery: the-key-written-after-the-install"),
			"the script read a config other than the one standing at call time: {request}"
		);
		assert!(
			request.contains("\"message\": \"Claude needs your permission\""),
			"the message of the notification was dropped: {request}"
		);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_installed_script_ends_well_when_its_config_names_a_url_nothing_answers() {
		let dir = a_dir("unanswered");
		let hook_dir = dir.join("hook");
		installed(&hook_dir, &workspace_of(&dir), A_URL, A_KEY).expect("the hook installs");
		fs::remove_file(hook_dir.join(CONFIG_NAME)).expect("the config goes");

		let ended = carried_by(
			&hook_dir.join(SCRIPT_NAME),
			&json!({ "hook_event_name": "Stop", "session_id": "s1" }),
		)
		.await;

		assert_eq!(ended.code(), Some(0));

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_command_carries_the_script_inside_quotes_a_space_in_the_path_survives() {
		let held = command(Path::new("/a path/with 'quotes'/opennest-agent-hook.sh"));

		assert_eq!(held, "bash '/a path/with '\\''quotes'\\''/opennest-agent-hook.sh'");
	}
}
