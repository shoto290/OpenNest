//! What the scope buys at the host boundary: a command may only reach the run the
//! host is holding, and every event says which run it came from.
//!
//! The host runs one Claude process, and a restart replaces it while the old child
//! is still alive, still answering and still able to have a command aimed at it by
//! whatever was talking to it a moment ago. These tests drive that through the IPC
//! boundary rather than through the command functions: the scope is an argument the
//! frontend spells by hand, so a name only one side knows is a refusal nothing in
//! Rust would catch.
//!
//! Both tests spawn a real child and share `live_groups()` with each other, which is
//! process-wide by nature — they take `SERIAL` in turn, and recover from a poisoned
//! lock rather than propagate it, the way `lifecycle.rs` does.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use opennest_app::agent::binary::BINARY_OVERRIDE_ENV;
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::commands::EVENT_CHANNEL;
use opennest_app::agent::contract::{AgentEvent, RuntimeScope, ScopedEvent, TurnOutcome};
use opennest_app::agent::ClaudeState;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, WebviewWindow, WebviewWindowBuilder};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

/// One participant's lineage, as the durable store hands it out: the same
/// conversation and bot throughout, a row of its own per run, and the number the
/// lineage counts handovers with.
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
	// Kept for the app handle the window borrows: dropping it would take the host
	// down mid-test.
	_app: App<MockRuntime>,
}

fn launch() -> Harness {
	let app = mock_builder()
		.manage(ClaudeState::default())
		// A host that never opened a file: what a bot was described as is another
		// suite's subject, and here every child comes up carrying nothing.
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

	/// Never `$HOME`: the child inherits this as its working directory.
	fn start(&self, run: &Value) -> Result<Value, Value> {
		self.call(
			"claude_start_or_resume_session",
			json!({ "scope": run, "resume": Value::Null, "cwd": std::env::temp_dir() }),
		)
	}

	fn prompt_is_taken(&self, run: &Value) {
		assert_eq!(
			self.call("claude_submit_prompt", json!({ "scope": run, "text": "bonjour" })),
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

	/// Events land by callback, so there is nothing to await: a wait that never
	/// lands fails naming what it wanted rather than hanging.
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

/// A second participant: another bot, in a chat of its own. Both fields differ
/// because both are what makes a run somebody else's.
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

/// The window this whole scope exists for. A restart replaces the child, and
/// whatever was driving the old one — a cancel already in flight, a permission the
/// reader answered a moment too late, a shutdown for a session that is already
/// gone — is still holding the run it knew. Every one of those has to be refused
/// on the run it names, before the session's own rules get a say: answered
/// instead, they would stop, unblock or tear down the process that took its place.
#[test]
fn a_run_the_host_replaced_reaches_nothing_and_the_one_it_holds_still_answers() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_CLAUDE_SCENARIO", "normal");

	let harness = launch();
	let replaced = a_run(1);
	let live = a_run(2);
	assert_eq!(harness.start(&replaced), Ok(json!({ "resumed": false })));
	assert_eq!(harness.start(&live), Ok(json!({ "resumed": false })));

	assert_eq!(
		harness.call("claude_submit_prompt", json!({ "scope": replaced, "text": "salut" })),
		stale("r1"),
		"a replaced run submitted a prompt to the session that took its place"
	);
	assert_eq!(
		harness.call("claude_cancel_turn", json!({ "scope": replaced })),
		stale("r1"),
		"a replaced run was answered about the live session's turn"
	);
	assert_eq!(
		harness.call(
			"claude_respond_to_permission",
			json!({ "scope": replaced, "id": "whatever", "decision": "allowOnce" })
		),
		stale("r1"),
		"a replaced run answered a permission on the live session"
	);
	assert_eq!(
		harness.call("claude_shutdown", json!({ "scope": replaced })),
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
	assert_eq!(harness.call("claude_shutdown", json!({ "scope": live })), Ok(Value::Null));

	std::env::remove_var("FAKE_CLAUDE_SCENARIO");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
}

/// A frontend has nothing but the envelope to tell one run's stream from another's,
/// so every event carries the run it came from — and the one host answer that is
/// about no run at all, the check, carries back exactly the run the caller named,
/// `null` included. That is what lets a reader compare rather than special-case.
#[test]
fn every_event_names_the_run_it_belongs_to_and_a_check_echoes_the_callers() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_CLAUDE_SCENARIO", "normal");

	let harness = launch();
	let run = a_run(1);
	// The run as it comes home, so every assertion below compares one value rather
	// than serializing each event's scope back to JSON to look at it.
	let named: RuntimeScope = serde_json::from_value(run.clone()).expect("the scope parses");

	harness.call("claude_check", json!({ "scope": Value::Null })).expect("the check reports");
	assert!(
		harness.events().iter().all(|scoped| scoped.scope.is_none()),
		"a check made before any run invented one: {:#?}",
		harness.events()
	);

	harness.forget_events();
	harness.call("claude_check", json!({ "scope": run })).expect("the check reports");
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

	assert_eq!(harness.call("claude_shutdown", json!({ "scope": run })), Ok(Value::Null));

	std::env::remove_var("FAKE_CLAUDE_SCENARIO");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
}

/// The whole point of a runtime per participant: one reader, two bots, and both of
/// them answering at once. Starting the second hands nothing back to be shut down,
/// each turn crosses under the run that produced it, and ending one bot's session
/// leaves the other one answering — which is what a reader who walks away from a
/// working bot is owed.
#[test]
fn two_bots_answer_at_once_and_each_stream_stays_under_its_own_run() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_CLAUDE_SCENARIO", "normal");

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

	assert_eq!(harness.call("claude_shutdown", json!({ "scope": first })), Ok(Value::Null));
	harness.forget_events();
	harness.prompt_is_taken(&second);
	assert_eq!(
		harness.wait_for("the bot left running to finish its turn", |seen| {
			outcome_under(seen, &other)
		}),
		TurnOutcome::Completed,
		"ending one bot's session stopped the bot beside it"
	);
	assert_eq!(harness.call("claude_shutdown", json!({ "scope": second })), Ok(Value::Null));

	std::env::remove_var("FAKE_CLAUDE_SCENARIO");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
}
