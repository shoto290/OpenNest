//! The session lifecycle driven end to end through the Tauri command layer.
//!
//! "End to end" stops at that layer: command handlers, `ClaudeState`, the real
//! `Session` and its transport, the fake Claude child, and a relaunch through the
//! on-disk store. Nothing above the IPC boundary runs — no React mount, no
//! `chat-screen.tsx`, no `use-chat` subscription, no rendering — and `MockRuntime`
//! never emits `RunEvent::Exit`, so shutdown-on-quit is unproven here too.
//! `SMOKE.md` covers both by hand.
//!
//! No WebDriver alternative exists: macOS WKWebView exposes no WebDriver endpoint,
//! so `tauri-driver` supports Linux and Windows only.
//!
//! Deliberately a single test: the binary override and the fake's scenario are
//! process-global, and `cargo test` runs the tests of one binary in parallel, so
//! a second `#[test]` here would race on them.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::commands::{invoke_handler, EVENT_CHANNEL};
use opennest_app::claude::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, PermissionRequest,
	TransportError, TurnOutcome,
};
use opennest_app::claude::ClaudeState;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const SCENARIO_ENV: &str = "FAKE_CLAUDE_SCENARIO";
const IDENTIFIER: &str = "com.opennest.e2e";
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

struct Harness {
	app: App<MockRuntime>,
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ClaudeEvent>>>,
}

/// The identifier decides the app data directory, so this suite claims one of
/// its own rather than writing where a real install would.
fn launch() -> Harness {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = IDENTIFIER.into();

	let app = mock_builder()
		.manage(ClaudeState::default())
		.invoke_handler(invoke_handler())
		.build(context)
		.expect("app builds");
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	let log: Arc<Mutex<Vec<ClaudeEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ClaudeEvent>(event.payload()) {
			sink.lock().expect("event log").push(parsed);
		}
	});

	Harness { app, window, log }
}

impl Harness {
	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		tauri::test::get_ipc_response(
			&self.window,
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

	/// Never `$HOME`: the child inherits this as its working directory.
	fn start(&self, resume: Option<&str>) -> Result<Value, Value> {
		self.call(
			"claude_start_or_resume_session",
			json!({ "resume": resume, "cwd": std::env::temp_dir() }),
		)
	}

	fn prompt(&self, text: &str) -> Result<Value, Value> {
		self.call("claude_submit_prompt", json!({ "text": text }))
	}

	fn events(&self) -> Vec<ClaudeEvent> {
		self.log.lock().expect("event log").clone()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	/// Events land by callback, so there is nothing to await. Everything this
	/// test waits on is polled here, and a wait that never lands fails the test
	/// naming what it wanted instead of hanging a developer's afternoon.
	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[ClaudeEvent]) -> Option<T>) -> T {
		let deadline = Instant::now() + DEADLINE;
		loop {
			let seen = self.events();
			if let Some(found) = ready(&seen) {
				return found;
			}
			assert!(
				Instant::now() < deadline,
				"waited {DEADLINE:?} for {expected} and only saw {seen:#?}"
			);
			std::thread::sleep(POLL);
		}
	}
}

fn scenario(name: &str) {
	std::env::set_var(SCENARIO_ENV, name);
}

fn turn_outcome(seen: &[ClaudeEvent]) -> Option<TurnOutcome> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn session_ready(seen: &[ClaudeEvent]) -> Option<(String, bool)> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::SessionReady { session_id, resumed } => Some((session_id.clone(), *resumed)),
		_ => None,
	})
}

fn permission_request(seen: &[ClaudeEvent]) -> Option<PermissionRequest> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::PermissionRequested { request } => Some(request.clone()),
		_ => None,
	})
}

fn message_started(seen: &[ClaudeEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::MessageStarted { .. } => Some(()),
		_ => None,
	})
}

fn resume_failure(seen: &[ClaudeEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::Failed { error: TransportError::ResumeFailed { .. } } => Some(()),
		_ => None,
	})
}

fn permission_resolutions(seen: &[ClaudeEvent]) -> Vec<(String, PermissionDecision)> {
	seen.iter()
		.filter_map(|event| match event {
			ClaudeEvent::PermissionResolved { id, decision } => Some((id.clone(), *decision)),
			_ => None,
		})
		.collect()
}

fn deltas(seen: &[ClaudeEvent]) -> String {
	seen.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

#[cfg(unix)]
fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

/// The fake spawns a grandchild only a process-group kill can reach. The probe
/// file is named after this test process: worktrees run their suites side by
/// side and a shared path would have them racing.
#[cfg(unix)]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	let pid_file =
		std::env::temp_dir().join(format!("opennest-e2e-orphan-{}.pid", std::process::id()));
	let _ = std::fs::remove_file(&pid_file);
	std::env::set_var("FAKE_CLAUDE_PID_FILE", &pid_file);

	scenario("orphan");
	assert_eq!(harness.start(None), Ok(json!({ "resumed": false })));
	harness.forget_events();
	harness.prompt("lance un enfant").expect("prompt accepted");
	harness.wait_for("the orphan turn to start streaming", message_started);

	let orphan: i32 = std::fs::read_to_string(&pid_file)
		.expect("the fake recorded its grandchild")
		.trim()
		.parse()
		.expect("pid is a number");
	assert!(is_alive(orphan), "the grandchild must be running before the shutdown");

	assert_eq!(harness.call("claude_shutdown", json!({})), Ok(Value::Null));
	harness.wait_for("the grandchild to be gone", |_| (!is_alive(orphan)).then_some(()));

	std::env::remove_var("FAKE_CLAUDE_PID_FILE");
	let _ = std::fs::remove_file(&pid_file);
}

#[cfg(not(unix))]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	assert_eq!(harness.call("claude_shutdown", json!({})), Ok(Value::Null));
}

/// Launch, stream, persist, permission, stop, shutdown, then a second app over
/// the same store: restoration, resume, and the fallback when the stored id is
/// refused. The relaunch drops the first app rather than running its event-loop
/// exit path, so this proves file-based restoration, not shutdown-on-quit.
#[test]
fn a_session_streams_survives_a_relaunch_and_leaves_no_orphan() {
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	scenario("normal");

	let first = launch();
	let data_dir = first.app.path().app_data_dir().expect("data dir");
	let _ = std::fs::remove_dir_all(&data_dir);

	let report: CheckReport =
		serde_json::from_value(first.call("claude_check", json!({})).expect("check reports"))
			.expect("a check report");
	assert_eq!(report.connection, ConnectionState::Ready);
	assert!(report.authenticated);
	assert_eq!(report.binary_version.as_deref(), Some("2.0.0-fake"));
	assert_eq!(report.error, None);

	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));

	first.forget_events();
	first.prompt("bonjour").expect("prompt accepted");
	assert_eq!(first.wait_for("the first turn to end", turn_outcome), TurnOutcome::Completed);

	let streamed = first.events();
	assert_eq!(deltas(&streamed), "echo :: bonjour");
	let (session_id, resumed) = session_ready(&streamed).expect("the child announced its session");
	assert_eq!(session_id, "fake-session-0001");
	assert!(!resumed, "a fresh launch must not claim a resume");

	let snapshot = json!({
		"sessionId": session_id,
		"messages": [{
			"id": "m1",
			"role": "user",
			"text": "bonjour",
			"completion": "complete",
			"timestamp": 17
		}],
		"activities": []
	});
	assert_eq!(first.call("claude_save_session", json!({ "snapshot": snapshot })), Ok(Value::Null));
	assert_eq!(first.call("claude_load_session", json!({})), Ok(snapshot.clone()));

	scenario("permission");
	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));
	first.forget_events();
	first.prompt("ecris un fichier").expect("prompt accepted");
	let request = first.wait_for("the permission request", permission_request);
	assert_eq!(request.tool_name, "Write");
	assert_eq!(
		first.call(
			"claude_respond_to_permission",
			json!({ "id": request.id, "decision": "allowOnce" })
		),
		Ok(Value::Null)
	);
	assert_eq!(first.wait_for("the approved turn to end", turn_outcome), TurnOutcome::Completed);
	assert_eq!(
		permission_resolutions(&first.events()),
		vec![(request.id, PermissionDecision::AllowOnce)]
	);

	scenario("slow");
	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));
	first.forget_events();
	first.prompt("compte jusqu'a mille").expect("prompt accepted");
	first.wait_for("the slow turn to start streaming", message_started);
	assert_eq!(first.call("claude_cancel_turn", json!({})), Ok(Value::Null));
	assert_eq!(first.wait_for("the cancelled turn to end", turn_outcome), TurnOutcome::Cancelled);
	first.prompt("encore").expect("a cancelled session still accepts a prompt");

	shut_down_leaving_no_orphan(&first);
	drop(first);

	scenario("normal");
	let second = launch();
	let restored = second.call("claude_load_session", json!({})).expect("snapshot loads");
	assert_eq!(restored, snapshot);

	let stored_id = restored["sessionId"].as_str().expect("a stored session id").to_owned();
	assert_eq!(second.start(Some(&stored_id)), Ok(json!({ "resumed": true })));
	second.forget_events();
	second.prompt("et avant ?").expect("prompt accepted");
	assert_eq!(second.wait_for("the resumed turn to end", turn_outcome), TurnOutcome::Completed);
	assert_eq!(deltas(&second.events()), format!("resumed {stored_id} :: et avant ?"));

	scenario("resume_crash");
	second.forget_events();
	assert_eq!(second.start(Some(&stored_id)), Ok(json!({ "resumed": false })));
	second.wait_for("the refused resume to be reported", resume_failure);

	let dropped = second.call("claude_load_session", json!({})).expect("snapshot loads");
	assert_eq!(dropped["sessionId"], Value::Null);
	assert_eq!(dropped["messages"], snapshot["messages"]);

	assert_eq!(second.call("claude_shutdown", json!({})), Ok(Value::Null));
	std::fs::remove_dir_all(&data_dir).expect("cleanup");
}
