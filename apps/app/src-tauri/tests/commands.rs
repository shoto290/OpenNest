//! Checks the Tauri command layer itself: registration, state handling and the
//! shape errors take once they cross the IPC boundary.

use std::sync::{Arc, Mutex};

use opennest_app::claude::commands::{invoke_handler, EVENT_CHANNEL};
use opennest_app::claude::contract::{ClaudeEvent, ConnectionState};
use opennest_app::claude::ClaudeState;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, WebviewWindow, WebviewWindowBuilder};

fn app() -> tauri::App<MockRuntime> {
	mock_builder()
		.manage(ClaudeState::default())
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
		.expect("app builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

#[test]
fn commands_are_registered_and_report_typed_errors_without_a_session() {
	let app = app();
	let window = WebviewWindowBuilder::new(&app, "main", Default::default())
		.build()
		.expect("window builds");

	assert_eq!(call(&window, "claude_cancel_turn", json!({})), Err(json!({ "kind": "notStarted" })));
	assert_eq!(
		call(&window, "claude_submit_prompt", json!({ "text": "salut" })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(
		call(&window, "claude_respond_to_permission", json!({ "id": "x", "decision": "allowOnce" })),
		Err(json!({ "kind": "notStarted" }))
	);
}

#[test]
fn shutdown_announces_the_connection_state_on_the_single_event_channel() {
	let app = app();
	let window = WebviewWindowBuilder::new(&app, "main", Default::default())
		.build()
		.expect("window builds");

	let seen: Arc<Mutex<Vec<ClaudeEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = seen.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ClaudeEvent>(event.payload()) {
			sink.lock().expect("log").push(parsed);
		}
	});

	assert_eq!(call(&window, "claude_shutdown", json!({})), Ok(Value::Null));

	let events = seen.lock().expect("log").clone();
	assert!(events
		.iter()
		.any(|event| matches!(event, ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking })));
}
