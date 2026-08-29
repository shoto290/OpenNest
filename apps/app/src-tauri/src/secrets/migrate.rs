use std::path::{Path, PathBuf};

use std::collections::BTreeMap;

use serde_json::{Map, Value};

use crate::bundles::{object_at, MCP_NAME, SERVERS_KEY};
use crate::private_files;

use super::contract::{looks_interpolated, placeholder_for};
use super::store::SecretStore;

const STALE_MARKER_NAME: &str = ".mcp-secrets-moved";

const CREDENTIAL_BEARING_KEYS: [&str; 2] = ["env", "headers"];
const ARGS_KEY: &str = "args";
const URL_KEY: &str = "url";

const CREDENTIAL_WORDS: [&str; 7] =
	["KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "AUTHORIZATION", "CREDENTIAL"];

const HEADER_WORD: &str = "HEADER";
const HEADER_FLAG: &str = "-H";

const CREDENTIAL_MARKERS: [&str; 14] = [
	"ghp_",
	"gho_",
	"ghu_",
	"ghs_",
	"ghr_",
	"github_pat_",
	"sk-",
	"xoxb-",
	"xoxp-",
	"xoxa-",
	"glpat-",
	"AKIA",
	"AIza",
	"Bearer ",
];

const CREDENTIAL_OPENINGS: [&str; 1] = ["eyJ"];

struct Move {
	key: String,
	value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unmoved {
	pub bot_id: String,
	pub key: String,
	pub detail: String,
}

pub fn sweep(store: &SecretStore, plugins_dir: &Path) -> Vec<Unmoved> {
	let _ = std::fs::remove_file(store.dir().join(STALE_MARKER_NAME));
	if !store.is_ready() {
		return Vec::new();
	}

	let mut unmoved = Vec::new();
	for (bot_id, path) in mcp_files(plugins_dir) {
		sweep_one_file(store, &bot_id, &path, &mut unmoved);
	}
	unmoved
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

fn sweep_one_file(
	store: &SecretStore,
	bot_id: &str,
	path: &Path,
	unmoved: &mut Vec<Unmoved>,
) {
	let mut document = object_at(path);
	let Some(Value::Object(servers)) = document.get_mut(SERVERS_KEY) else {
		return;
	};

	let mut moves = Vec::new();
	for (server_name, server) in servers.iter_mut() {
		let Some(server) = server.as_object_mut() else {
			continue;
		};
		take_from_maps(server_name, server, &mut moves);
		take_from_args(server_name, server, &mut moves);
		take_from_url(server_name, server, &mut moves);
	}
	if moves.is_empty() {
		return;
	}

	let refused = refused_by_the_store(store, bot_id, &moves);
	for moved in &moves {
		if let Some(detail) = refused.get(&moved.key) {
			put_back(&mut document, moved);
			unmoved.push(Unmoved {
				bot_id: bot_id.to_owned(),
				key: moved.key.clone(),
				detail: detail.clone(),
			});
		}
	}

	let _ = private_files::replace(path, Value::Object(document).to_string().as_bytes());
}

fn refused_by_the_store(
	store: &SecretStore,
	bot_id: &str,
	moves: &[Move],
) -> BTreeMap<String, String> {
	moves
		.iter()
		.filter_map(|moved| {
			store
				.set(bot_id, &moved.key, &moved.value)
				.err()
				.map(|error| (moved.key.clone(), error.to_string()))
		})
		.collect()
}

fn put_back(document: &mut Map<String, Value>, moved: &Move) {
	let placeholder = placeholder_for(&moved.key);
	for field in document.values_mut() {
		swap_text(field, &placeholder, &moved.value);
	}
}

fn swap_text(value: &mut Value, placeholder: &str, plain: &str) {
	match value {
		Value::String(text) => *text = text.replace(placeholder, plain),
		Value::Array(items) => {
			for item in items {
				swap_text(item, placeholder, plain);
			}
		}
		Value::Object(fields) => {
			for field in fields.values_mut() {
				swap_text(field, placeholder, plain);
			}
		}
		_ => {}
	}
}

fn take_from_maps(server_name: &str, server: &mut Map<String, Value>, moves: &mut Vec<Move>) {
	for holder_name in CREDENTIAL_BEARING_KEYS {
		let Some(Value::Object(holder)) = server.get_mut(holder_name) else {
			continue;
		};
		for (field, value) in holder.iter_mut() {
			let Some(plaintext) = value.as_str() else {
				continue;
			};
			if !is_credential(field, plaintext) {
				continue;
			}
			let key = format!("{server_name}.{holder_name}.{field}");
			moves.push(Move { key: key.clone(), value: plaintext.to_owned() });
			*value = Value::String(placeholder_for(&key));
		}
	}
}

fn take_from_args(server_name: &str, server: &mut Map<String, Value>, moves: &mut Vec<Move>) {
	let Some(Value::Array(args)) = server.get_mut(ARGS_KEY) else {
		return;
	};
	let originals: Vec<Option<String>> =
		args.iter().map(|arg| arg.as_str().map(str::to_owned)).collect();

	for (index, argument) in args.iter_mut().enumerate() {
		let Some(element) = argument.as_str() else {
			continue;
		};
		let key = format!("{server_name}.{ARGS_KEY}.{index}");
		let Some(taken) = credential_in_argument(element, preceding_flag(&originals, index)) else {
			continue;
		};
		moves.push(Move { key: key.clone(), value: taken.value });
		*argument = Value::String(format!("{}{}", taken.kept, placeholder_for(&key)));
	}
}

struct Taken {
	kept: String,
	value: String,
}

fn preceding_flag(originals: &[Option<String>], index: usize) -> &str {
	let Some(previous) = index.checked_sub(1).and_then(|before| originals.get(before)) else {
		return "";
	};
	match previous.as_deref() {
		Some(flag) if flag.starts_with('-') => flag,
		_ => "",
	}
}

fn credential_in_argument(element: &str, flag: &str) -> Option<Taken> {
	if let Some((name, value)) = element.split_once('=') {
		if name.starts_with('-') {
			return is_credential(name, value)
				.then(|| Taken { kept: format!("{name}="), value: value.to_owned() });
		}
	}
	if element.starts_with('-') {
		return None;
	}
	is_credential(flag, element).then(|| Taken { kept: String::new(), value: element.to_owned() })
}

fn take_from_url(server_name: &str, server: &mut Map<String, Value>, moves: &mut Vec<Move>) {
	let Some(Value::String(url)) = server.get_mut(URL_KEY) else {
		return;
	};
	let Some((base, rest)) = url.split_once('?') else {
		return;
	};
	let (query, fragment) = match rest.split_once('#') {
		Some((query, fragment)) => (query, Some(fragment)),
		None => (rest, None),
	};

	let mut rebuilt: Vec<String> = Vec::new();
	let mut changed = false;
	for pair in query.split('&') {
		match pair.split_once('=') {
			Some((name, value)) if is_credential(name, value) => {
				let key = format!("{server_name}.{URL_KEY}.{name}");
				moves.push(Move { key: key.clone(), value: value.to_owned() });
				rebuilt.push(format!("{name}={}", placeholder_for(&key)));
				changed = true;
			}
			_ => rebuilt.push(pair.to_owned()),
		}
	}
	if !changed {
		return;
	}

	let mut swept = format!("{base}?{}", rebuilt.join("&"));
	if let Some(fragment) = fragment {
		swept.push('#');
		swept.push_str(fragment);
	}
	*url = swept;
}

fn is_credential(field: &str, value: &str) -> bool {
	if value.is_empty() || looks_interpolated(value) {
		return false;
	}
	if names_a_header(field) {
		return named_like_a_credential(value) || shaped_like_a_credential(value);
	}
	named_like_a_credential(field) || shaped_like_a_credential(value)
}

fn names_a_header(field: &str) -> bool {
	field == HEADER_FLAG || field.to_ascii_uppercase().contains(HEADER_WORD)
}

fn named_like_a_credential(field: &str) -> bool {
	let upper = field.to_ascii_uppercase();
	CREDENTIAL_WORDS.iter().any(|word| upper.contains(word))
}

fn shaped_like_a_credential(value: &str) -> bool {
	CREDENTIAL_OPENINGS.iter().any(|opening| value.starts_with(opening))
		|| CREDENTIAL_MARKERS.iter().any(|marker| carries(value, marker))
}

fn carries(value: &str, marker: &str) -> bool {
	value
		.match_indices(marker)
		.any(|(at, _)| at == 0 || !value.as_bytes()[at - 1].is_ascii_alphanumeric())
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

	fn swept(layout: &Layout) {
		assert!(sweep(&layout.store, &layout.plugins).is_empty());
	}

	fn stored_value(layout: &Layout, key: &str) -> Option<String> {
		layout.store.resolve("bot", None).values.get(key).cloned()
	}

	#[test]
	fn a_plaintext_credential_becomes_a_placeholder_and_a_stored_secret() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"command":"x","env":{"GITHUB_TOKEN":"ghp_livevalue"}}}}"#,
		);

		swept(&layout);

		assert!(read(&path).contains("${secret:github.env.GITHUB_TOKEN}"));
		assert!(!read(&path).contains("ghp_livevalue"));
		assert_eq!(stored_value(&layout, "github.env.GITHUB_TOKEN").as_deref(), Some("ghp_livevalue"));
	}

	#[test]
	fn a_token_written_after_the_first_start_is_still_swept() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_first"}}}}"#,
		);
		swept(&layout);
		assert!(read(&path).contains("${secret:github.env.GITHUB_TOKEN}"));

		std::fs::write(&path, r#"{"mcpServers":{"linear":{"env":{"API_KEY":"lin_second"}}}}"#)
			.expect("a later plaintext");

		swept(&layout);

		assert!(read(&path).contains("${secret:linear.env.API_KEY}"));
		assert!(!read(&path).contains("lin_second"));
		assert_eq!(stored_value(&layout, "linear.env.API_KEY").as_deref(), Some("lin_second"));
	}

	#[test]
	fn the_marker_of_the_old_one_shot_sweep_is_deleted_and_never_written() {
		let layout = a_layout(true);
		let marker = layout.store.dir().join(STALE_MARKER_NAME);
		std::fs::create_dir_all(layout.store.dir()).expect("store dir");
		std::fs::write(&marker, b"").expect("a marker from an older build");
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_livevalue"}}}}"#,
		);

		swept(&layout);

		assert!(!marker.exists());
		assert!(read(&path).contains("${secret:github.env.GITHUB_TOKEN}"));
	}

	#[test]
	fn a_token_in_a_flag_that_carries_its_value_moves_without_the_flag() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"linear":{"args":["serve","--token=lin_livevalue"]}}}"#,
		);

		swept(&layout);

		assert!(read(&path).contains("--token=${secret:linear.args.1}"));
		assert!(!read(&path).contains("lin_livevalue"));
		assert_eq!(stored_value(&layout, "linear.args.1").as_deref(), Some("lin_livevalue"));
	}

	#[test]
	fn a_token_standing_alone_after_a_flag_moves_and_leaves_the_flag() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"linear":{"args":["serve","--token","lin_livevalue"]}}}"#,
		);

		swept(&layout);

		let rewritten = read(&path);
		assert!(rewritten.contains(r#""--token","${secret:linear.args.2}""#));
		assert!(rewritten.contains(r#""serve""#));
		assert!(!rewritten.contains("lin_livevalue"));
		assert_eq!(stored_value(&layout, "linear.args.2").as_deref(), Some("lin_livevalue"));
	}

	#[test]
	fn a_token_in_a_query_parameter_moves_and_leaves_the_rest_of_the_url() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"remote":{"url":"https://mcp.example.com/sse?team=bakers&api_key=lin_livevalue"}}}"#,
		);

		swept(&layout);

		let rewritten = read(&path);
		assert!(rewritten
			.contains("https://mcp.example.com/sse?team=bakers&api_key=${secret:remote.url.api_key}"));
		assert!(!rewritten.contains("lin_livevalue"));
		assert_eq!(stored_value(&layout, "remote.url.api_key").as_deref(), Some("lin_livevalue"));
	}

	#[test]
	fn a_value_whose_shape_gives_it_away_moves_from_a_plainly_named_field() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"SETTING":"ghp_livevalue"}}}}"#,
		);

		swept(&layout);

		assert!(read(&path).contains("${secret:github.env.SETTING}"));
		assert!(!read(&path).contains("ghp_livevalue"));
		assert_eq!(stored_value(&layout, "github.env.SETTING").as_deref(), Some("ghp_livevalue"));
	}

	#[test]
	fn a_token_inside_a_header_argument_moves_with_its_whole_value() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"remote":{"args":["mcp-remote","https://x/sse","--header","Authorization: Bearer ghp_live"]}}}"#,
		);

		swept(&layout);

		let rewritten = read(&path);
		assert!(rewritten.contains(r#""--header","${secret:remote.args.3}""#));
		assert!(!rewritten.contains("ghp_live"));
		assert!(!rewritten.contains("Bearer"));
		assert_eq!(
			stored_value(&layout, "remote.args.3").as_deref(),
			Some("Authorization: Bearer ghp_live")
		);
	}

	#[test]
	fn a_token_in_a_header_flag_that_carries_its_value_moves_with_its_whole_value() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"remote":{"args":["mcp-remote","--header=Authorization: Bearer ghp_live"]}}}"#,
		);

		swept(&layout);

		let rewritten = read(&path);
		assert!(rewritten.contains("--header=${secret:remote.args.1}"));
		assert!(!rewritten.contains("ghp_live"));
		assert_eq!(
			stored_value(&layout, "remote.args.1").as_deref(),
			Some("Authorization: Bearer ghp_live")
		);
	}

	#[test]
	fn a_header_that_carries_no_credential_is_left_alone() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"remote":{"args":["serve","--header","Content-Type: application/json"]}}}"#,
		);

		swept(&layout);

		assert!(read(&path).contains("Content-Type: application/json"));
		assert!(layout.store.keys("bot").is_empty());
	}

	#[test]
	fn an_ordinary_word_holding_a_marker_inside_it_is_left_alone() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"local":{"args":["task-manager","--disk-usage"],"env":{"SETTING":"risk-level"}}}}"#,
		);

		swept(&layout);

		let kept = read(&path);
		assert!(kept.contains("task-manager"));
		assert!(kept.contains("risk-level"));
		assert!(layout.store.keys("bot").is_empty());
	}

	#[test]
	fn a_value_that_is_not_a_credential_is_left_alone() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_HOST":"example.com"},"args":["serve","--verbose"],"url":"https://mcp.example.com/sse?team=bakers"}}}"#,
		);

		swept(&layout);

		let kept = read(&path);
		assert!(kept.contains("example.com"));
		assert!(kept.contains("--verbose"));
		assert!(kept.contains("team=bakers"));
		assert!(layout.store.keys("bot").is_empty());
	}

	#[test]
	fn a_placeholder_anywhere_in_the_value_is_never_moved_again() {
		let layout = a_layout(true);
		write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"${secret:github.env.GITHUB_TOKEN}"},"args":["--token=Bearer ${secret:github.args.0}"],"url":"https://x/sse?api_key=${secret:github.url.api_key}"}}}"#,
		);

		swept(&layout);

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

		swept(&layout);

		assert!(read(&path).contains("${secret:remote.headers.Authorization}"));
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

		swept(&layout);
		assert!(read(&path).contains("ghp_livevalue"));

		layout.store.unlock("open sesame").expect("unlocks");
		swept(&layout);

		assert!(read(&path).contains("${secret:github.env.GITHUB_TOKEN}"));
	}

	#[test]
	fn one_refused_credential_stays_put_while_the_others_move() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"GITHUB_TOKEN":"ghp_livevalue","OTHER_TOKEN":"ghp_refusedvalue"}}}}"#,
		);
		layout.store.refuse_for_tests("github.env.OTHER_TOKEN");

		let unmoved = sweep(&layout.store, &layout.plugins);

		let swept_file = read(&path);
		assert!(swept_file.contains("${secret:github.env.GITHUB_TOKEN}"));
		assert!(!swept_file.contains("ghp_livevalue"));
		assert!(swept_file.contains("ghp_refusedvalue"));
		assert_eq!(
			unmoved.iter().map(|held| held.key.as_str()).collect::<Vec<_>>(),
			vec!["github.env.OTHER_TOKEN"]
		);
	}

	#[test]
	fn one_field_name_in_both_env_and_headers_is_stored_under_two_keys() {
		let layout = a_layout(true);
		let path = write_mcp(
			&layout,
			"bot",
			r#"{"mcpServers":{"github":{"env":{"TOKEN":"ghp_fromtheenv"},"headers":{"TOKEN":"ghp_fromtheheader"}}}}"#,
		);

		swept(&layout);

		assert!(read(&path).contains("${secret:github.env.TOKEN}"));
		assert!(read(&path).contains("${secret:github.headers.TOKEN}"));
		assert_eq!(stored_value(&layout, "github.env.TOKEN").as_deref(), Some("ghp_fromtheenv"));
		assert_eq!(
			stored_value(&layout, "github.headers.TOKEN").as_deref(),
			Some("ghp_fromtheheader")
		);
	}
}
