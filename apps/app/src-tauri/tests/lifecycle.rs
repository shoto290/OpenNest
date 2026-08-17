//! The lifecycle transitions of one session, raced against each other.
//!
//! Unix only: what a refused transition must not leave behind is a process
//! group, and a group kill is a no-op everywhere else.
//!
//! The tests here share more than a process. `live_groups()` and the sweep are
//! process-wide by nature, and `cargo test` runs the tests of one binary in
//! parallel — so a neighbour running alongside would have its child counted, and
//! swept, by whichever test got there first. They take `SERIAL` in turn instead,
//! and recover from a poisoned lock rather than propagate it: the test that
//! panicked already fails the run, and cascading that into the others would only
//! hide which one broke.
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::time::Duration;

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::commands::{
	claude_shutdown, claude_start_or_resume_session, claude_submit_prompt, shutdown_session,
	terminate_session,
};
use opennest_app::claude::contract::{RuntimeScope, SessionHandle, TransportError};
use opennest_app::claude::session::live_groups;
use opennest_app::claude::ClaudeState;
use opennest_app::commands::invoke_handler;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, Manager};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);
/// Comfortably inside the grace a child deaf to EOF is given, so the quit lands
/// while the restart is still tearing the previous session down.
const QUIT_INSIDE_THE_LADDER: Duration = Duration::from_millis(200);

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn app() -> App<MockRuntime> {
	mock_builder()
		.manage(ClaudeState::default())
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
		.expect("app builds")
}

fn runtime() -> tokio::runtime::Runtime {
	tokio::runtime::Runtime::new().expect("runtime")
}

/// One conversation restarting its own runtime, so what is under test stays the
/// transition and never the scope: every call below names the same run.
fn scope() -> RuntimeScope {
	RuntimeScope {
		conversation_id: "c1".to_owned(),
		bot_id: "default".to_owned(),
		runtime_session_id: "r1".to_owned(),
		epoch: 1,
	}
}

/// Never `$HOME`: the child inherits this as its working directory.
async fn start(app: &App<MockRuntime>) -> Result<SessionHandle, TransportError> {
	claude_start_or_resume_session(
		app.handle().clone(),
		app.state::<ClaudeState>(),
		scope(),
		None,
		Some(std::env::temp_dir().to_string_lossy().into_owned()),
	)
	.await
}

async fn shutdown(app: &App<MockRuntime>) -> Result<(), TransportError> {
	claude_shutdown(app.handle().clone(), app.state::<ClaudeState>(), scope()).await
}

fn is_refused<T>(outcome: &Result<T, TransportError>) -> bool {
	matches!(outcome, Err(TransportError::TransitionInProgress))
}

async fn poll_until(expectation: &str, is_satisfied: impl Fn() -> bool) {
	let deadline = tokio::time::Instant::now() + DEADLINE;
	while !is_satisfied() {
		assert!(tokio::time::Instant::now() < deadline, "timed out waiting for {expectation}");
		tokio::time::sleep(POLL).await;
	}
}

fn recorded_pid(pid_file: &Path) -> Option<i32> {
	std::fs::read_to_string(pid_file).ok()?.trim().parse().ok()
}

fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

/// The probe file is named after this test process: worktrees run their suites
/// side by side and a shared path would have them racing.
fn probe_file() -> PathBuf {
	let path = std::env::temp_dir().join(format!("opennest-lifecycle-{}.pid", std::process::id()));
	let _ = std::fs::remove_file(&path);
	path
}

/// Two starts landing together must not both spawn. The loser's child would be
/// reachable through nothing but the process table, and its group would outlive
/// every shutdown the winner's session can be handed.
#[test]
fn two_concurrent_starts_leave_one_session_and_one_group() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);

	let app = app();
	runtime().block_on(async {
		let (first, second) = tokio::join!(start(&app), start(&app));

		assert!(
			first.is_ok() != second.is_ok(),
			"exactly one start must produce a session: {first:?} / {second:?}"
		);
		assert!(
			is_refused(&first) || is_refused(&second),
			"the losing start reported something other than a refusal: {first:?} / {second:?}"
		);
		assert_eq!(live_groups().len(), 1, "the refused start spawned a child of its own");

		shutdown_session(app.state::<ClaudeState>().inner()).await;
		assert!(live_groups().is_empty(), "the surviving session outlived its shutdown");
	});

	std::env::remove_var(BINARY_OVERRIDE_ENV);
}

/// A shutdown spends its seconds on a child that is deaf to EOF, and the state
/// slot is free for every one of them. Only the claim keeps a start out of that
/// window, and a start that got in would install its child behind the one still
/// being torn down.
#[test]
fn a_start_racing_a_shutdown_is_refused_rather_than_interleaved() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var("FAKE_CLAUDE_IGNORE_EOF", "1");

	let app = app();
	runtime().block_on(async {
		start(&app).await.expect("the session under test starts");

		let (stopped, started) = tokio::join!(shutdown(&app), start(&app));
		assert!(
			is_refused(&stopped) != is_refused(&started),
			"exactly one of the two must be refused: {stopped:?} / {started:?}"
		);
		assert!(live_groups().len() <= 1, "the two transitions each left a group behind");

		shutdown_session(app.state::<ClaudeState>().inner()).await;
		assert!(live_groups().is_empty(), "a child outlived both transitions");
	});

	std::env::remove_var("FAKE_CLAUDE_IGNORE_EOF");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
}

/// The window a quit is most dangerous in: a start whose handshake has not
/// returned owns a process group nothing else can see, and the slot it would
/// install into is still empty. The sweep ends the group, the child's stdout
/// closes with it, and the start comes back on the crash rather than on its
/// startup timeout — to a gate that stays shut behind it, because the next start
/// would launch a child for a host that no longer exists.
#[test]
fn a_quit_during_a_start_sweeps_the_group_and_closes_the_gate_for_good() {
	let _serial = serial();
	let pid_file = probe_file();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var("FAKE_CLAUDE_SCENARIO", "startup_timeout");
	std::env::set_var("FAKE_CLAUDE_ORPHAN_AT_STARTUP", "1");
	std::env::set_var("FAKE_CLAUDE_PID_FILE", &pid_file);

	let app = app();
	runtime().block_on(async {
		let (started, ()) = tokio::join!(start(&app), async {
			poll_until("the fake to record its grandchild", || recorded_pid(&pid_file).is_some())
				.await;
			let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
			assert!(is_alive(orphan), "the grandchild must be running before the quit");

			terminate_session(app.state::<ClaudeState>().inner()).await;
			poll_until("the exit sweep to leave no orphan behind", || !is_alive(orphan)).await;
		});

		assert!(
			matches!(started, Err(TransportError::Crashed { .. })),
			"the swept start reported {started:?} instead of the death of its child"
		);
		assert!(live_groups().is_empty(), "the quit left a group behind");
		assert_eq!(
			claude_submit_prompt(app.state::<ClaudeState>(), scope(), "salut".into()).await,
			Err(TransportError::NotStarted),
			"a session reached the state after the quit"
		);

		let after_quit = start(&app).await;
		assert!(is_refused(&after_quit), "a start after the quit was not refused: {after_quit:?}");
		assert!(live_groups().is_empty(), "a start after the quit spawned a child");
	});

	std::env::remove_var("FAKE_CLAUDE_PID_FILE");
	std::env::remove_var("FAKE_CLAUDE_ORPHAN_AT_STARTUP");
	std::env::remove_var("FAKE_CLAUDE_SCENARIO");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
	let _ = std::fs::remove_file(&pid_file);
}

/// The one window the sweep cannot cover, because the child it would have to
/// reach does not exist yet: a restart spends seconds shutting the previous
/// session down, and the quit that lands inside them sweeps a group the fresh
/// child has not joined. Only the check before the slot keeps that child from
/// being installed into a host on its way out, and left running behind it.
#[test]
fn a_quit_inside_a_restart_never_installs_the_child_it_was_building() {
	let _serial = serial();
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var("FAKE_CLAUDE_IGNORE_EOF", "1");

	let app = app();
	runtime().block_on(async {
		start(&app).await.expect("the session the restart replaces starts");

		let (restarted, ()) = tokio::join!(start(&app), async {
			tokio::time::sleep(QUIT_INSIDE_THE_LADDER).await;
			terminate_session(app.state::<ClaudeState>().inner()).await;
		});

		assert!(
			is_refused(&restarted),
			"the restart installed a session into a quitting host: {restarted:?}"
		);
		assert!(live_groups().is_empty(), "the child built after the sweep outlived it");
		assert_eq!(
			claude_submit_prompt(app.state::<ClaudeState>(), scope(), "salut".into()).await,
			Err(TransportError::NotStarted),
			"a session reached the state after the quit"
		);
	});

	std::env::remove_var("FAKE_CLAUDE_IGNORE_EOF");
	std::env::remove_var(BINARY_OVERRIDE_ENV);
}
