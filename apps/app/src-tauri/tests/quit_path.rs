#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use opennest_app::agent::commands::terminate_session;
use opennest_app::agent::session::{EventSink, Session, SessionOptions};
use opennest_app::agent::sidecar::{Sidecar, SidecarOptions};
use opennest_app::agent::AgentState;
use tokio::sync::mpsc;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

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

fn probe_file() -> PathBuf {
	let path = std::env::temp_dir().join(format!("opennest-quit-path-{}.pid", std::process::id()));
	let _ = std::fs::remove_file(&path);
	path
}

#[tokio::test]
async fn quitting_during_a_startup_sweeps_the_group_it_cannot_see_yet() {
	let pid_file = probe_file();
	let sidecar = Sidecar::start(SidecarOptions::new(PathBuf::from(FAKE_SIDECAR)))
		.await
		.expect("the fake sidecar announces itself");

	let mut options = SessionOptions::new(std::env::temp_dir())
		.with_env("FAKE_AGENT_SCENARIO", "startup_timeout")
		.with_env("FAKE_AGENT_PID_FILE", pid_file.to_string_lossy())
		.with_env("FAKE_AGENT_ORPHAN_AT_STARTUP", "1");
	options.startup_timeout = UNREACHED_STARTUP_TIMEOUT;

	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let starting = tokio::spawn(Session::start(sidecar, options, sink));

	poll_until("the fake to record its grandchild", || recorded_pid(&pid_file).is_some()).await;
	let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
	assert!(is_alive(orphan), "the grandchild must be running before the quit");

	let state = AgentState::default();
	terminate_session(&state).await;

	poll_until("the exit sweep to leave no orphan behind", || !is_alive(orphan)).await;

	starting.abort();
	let _ = std::fs::remove_file(&pid_file);
}
