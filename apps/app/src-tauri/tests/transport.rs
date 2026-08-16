//! Transport tests driven by the deterministic fake Claude child.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use opennest_app::claude::commands::start_with_fallback;
use opennest_app::claude::contract::{
	ActivityKind, ActivityStatus, ClaudeEvent, ConnectionState, MessageCompletion,
	PermissionDecision, TransportError, TurnOutcome, TurnState,
};
use opennest_app::claude::session::{EventSink, Session, SessionOptions};
use tokio::sync::mpsc;

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const SETTLE: Duration = Duration::from_millis(400);

struct Harness {
	session: Session,
	events: mpsc::UnboundedReceiver<ClaudeEvent>,
}

fn options(scenario: &str) -> SessionOptions {
	let mut options = SessionOptions::new(PathBuf::from(FAKE), std::env::temp_dir())
		.with_env("FAKE_CLAUDE_SCENARIO", scenario);
	options.startup_timeout = Duration::from_secs(2);
	options
}

async fn start(options: SessionOptions) -> Result<Harness, TransportError> {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let session = Session::start(options, sink).await?;
	Ok(Harness { session, events })
}

impl Harness {
	async fn submit(&self, text: &str) -> Result<(), TransportError> {
		self.session.submit_prompt(text).await
	}

	async fn cancel(&self) -> Result<(), TransportError> {
		self.session.cancel_turn().await
	}

	/// Drains until the turn closes, or gives up so a hung transport fails the
	/// test instead of hanging it.
	async fn drain_turn(&mut self) -> Vec<ClaudeEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => {
					let ended = matches!(event, ClaudeEvent::TurnEnded { .. });
					let fatal = matches!(&event, ClaudeEvent::Failed { error } if error.is_fatal());
					seen.push(event);
					if ended || fatal {
						return seen;
					}
				}
				Ok(None) | Err(_) => return seen,
			}
		}
	}

	async fn drain_available(&mut self) -> Vec<ClaudeEvent> {
		tokio::time::sleep(SETTLE).await;
		let mut seen = Vec::new();
		while let Ok(event) = self.events.try_recv() {
			seen.push(event);
		}
		seen
	}
}

fn assistant_text(events: &[ClaudeEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageCompleted { message } => Some(message.text.clone()),
			_ => None,
		})
		.collect()
}

fn deltas(events: &[ClaudeEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn outcome(events: &[ClaudeEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		ClaudeEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

#[tokio::test]
async fn streams_a_normal_turn_and_closes_it() {
	let mut harness = start(options("normal")).await.expect("session starts");
	harness.submit("bonjour").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::SessionReady { session_id, resumed } if session_id == "fake-session-0001" && !resumed
	)));
	assert_eq!(deltas(&events), "echo :: bonjour");
	assert_eq!(assistant_text(&events), "echo :: bonjour");
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	assert_eq!(harness.session.turn_state().await, TurnState::Idle);
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_second_turn_reuses_the_same_process() {
	let mut harness = start(options("normal")).await.expect("session starts");
	harness.submit("un").await.expect("first prompt");
	assert_eq!(outcome(&harness.drain_turn().await), Some(TurnOutcome::Completed));

	harness.submit("deux").await.expect("second prompt");
	let events = harness.drain_turn().await;
	assert_eq!(assistant_text(&events), "echo :: deux");
	assert_eq!(harness.session.session_id().await.as_deref(), Some("fake-session-0001"));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn resuming_passes_the_session_id_to_the_child() {
	let mut harness = start(options("normal").resuming(Some("carried-over".into())))
		.await
		.expect("session starts");
	assert!(harness.session.resumed());

	harness.submit("et avant ?").await.expect("prompt accepted");
	let events = harness.drain_turn().await;
	assert_eq!(assistant_text(&events), "resumed carried-over :: et avant ?");
	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::SessionReady { session_id, resumed } if session_id == "carried-over" && *resumed
	)));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn tool_use_surfaces_as_activity() {
	let mut harness = start(options("tool")).await.expect("session starts");
	harness.submit("lance un outil").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	let activities: Vec<_> = events
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::Activity { activity } => Some(activity),
			_ => None,
		})
		.collect();

	assert!(activities.iter().any(|activity| activity.kind == ActivityKind::Tool
		&& activity.status == ActivityStatus::Running));
	let done = activities
		.iter()
		.find(|activity| activity.status == ActivityStatus::Succeeded)
		.expect("tool completes");
	assert_eq!(done.title, "Bash · Echo FAKE");
	harness.session.shutdown().await;
}

#[tokio::test]
async fn invalid_frames_are_reported_without_killing_the_turn() {
	let mut harness = start(options("invalid_frames")).await.expect("session starts");
	harness.submit("casse le flux").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	let invalid = events
		.iter()
		.filter(|event| {
			matches!(event, ClaudeEvent::Failed { error: TransportError::InvalidFrame { .. } })
		})
		.count();
	assert_eq!(invalid, 2);
	assert_eq!(assistant_text(&events), "recovered");
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_missing_binary_is_reported_before_spawning() {
	let mut options = SessionOptions::new(PathBuf::from("/nonexistent/claude"), std::env::temp_dir());
	options.startup_timeout = Duration::from_secs(1);
	let error = start(options).await.err().expect("spawn fails");
	assert!(matches!(error, TransportError::SpawnFailed { .. }));
}

#[tokio::test]
async fn a_silent_child_trips_the_startup_timeout() {
	let error = start(options("startup_timeout")).await.err().expect("handshake fails");
	assert!(matches!(error, TransportError::StartupTimeout { timeout_ms: 2000 }));
}

#[tokio::test]
async fn a_child_dying_during_startup_is_reported_as_a_crash() {
	let error = start(options("startup_crash")).await.err().expect("handshake fails");
	assert!(matches!(error, TransportError::Crashed { code: Some(3), .. }));
}

#[tokio::test]
async fn a_child_can_refuse_the_resume_flag_alone() {
	let refused = start(options("resume_crash").resuming(Some("dead-id".into()))).await;
	assert!(matches!(refused.err(), Some(TransportError::Crashed { code: Some(4), .. })));

	let harness = start(options("resume_crash")).await.expect("a fresh start is accepted");
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_refused_resume_falls_back_to_a_fresh_session() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let session = start_with_fallback(options("resume_crash"), Some("dead-id".into()), sink)
		.await
		.expect("the fresh start rescues the launch");

	assert!(!session.resumed(), "the fallback session must not claim the stored id");
	session.shutdown().await;
}

/// The fallback is expected to work, so the attempt it replaces has nothing to
/// report: a crash banner would flash on the one path built never to fail the
/// reader.
#[tokio::test]
async fn a_refused_resume_keeps_its_crash_off_the_channel() {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let session = start_with_fallback(options("resume_crash"), Some("dead-id".into()), sink)
		.await
		.expect("the fresh start rescues the launch");
	let mut harness = Harness { session, events };
	let seen = harness.drain_available().await;

	assert!(
		!seen.iter().any(|event| matches!(
			event,
			ClaudeEvent::ConnectionChanged { state: ConnectionState::Crashed }
				| ClaudeEvent::Failed { error: TransportError::Crashed { .. } }
		)),
		"the refused attempt reached the reader: {seen:#?}"
	);
	harness.session.shutdown().await;
}

/// A resume that works must lose nothing it emitted while it was still being
/// judged, and the announcement has to lead the turn it belongs to.
#[tokio::test]
async fn an_accepted_resume_keeps_what_it_buffered() {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let session = start_with_fallback(options("early_init"), Some("carried-over".into()), sink)
		.await
		.expect("the stored id is accepted");
	let mut harness = Harness { session, events };

	harness.submit("et avant ?").await.expect("prompt accepted");
	let seen = harness.drain_turn().await;

	let announced = seen
		.iter()
		.position(|event| {
			matches!(
				event,
				ClaudeEvent::SessionReady { session_id, resumed }
					if session_id == "carried-over" && *resumed
			)
		})
		.expect("the buffered announcement survived the promotion");
	let streamed = seen
		.iter()
		.position(|event| matches!(event, ClaudeEvent::MessageDelta { .. }))
		.expect("the turn streamed");

	assert_eq!(announced, 0, "the flush comes before anything the session emits after it");
	assert!(announced < streamed, "the turn overtook the announcement");
	assert_eq!(assistant_text(&seen), "resumed carried-over :: et avant ?");
	harness.session.shutdown().await;
}

/// A failure the fresh start reproduces belongs to the install, so it travels
/// upward untouched and the caller never reaches the branch that would drop the
/// stored id.
#[tokio::test]
async fn a_start_failing_without_the_resume_flag_too_stays_a_failure() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let error = start_with_fallback(options("startup_crash"), Some("dead-id".into()), sink)
		.await
		.err()
		.expect("both attempts fail");

	assert!(matches!(error, TransportError::Crashed { code: Some(3), .. }));
}

#[tokio::test]
async fn a_mid_turn_crash_lands_on_the_crashed_connection_state() {
	let mut harness = start(options("crash")).await.expect("session starts");
	harness.submit("meurs").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::ConnectionChanged { state: ConnectionState::Crashed }
	)));
	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::Failed { error: TransportError::Crashed { code: Some(9), .. } }
	)));
	assert_eq!(harness.session.turn_state().await, TurnState::Failed);
}

#[tokio::test]
async fn cancelling_ends_the_turn_and_leaves_the_session_reusable() {
	let mut harness = start(options("slow")).await.expect("session starts");
	harness.submit("compte jusqu'a mille").await.expect("prompt accepted");
	tokio::time::sleep(SETTLE).await;

	harness.cancel().await.expect("cancel accepted");
	let events = harness.drain_turn().await;
	assert_eq!(outcome(&events), Some(TurnOutcome::Cancelled));
	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::MessageCompleted { message } if message.completion == MessageCompletion::Cancelled
	)));
	assert_eq!(harness.session.turn_state().await, TurnState::Idle);

	harness.submit("encore").await.expect("session is reusable after a cancel");
	harness.session.shutdown().await;
}

#[tokio::test]
async fn cancelling_outside_a_turn_is_rejected() {
	let harness = start(options("normal")).await.expect("session starts");
	assert!(matches!(harness.cancel().await, Err(TransportError::NoActiveTurn)));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_second_prompt_during_a_turn_is_rejected() {
	let harness = start(options("slow")).await.expect("session starts");
	harness.submit("premier").await.expect("prompt accepted");
	assert!(matches!(harness.submit("second").await, Err(TransportError::TurnAlreadyRunning)));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_permission_request_can_be_allowed() {
	let mut harness = start(options("permission")).await.expect("session starts");
	harness.submit("ecris un fichier").await.expect("prompt accepted");
	let pending = harness.drain_available().await;

	let request = pending
		.iter()
		.find_map(|event| match event {
			ClaudeEvent::PermissionRequested { request } => Some(request.clone()),
			_ => None,
		})
		.expect("permission requested");
	assert_eq!(request.tool_name, "Write");
	assert_eq!(request.title, "Write · notes.txt");
	assert_eq!(request.detail.as_deref(), Some("/fake/notes.txt"));

	harness
		.session
		.respond_to_permission(&request.id, PermissionDecision::AllowOnce)
		.await
		.expect("decision accepted");

	let events = harness.drain_turn().await;
	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::Activity { activity } if activity.status == ActivityStatus::Succeeded
	)));
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_permission_request_can_be_denied() {
	let mut harness = start(options("permission")).await.expect("session starts");
	harness.submit("ecris un fichier").await.expect("prompt accepted");
	let pending = harness.drain_available().await;
	let request = pending
		.iter()
		.find_map(|event| match event {
			ClaudeEvent::PermissionRequested { request } => Some(request.clone()),
			_ => None,
		})
		.expect("permission requested");

	harness
		.session
		.respond_to_permission(&request.id, PermissionDecision::Deny)
		.await
		.expect("decision accepted");

	let events = harness.drain_turn().await;
	assert!(events.iter().any(|event| matches!(
		event,
		ClaudeEvent::Activity { activity } if activity.status == ActivityStatus::Failed
	)));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn answering_an_unknown_permission_is_rejected() {
	let harness = start(options("normal")).await.expect("session starts");
	let error = harness
		.session
		.respond_to_permission("nope", PermissionDecision::AllowOnce)
		.await
		.expect_err("unknown id rejected");
	assert!(matches!(error, TransportError::UnknownPermission { .. }));
	harness.session.shutdown().await;
}

/// The grace window is a ceiling, not a schedule: a child handed EOF exits on
/// its own, so the shutdown lands far inside it and never reaches a signal.
#[tokio::test]
async fn closing_stdin_ends_a_healthy_child_well_inside_the_grace() {
	let harness = start(options("normal")).await.expect("session starts");

	let started = Instant::now();
	harness.session.shutdown().await;
	let elapsed = started.elapsed();

	assert!(elapsed < Duration::from_secs(1), "shutdown waited {elapsed:?} instead of taking EOF");
}

/// Runs a session that has spawned a grandchild only a process-group kill can
/// reach. The probe file is named after this test process: worktrees run their
/// suites side by side and a shared path would have them racing.
#[cfg(unix)]
async fn orphan_probe(label: &str, options: SessionOptions) -> (Harness, i32) {
	let pid_file = std::env::temp_dir()
		.join(format!("opennest-orphan-probe-{}-{label}.pid", std::process::id()));
	let _ = std::fs::remove_file(&pid_file);

	let harness = start(options.with_env("FAKE_CLAUDE_PID_FILE", pid_file.to_string_lossy()))
		.await
		.expect("session starts");
	harness.submit("lance un enfant").await.expect("prompt accepted");
	tokio::time::sleep(SETTLE).await;

	let orphan: i32 = std::fs::read_to_string(&pid_file)
		.expect("fake child recorded its grandchild")
		.trim()
		.parse()
		.expect("pid is a number");
	assert!(is_alive(orphan), "grandchild should be running before the kill");
	let _ = std::fs::remove_file(&pid_file);

	(harness, orphan)
}

#[cfg(unix)]
#[tokio::test]
async fn shutdown_takes_the_whole_process_group_down() {
	let (harness, orphan) = orphan_probe("shutdown", options("orphan")).await;

	harness.session.shutdown().await;
	tokio::time::sleep(SETTLE).await;

	assert!(!is_alive(orphan), "shutdown must leave no orphan behind");
}

/// A child deaf to EOF is the only thing the escalation is left for, and it
/// still has to be reached — bounded, so a wedged child cannot hold the app on
/// its way out.
#[cfg(unix)]
#[tokio::test]
async fn shutdown_escalates_on_a_child_that_ignores_stdin_close() {
	let (harness, orphan) =
		orphan_probe("deaf", options("orphan").with_env("FAKE_CLAUDE_IGNORE_EOF", "1")).await;

	tokio::time::timeout(Duration::from_secs(8), harness.session.shutdown())
		.await
		.expect("the escalation keeps the shutdown bounded");
	tokio::time::sleep(SETTLE).await;

	assert!(!is_alive(orphan), "the escalation must leave no orphan behind");
}

#[cfg(unix)]
#[tokio::test]
async fn terminating_takes_the_whole_process_group_down() {
	let (harness, orphan) = orphan_probe("terminate", options("orphan")).await;

	harness.session.terminate().await;
	tokio::time::sleep(SETTLE).await;

	assert!(!is_alive(orphan), "the exit path must leave no orphan behind");
}

#[cfg(unix)]
fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}
