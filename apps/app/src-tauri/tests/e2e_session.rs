
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::commands::{terminate_session, EVENT_CHANNEL};
use opennest_app::agent::contract::{
	CheckReport, AgentEvent, ConnectionState, PermissionDecision, PermissionRequest, RuntimeScope,
	ScopedEvent, TransportError, TurnOutcome,
};
use opennest_app::agent::AgentState;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const IDENTIFIER: &str = "com.opennest.e2e";
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

struct Harness {
	app: App<MockRuntime>,
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ScopedEvent>>>,
	run: Mutex<RuntimeScope>,
}

fn a_run(epoch: i64) -> RuntimeScope {
	RuntimeScope {
		conversation_id: "c1".to_owned(),
		bot_id: "default".to_owned(),
		runtime_session_id: format!("r{epoch}"),
		epoch,
	}
}

fn launch() -> Harness {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = IDENTIFIER.into();

	let app = mock_builder()
		.manage(AgentState::default())
		.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir))
		.invoke_handler(invoke_handler())
		.build(context)
		.expect("app builds");
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	let log: Arc<Mutex<Vec<ScopedEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.lock().expect("event log").push(parsed);
		}
	});

	Harness { app, window, log, run: Mutex::new(a_run(0)) }
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

	fn quit(&self) {
		let runtime = tokio::runtime::Runtime::new().expect("runtime");
		runtime.block_on(terminate_session(&self.app.state::<AgentState>()));
	}

	fn scope(&self) -> Value {
		serde_json::to_value(&*self.run.lock().expect("run")).expect("the scope serializes")
	}

	fn start(&self, resume: Option<&str>) -> Result<Value, Value> {
		{
			let mut run = self.run.lock().expect("run");
			*run = a_run(run.epoch + 1);
		}
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": self.scope(), "resume": resume, "cwd": std::env::temp_dir() }),
		)
	}

	fn prompt(&self, text: &str) -> Result<Value, Value> {
		self.call("agent_submit_prompt", json!({ "scope": self.scope(), "text": text }))
	}

	fn events(&self) -> Vec<AgentEvent> {
		self.log.lock().expect("event log").iter().map(|scoped| scoped.event.clone()).collect()
	}

	fn scoped_events(&self) -> Vec<ScopedEvent> {
		self.log.lock().expect("event log").clone()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[AgentEvent]) -> Option<T>) -> T {
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
	let path = std::env::temp_dir()
		.join(format!("opennest-fake-scenario-{}.txt", std::process::id()));
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, path);
}

fn turn_outcome(seen: &[AgentEvent]) -> Option<TurnOutcome> {
	seen.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn session_ready(seen: &[AgentEvent]) -> Option<(String, bool)> {
	seen.iter().find_map(|event| match event {
		AgentEvent::SessionReady { session_id, resumed } => Some((session_id.clone(), *resumed)),
		_ => None,
	})
}

fn permission_request(seen: &[AgentEvent]) -> Option<PermissionRequest> {
	seen.iter().find_map(|event| match event {
		AgentEvent::PermissionRequested { request } => Some(request.clone()),
		_ => None,
	})
}

fn message_started(seen: &[AgentEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		AgentEvent::MessageStarted { .. } => Some(()),
		_ => None,
	})
}

fn resume_failure(seen: &[AgentEvent]) -> Option<bool> {
	seen.iter().find_map(|event| match event {
		AgentEvent::Failed { error: TransportError::ResumeFailed { forgot_session_id } } => {
			Some(*forgot_session_id)
		}
		_ => None,
	})
}

fn permission_resolutions(seen: &[AgentEvent]) -> Vec<(String, PermissionDecision)> {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::PermissionResolved { id, decision } => Some((id.clone(), *decision)),
			_ => None,
		})
		.collect()
}

fn deltas(seen: &[AgentEvent]) -> String {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn orphan_pid_file() -> std::path::PathBuf {
	std::env::temp_dir().join(format!("opennest-e2e-orphan-{}.pid", std::process::id()))
}

#[cfg(unix)]
fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(unix)]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	let pid_file = orphan_pid_file();
	let _ = std::fs::remove_file(&pid_file);

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

	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": harness.scope() })),
		Ok(Value::Null)
	);
	harness.quit();
	harness.wait_for("the grandchild to be gone", |_| (!is_alive(orphan)).then_some(()));

	std::env::remove_var("FAKE_AGENT_PID_FILE");
	let _ = std::fs::remove_file(&pid_file);
}

#[cfg(not(unix))]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": harness.scope() })),
		Ok(Value::Null)
	);
}

#[test]
fn a_session_streams_survives_a_relaunch_and_leaves_no_orphan() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_PID_FILE", orphan_pid_file());
	scenario("normal");

	let first = launch();
	let data_dir = first.app.path().app_data_dir().expect("data dir");
	let _ = std::fs::remove_dir_all(&data_dir);

	let report: CheckReport = serde_json::from_value(
		first.call("agent_check", json!({ "scope": Value::Null })).expect("check reports"),
	)
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
	assert!(
		first.scoped_events().iter().all(|scoped| scoped.scope.as_ref() == Some(&a_run(1))),
		"an event crossed without naming the run it came from: {:#?}",
		first.scoped_events()
	);

	scenario("permission");
	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));
	first.forget_events();
	first.prompt("ecris un fichier").expect("prompt accepted");
	let request = first.wait_for("the permission request", permission_request);
	assert_eq!(request.tool_name, "Write");
	assert_eq!(
		first.call(
			"agent_respond_to_permission",
			json!({ "scope": first.scope(), "id": request.id, "decision": "allowOnce" })
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
	assert_eq!(
		first.call("agent_cancel_turn", json!({ "scope": first.scope() })),
		Ok(Value::Null)
	);
	assert_eq!(first.wait_for("the cancelled turn to end", turn_outcome), TurnOutcome::Cancelled);
	first.prompt("encore").expect("a cancelled session still accepts a prompt");

	shut_down_leaving_no_orphan(&first);
	drop(first);

	scenario("normal");
	let second = launch();
	assert_eq!(second.start(Some(&session_id)), Ok(json!({ "resumed": true })));
	second.forget_events();
	second.prompt("et avant ?").expect("prompt accepted");
	assert_eq!(second.wait_for("the resumed turn to end", turn_outcome), TurnOutcome::Completed);
	assert_eq!(deltas(&second.events()), format!("resumed {session_id} :: et avant ?"));

	scenario("resume_crash");
	second.forget_events();
	assert_eq!(second.start(Some(&session_id)), Ok(json!({ "resumed": false })));
	assert!(
		second.wait_for("the refused resume to be reported", resume_failure),
		"the frontend was left holding an id the host gave up on"
	);

	assert_eq!(second.call("agent_shutdown", json!({ "scope": second.scope() })), Ok(Value::Null));
	let _ = std::fs::remove_dir_all(&data_dir);
}
