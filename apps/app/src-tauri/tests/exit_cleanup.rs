//! Checks the teardown the window-close path runs: the managed session and its
//! whole process group must be gone before the callback returns.
#![cfg(unix)]

use std::time::Duration;

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::commands::{
	claude_start_or_resume_session, claude_submit_prompt, shutdown_blocking,
};
use opennest_app::claude::ClaudeState;
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const SETTLE: Duration = Duration::from_millis(400);
/// Two orders of magnitude above the measured teardown, and under the first
/// escalation grace, so it fails if the child is left to a signal rather than
/// leaving on the closed stdin.
const QUIT_BUDGET: Duration = Duration::from_millis(300);

fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

#[test]
fn the_exit_handler_reaps_the_managed_session_and_its_group() {
	let pid_file = std::env::temp_dir().join("opennest-exit-orphan-probe.pid");
	let _ = std::fs::remove_file(&pid_file);
	let cwd = std::env::temp_dir().to_string_lossy().into_owned();

	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
	std::env::set_var("FAKE_CLAUDE_SCENARIO", "orphan");
	std::env::set_var("FAKE_CLAUDE_PID_FILE", &pid_file);

	let app = mock_builder()
		.manage(ClaudeState::default())
		.build(mock_context(noop_assets()))
		.expect("app builds");

	tauri::async_runtime::block_on(claude_start_or_resume_session(
		app.handle().clone(),
		app.state::<ClaudeState>(),
		None,
		Some(cwd),
	))
	.expect("session starts");
	tauri::async_runtime::block_on(claude_submit_prompt(
		app.state::<ClaudeState>(),
		"lance un enfant".into(),
	))
	.expect("prompt accepted");
	std::thread::sleep(SETTLE);

	let orphan: i32 = std::fs::read_to_string(&pid_file)
		.expect("fake child recorded its grandchild")
		.trim()
		.parse()
		.expect("pid is a number");
	assert!(is_alive(orphan), "grandchild should be running before the exit handler");

	let started = std::time::Instant::now();
	shutdown_blocking(app.handle());
	let teardown = started.elapsed();
	std::thread::sleep(SETTLE);

	assert!(!is_alive(orphan), "closing the window must leave no orphan behind");
	assert!(teardown < QUIT_BUDGET, "quitting took {teardown:?}, budget is {QUIT_BUDGET:?}");
	shutdown_blocking(app.handle());
	let _ = std::fs::remove_file(&pid_file);
}
