
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::commands::EVENT_CHANNEL;
use opennest_app::agent::contract::{AgentEvent, RuntimeScope, ScopedEvent, TurnOutcome};
use opennest_app::agent::AgentState;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn a_run(epoch: i64) -> Value {
	json!({
		"conversationId": "c1",
		"botId": "default",
		"runtimeSessionId": format!("r{epoch}"),
		"epoch": epoch
	})
}

struct Harness {
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ScopedEvent>>>,
	_app: App<MockRuntime>,
}

fn launch() -> Harness {
	let app = mock_builder()
		.manage(AgentState::default())
		.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir))
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
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

	Harness { _app: app, window, log }
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

	fn start(&self, run: &Value) -> Result<Value, Value> {
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": run, "resume": Value::Null, "cwd": std::env::temp_dir() }),
		)
	}

	fn prompt_is_taken(&self, run: &Value) {
		assert_eq!(
			self.call("agent_submit_prompt", json!({ "scope": run, "text": "bonjour" })),
			Ok(Value::Null),
			"the live run refused a prompt"
		);
	}

	fn events(&self) -> Vec<ScopedEvent> {
		self.log.lock().expect("event log").clone()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[ScopedEvent]) -> Option<T>) -> T {
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

fn another_bots_run() -> Value {
	json!({
		"conversationId": "c2",
		"botId": "second",
		"runtimeSessionId": "r9",
		"epoch": 1
	})
}

fn named(run: &Value) -> RuntimeScope {
	serde_json::from_value(run.clone()).expect("the scope parses")
}

fn outcome_under(seen: &[ScopedEvent], run: &RuntimeScope) -> Option<TurnOutcome> {
	seen.iter().find_map(|scoped| match (&scoped.scope, &scoped.event) {
		(Some(scope), AgentEvent::TurnEnded { ended }) if scope == run => Some(ended.outcome),
		_ => None,
	})
}

fn spoke_under(seen: &[ScopedEvent], run: &RuntimeScope) -> bool {
	seen.iter().any(|scoped| {
		matches!((&scoped.scope, &scoped.event), (Some(scope), AgentEvent::MessageDelta { .. }) if scope == run)
	})
}

fn turn_outcome(seen: &[ScopedEvent]) -> Option<TurnOutcome> {
	seen.iter().find_map(|scoped| match scoped.event {
		AgentEvent::TurnEnded { ref ended } => Some(ended.outcome),
		_ => None,
	})
}

fn stale(runtime_session_id: &str) -> Result<Value, Value> {
	Err(json!({ "kind": "staleRuntimeSession", "runtimeSessionId": runtime_session_id }))
}

#[test]
fn a_run_the_host_replaced_reaches_nothing_and_the_one_it_holds_still_answers() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let replaced = a_run(1);
	let live = a_run(2);
	assert_eq!(harness.start(&replaced), Ok(json!({ "resumed": false })));
	assert_eq!(harness.start(&live), Ok(json!({ "resumed": false })));

	assert_eq!(
		harness.call("agent_submit_prompt", json!({ "scope": replaced, "text": "salut" })),
		stale("r1"),
		"a replaced run submitted a prompt to the session that took its place"
	);
	assert_eq!(
		harness.call("agent_cancel_turn", json!({ "scope": replaced })),
		stale("r1"),
		"a replaced run was answered about the live session's turn"
	);
	assert_eq!(
		harness.call(
			"agent_respond_to_permission",
			json!({ "scope": replaced, "id": "whatever", "decision": "allowOnce" })
		),
		stale("r1"),
		"a replaced run answered a permission on the live session"
	);
	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": replaced })),
		stale("r1"),
		"a replaced run shut down the session that took its place"
	);

	harness.forget_events();
	harness.prompt_is_taken(&live);
	assert_eq!(
		harness.wait_for("the live run to finish its turn", turn_outcome),
		TurnOutcome::Completed,
		"the live session stopped answering after the refusals"
	);
	assert_eq!(harness.call("agent_shutdown", json!({ "scope": live })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

#[test]
fn every_event_names_the_run_it_belongs_to_and_a_check_echoes_the_callers() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let run = a_run(1);
	let named: RuntimeScope = serde_json::from_value(run.clone()).expect("the scope parses");

	harness.call("agent_check", json!({ "scope": Value::Null })).expect("the check reports");
	assert!(
		harness.events().iter().all(|scoped| scoped.scope.is_none()),
		"a check made before any run invented one: {:#?}",
		harness.events()
	);

	harness.forget_events();
	harness.call("agent_check", json!({ "scope": run })).expect("the check reports");
	let echoed = harness.events();
	assert!(
		!echoed.is_empty() && echoed.iter().all(|scoped| scoped.scope.as_ref() == Some(&named)),
		"a check answered under a run the caller never named: {echoed:#?}"
	);

	harness.forget_events();
	assert_eq!(harness.start(&run), Ok(json!({ "resumed": false })));
	harness.prompt_is_taken(&run);
	harness.wait_for("the turn to end", turn_outcome);
	let streamed = harness.events();
	assert!(
		streamed.iter().all(|scoped| scoped.scope.as_ref() == Some(&named)),
		"an event crossed under another run than the one that produced it: {streamed:#?}"
	);
	assert!(
		streamed.iter().any(|scoped| matches!(scoped.event, AgentEvent::MessageDelta { .. })),
		"the turn produced nothing to be scoped: {streamed:#?}"
	);

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": run })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

#[test]
fn two_bots_answer_at_once_and_each_stream_stays_under_its_own_run() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let first = a_run(1);
	let second = another_bots_run();
	assert_eq!(harness.start(&first), Ok(json!({ "resumed": false })));
	assert_eq!(harness.start(&second), Ok(json!({ "resumed": false })));

	let one = named(&first);
	let other = named(&second);
	harness.forget_events();
	harness.prompt_is_taken(&first);
	harness.prompt_is_taken(&second);

	harness.wait_for("both bots to finish their turn", |seen| {
		outcome_under(seen, &one).zip(outcome_under(seen, &other))
	});
	let streamed = harness.events();
	assert!(
		spoke_under(&streamed, &one) && spoke_under(&streamed, &other),
		"a bot answered under a run that was not its own: {streamed:#?}"
	);
	assert!(
		streamed
			.iter()
			.all(|scoped| scoped.scope.as_ref() == Some(&one)
				|| scoped.scope.as_ref() == Some(&other)),
		"an event crossed under a run neither bot was started for: {streamed:#?}"
	);

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": first })), Ok(Value::Null));
	harness.forget_events();
	harness.prompt_is_taken(&second);
	assert_eq!(
		harness.wait_for("the bot left running to finish its turn", |seen| {
			outcome_under(seen, &other)
		}),
		TurnOutcome::Completed,
		"ending one bot's session stopped the bot beside it"
	);
	assert_eq!(harness.call("agent_shutdown", json!({ "scope": second })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}
