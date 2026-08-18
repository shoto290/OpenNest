//! The model catalogue as the frontend asks for it, over IPC.
//!
//! A suite of its own because the answer is read once per process and kept: a second
//! test pointing the host at a different executable would be answered with the first
//! one's catalogue, which would make both tests lie. One process, one read, one
//! executable — the way a launch has it.

use std::path::PathBuf;

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::ClaudeState;
use opennest_app::commands::invoke_handler;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

/// A tier name that exists nowhere in this repository but here and in the sibling
/// unit tests. The scan has no list of tiers to check a file against, and this is
/// what says so from the outside: the host offers a tier it was never told about.
const INVENTED: &str = "quasar";

fn a_bundle_carrying(tier: &str) -> Vec<u8> {
	format!(
		r#"var noise=["claude-code-docs","claude-cli"];
		var models=["claude-{tier}-5","claude-{tier}-4-1"];
		var aliases=["{tier}","best","{tier}[1m]"];
		var lone="claude-{tier}-preview";"#
	)
	.into_bytes()
}

/// A file the resolver will accept: on the search path it is not, but the override is
/// the first candidate, and it has to be executable to be taken for one.
fn an_executable_carrying(tier: &str) -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-catalogue-ipc-{}", std::process::id()));
	std::fs::create_dir_all(&dir).expect("a place for the fixture");
	let path = dir.join("claude");
	std::fs::write(&path, a_bundle_carrying(tier)).expect("the fixture is written");
	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))
			.expect("the fixture is executable");
	}
	path
}

fn window(app: &tauri::App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: json!({}).into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

/// The whole crossing: the command is registered, the host reads the executable the
/// resolver leads it to, and what comes back is a list of strings the frontend can
/// offer — including a tier this build has never heard of, which is the point.
#[test]
fn the_catalogue_crosses_as_the_executable_carries_it() {
	let path = an_executable_carrying(INVENTED);
	std::env::set_var(BINARY_OVERRIDE_ENV, &path);

	let app = mock_builder()
		.manage(ClaudeState::default())
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
		.expect("app builds");
	let window = window(&app);

	let offered = call(&window, "claude_models").expect("the catalogue crosses");
	let values: Vec<String> =
		serde_json::from_value(offered.clone()).expect("a list of labels crossed");

	for expected in [
		INVENTED.to_owned(),
		format!("{INVENTED}[1m]"),
		"best".to_owned(),
		format!("claude-{INVENTED}-5"),
		format!("claude-{INVENTED}-4-1"),
		format!("claude-{INVENTED}-preview"),
	] {
		assert!(values.contains(&expected), "{expected} was not offered: {values:?}");
	}
	assert!(
		!values.iter().any(|value| value.contains("docs") || value.contains("cli")),
		"a slug that is not a model was offered: {values:?}"
	);
	assert_eq!(values.first().map(String::as_str), Some(INVENTED), "the tier's alias comes first");

	// Read once and kept: the same answer, without the file being there any more.
	std::fs::remove_file(&path).expect("the fixture is removed");
	assert_eq!(call(&window, "claude_models"), Ok(offered), "a second ask read the file again");

	std::env::remove_var(BINARY_OVERRIDE_ENV);
	std::fs::remove_dir_all(path.parent().expect("the fixture directory")).expect("cleanup");
}
