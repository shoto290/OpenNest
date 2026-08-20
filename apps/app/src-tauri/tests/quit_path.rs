//! What the host's exit reaches once the graceful paths no longer apply.
//!
//! Unix only: the sweep under test is a process-group kill, which is a no-op
//! everywhere else.
//!
//! Deliberately a single test in a binary of its own. The sweep is process-wide
//! by nature, and `cargo test` runs the tests of one binary in parallel, so a
//! second one here would have its own child swept out from under it.
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use opennest_app::agent::commands::terminate_session;
use opennest_app::agent::session::{EventSink, Session, SessionOptions};
use opennest_app::agent::sidecar::{Sidecar, SidecarOptions};
use opennest_app::agent::ClaudeState;
use tokio::sync::mpsc;


const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

/// Long enough that the start is still in flight when the quit arrives, which
/// is the whole window this test is about.
const UNREACHED_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

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
	let path = std::env::temp_dir().join(format!("opennest-quit-path-{}.pid", std::process::id()));
	let _ = std::fs::remove_file(&path);
	path
}

/// A session reaches the app's state only once its handshake has returned, and
/// resuming a large conversation can hold that open for the whole startup
/// window. A quit landing inside it finds nothing to terminate — and the sidecar
/// it cannot see has agents of its own by then.
#[tokio::test]
async fn quitting_during_a_startup_sweeps_the_group_it_cannot_see_yet() {
	let pid_file = probe_file();
	let sidecar = Sidecar::start(SidecarOptions::new(PathBuf::from(FAKE_SIDECAR)))
		.await
		.expect("the fake sidecar announces itself");

	let mut options = SessionOptions::new(std::env::temp_dir())
		.with_env("FAKE_CLAUDE_SCENARIO", "startup_timeout")
		.with_env("FAKE_CLAUDE_PID_FILE", pid_file.to_string_lossy())
		.with_env("FAKE_CLAUDE_ORPHAN_AT_STARTUP", "1");
	options.startup_timeout = UNREACHED_STARTUP_TIMEOUT;

	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let starting = tokio::spawn(Session::start(sidecar, options, sink));

	poll_until("the fake to record its grandchild", || recorded_pid(&pid_file).is_some()).await;
	let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
	assert!(is_alive(orphan), "the grandchild must be running before the quit");

	let state = ClaudeState::default();
	terminate_session(&state).await;

	poll_until("the exit sweep to leave no orphan behind", || !is_alive(orphan)).await;

	starting.abort();
	let _ = std::fs::remove_file(&pid_file);
}
