//! Checks the Tauri command layer itself: registration, state handling and the
//! shape errors take once they cross the IPC boundary.

use std::sync::{Arc, Mutex};

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::commands::{
	claude_start_or_resume_session, shutdown_session, terminate_session, EVENT_CHANNEL,
};
use opennest_app::claude::contract::{ClaudeEvent, ConnectionState, RuntimeScope, ScopedEvent};
use opennest_app::claude::ClaudeState;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use opennest_app::db::connection::{open, FILE_NAME};
use opennest_app::db::migrations;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

fn app() -> tauri::App<MockRuntime> {
	build(mock_context(noop_assets()))
}

/// The scope a frontend holds after opening a run against the durable lineage.
/// Written out as JSON because that is how it crosses: a field the host spells
/// differently is a command refused before any code of ours runs.
fn a_scope() -> Value {
	json!({
		"conversationId": "c1",
		"botId": "default",
		"runtimeSessionId": "r1",
		"epoch": 1
	})
}

fn a_scope_value() -> RuntimeScope {
	serde_json::from_value(a_scope()).expect("the scope parses")
}

fn build(context: tauri::Context<MockRuntime>) -> tauri::App<MockRuntime> {
	mock_builder()
		.manage(ClaudeState::default())
		.invoke_handler(invoke_handler())
		.build(context)
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
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	assert_eq!(
		call(&window, "claude_cancel_turn", json!({ "scope": a_scope() })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(
		call(&window, "claude_submit_prompt", json!({ "scope": a_scope(), "text": "salut" })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(
		call(
			&window,
			"claude_respond_to_permission",
			json!({ "scope": a_scope(), "id": "x", "decision": "allowOnce" })
		),
		Err(json!({ "kind": "notStarted" }))
	);
}

/// A host holding no run has no other run to protect, so it answers about the
/// session it does not have rather than about the scope it was handed. The
/// distinction is the whole point: `notStarted` is recoverable by starting one,
/// while a stale refusal would send the frontend looking for a run that never was.
#[test]
fn a_command_reaching_a_host_that_runs_nothing_says_so_whatever_run_it_names() {
	let app = app();
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");
	let another = json!({
		"conversationId": "c2",
		"botId": "other",
		"runtimeSessionId": "r9",
		"epoch": 7
	});

	assert_eq!(
		call(&window, "claude_submit_prompt", json!({ "scope": another, "text": "salut" })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(call(&window, "claude_shutdown", json!({ "scope": another })), Ok(Value::Null));
}

#[test]
fn shutdown_announces_the_connection_state_on_the_single_event_channel() {
	let app = app();
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	let seen: Arc<Mutex<Vec<ScopedEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = seen.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.lock().expect("log").push(parsed);
		}
	});

	assert_eq!(call(&window, "claude_shutdown", json!({ "scope": a_scope() })), Ok(Value::Null));

	let events = seen.lock().expect("log").clone();
	assert!(events.iter().any(|scoped| matches!(
		(&scoped.scope, &scoped.event),
		(Some(scope), ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking })
			if scope == &a_scope_value()
	)));
}

/// The state lock guards a pointer, not the child behind it. Held across the
/// shutdown of a child that is deaf to EOF, it blocks every other command for
/// the whole grace — the quit path included, which is the one caller that has
/// no time to spare.
///
/// Both halves run on one task, so the order they finish in is decided by the
/// lock alone: the second can only report first if the first let go of it.
#[test]
fn shutting_down_frees_the_state_before_waiting_on_the_child() {
	std::env::set_var(BINARY_OVERRIDE_ENV, env!("CARGO_BIN_EXE_fake_claude"));
	std::env::set_var("FAKE_CLAUDE_IGNORE_EOF", "1");

	let app = app();
	let runtime = tokio::runtime::Runtime::new().expect("runtime");

	let finished: Mutex<Vec<&str>> = Mutex::new(Vec::new());
	runtime.block_on(async {
		claude_start_or_resume_session(
			app.handle().clone(),
			app.state::<ClaudeState>(),
			a_scope_value(),
			None,
			Some(std::env::temp_dir().to_string_lossy().into_owned()),
		)
		.await
		.expect("session starts");

		let state = app.state::<ClaudeState>();
		tokio::join!(
			async {
				shutdown_session(&state, &a_scope_value()).await;
				finished.lock().expect("order").push("shutdown");
			},
			async {
				terminate_session(&state).await;
				finished.lock().expect("order").push("terminate");
			},
		);
	});

	std::env::remove_var("FAKE_CLAUDE_IGNORE_EOF");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
	assert_eq!(*finished.lock().expect("order"), ["terminate", "shutdown"]);
}

/// The identifier decides the app data directory, so this test claims one of
/// its own rather than writing where a real install would.
#[test]
fn a_snapshot_saved_through_the_ipc_boundary_comes_back_intact() {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = "com.opennest.store-test".into();
	let app = build(context);
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	let snapshot = json!({
		"sessionId": "session-1",
		"messages": [{
			"id": "m1",
			"role": "user",
			"text": "salut",
			"completion": "complete",
			"timestamp": 17
		}],
		"activities": [{ "id": "a1", "title": "Read", "kind": "tool", "status": "succeeded" }]
	});

	assert_eq!(
		call(&window, "claude_save_session", json!({ "snapshot": snapshot })),
		Ok(Value::Null)
	);
	assert_eq!(call(&window, "claude_load_session", json!({})), Ok(snapshot));

	let dir = app.path().app_data_dir().expect("data dir");
	std::fs::remove_dir_all(&dir).expect("cleanup");
}

/// The launch resolves the file from the app data directory, and nothing else in
/// the suite goes through that resolution: a unit test hands `Database::open` a
/// path it built itself. So this one drives `bootstrap`, identifier included, and
/// claims a directory of its own the way the snapshot test above does.
#[test]
fn bootstrapping_leaves_a_migrated_file_in_the_app_data_directory() {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = "com.opennest.db-test".into();
	let app = build(context);

	let database = db::bootstrap(app.handle()).expect("the database opens");

	let dir = app.path().app_data_dir().expect("data dir");
	let file = dir.join(FILE_NAME);
	assert!(file.exists(), "bootstrap created no file");
	let reopened = open(&file).expect("the file is a database");
	assert_eq!(
		migrations::version(&reopened).expect("version"),
		migrations::latest_version(),
		"the file was left short of the schema this build expects"
	);

	drop(reopened);
	drop(database);
	std::fs::remove_dir_all(&dir).expect("cleanup");
}
