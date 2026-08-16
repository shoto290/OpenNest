//! End-to-end proof against the Claude Code install on this machine.
//!
//! Ignored by default: these tests need a signed-in binary and the network.
//! Run them with `cargo test --test real_claude -- --ignored --test-threads=1`.

use std::sync::Arc;
use std::time::Duration;

use opennest_app::claude::binary;
use opennest_app::claude::contract::{
	ActivityKind, ClaudeEvent, PermissionDecision, SessionSnapshot, TurnOutcome,
};
use opennest_app::claude::session::{EventSink, Session, SessionOptions};
use opennest_app::claude::store;
use tokio::sync::mpsc;

const TURN_TIMEOUT: Duration = Duration::from_secs(180);

struct Live {
	session: Session,
	events: mpsc::UnboundedReceiver<ClaudeEvent>,
}

async fn live(resume: Option<String>) -> Live {
	let path = binary::resolve().expect("claude binary is installed");
	assert!(binary::is_authenticated(&path).await.expect("auth probe"), "claude must be signed in");

	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let options = SessionOptions::new(path, std::env::temp_dir()).resuming(resume);
	let session = Session::start(options, sink).await.expect("session starts");
	Live { session, events }
}

impl Live {
	/// Drains one turn, auto-approving every permission so the run stays
	/// unattended.
	async fn run_turn(&mut self, prompt: &str) -> Vec<ClaudeEvent> {
		self.session.submit_prompt(prompt).await.expect("prompt accepted");
		self.collect().await
	}

	async fn collect(&mut self) -> Vec<ClaudeEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + TURN_TIMEOUT;
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => {
					if let ClaudeEvent::PermissionRequested { request } = &event {
						self.session
							.respond_to_permission(&request.id, PermissionDecision::AllowOnce)
							.await
							.expect("approval accepted");
					}
					let ended = matches!(event, ClaudeEvent::TurnEnded { .. });
					seen.push(event);
					if ended {
						return seen;
					}
				}
				Ok(None) | Err(_) => panic!("turn did not end within {TURN_TIMEOUT:?}"),
			}
		}
	}
}

fn text(events: &[ClaudeEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageCompleted { message } => Some(message.text.clone()),
			_ => None,
		})
		.collect::<Vec<_>>()
		.join(" ")
}

fn streamed(events: &[ClaudeEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn session_id(events: &[ClaudeEvent]) -> Option<String> {
	events.iter().find_map(|event| match event {
		ClaudeEvent::SessionReady { session_id, .. } => Some(session_id.clone()),
		_ => None,
	})
}

/// The check report is what the frontend receives first, and it is built from a
/// probe that also carries an email, an org id and a subscription type.
#[tokio::test]
#[ignore = "needs a signed-in claude and the network"]
async fn the_check_report_carries_no_identity() {
	let report = binary::check().await;
	assert!(report.authenticated, "expected a signed-in claude");

	let serialized = serde_json::to_string(&report).expect("report serializes");
	assert!(!serialized.contains('@'), "an email reached the contract: {serialized}");
	for forbidden in ["orgId", "orgName", "subscriptionType", "apiProvider", "authMethod"] {
		assert!(!serialized.contains(forbidden), "{forbidden} reached the contract: {serialized}");
	}
}

/// Two turns across two processes: the second one resumes the first by id and
/// still knows the number, and a real tool call shows up as activity.
#[tokio::test]
#[ignore = "needs a signed-in claude and the network"]
async fn two_turns_stream_and_the_second_resumes_the_first() {
	let mut first = live(None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;

	assert!(!streamed(&opening).is_empty(), "partial text must reach the contract");
	assert!(text(&opening).contains("OK"), "got {:?}", text(&opening));
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.session.shutdown().await;

	let mut second = live(Some(id.clone())).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "resumed turn lost the context: {:?}", text(&recall));

	let tooling =
		second.run_turn("Run the bash command `echo OPENNEST_PROBE` and report its output.").await;
	let tools: Vec<_> = tooling
		.iter()
		.filter_map(|event| match event {
			ClaudeEvent::Activity { activity } if activity.kind == ActivityKind::Tool => {
				Some(activity)
			}
			_ => None,
		})
		.collect();
	assert!(!tools.is_empty(), "a real tool call must surface as activity");
	assert!(text(&tooling).contains("OPENNEST_PROBE"), "got {:?}", text(&tooling));

	second.session.shutdown().await;
}

/// Stop interrupts a live turn, the session stays usable, and shutdown leaves
/// nothing behind.
#[tokio::test]
#[ignore = "needs a signed-in claude and the network"]
async fn stop_interrupts_a_live_turn_and_leaves_no_orphan() {
	let mut live = live(None).await;
	let pid = live.session.pid();

	live.session
		.submit_prompt(
			"Count from 1 to 300, one number per line, with a short sentence about each.",
		)
		.await
		.expect("prompt accepted");
	tokio::time::sleep(Duration::from_secs(6)).await;

	live.session.cancel_turn().await.expect("cancel accepted");
	let events = live.collect().await;
	let outcome = events.iter().find_map(|event| match event {
		ClaudeEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	});
	assert_eq!(outcome, Some(TurnOutcome::Cancelled));

	let after = live.run_turn("Reply with exactly: STILL_ALIVE").await;
	assert!(
		text(&after).contains("STILL_ALIVE"),
		"session unusable after stop: {:?}",
		text(&after)
	);

	live.session.shutdown().await;
	tokio::time::sleep(Duration::from_secs(1)).await;
	assert!(!group_alive(pid), "shutdown left claude processes behind");
}

/// The restart path, minus the app: an id minted by a real child goes through
/// the store on disk and still resumes the conversation on the way back.
#[tokio::test]
#[ignore = "needs a signed-in claude and the network"]
async fn an_id_stored_on_disk_resumes_the_conversation() {
	let mut first = live(None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.session.shutdown().await;

	let path = std::env::temp_dir().join(format!("opennest-live-{id}.json"));
	store::save(&path, &SessionSnapshot { session_id: Some(id), ..SessionSnapshot::default() });
	let restored = store::load(&path).session_id.expect("the stored id survives the round trip");

	let mut second = live(Some(restored)).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "the stored id did not resume: {:?}", text(&recall));

	second.session.shutdown().await;
	std::fs::remove_file(&path).expect("cleanup");
}

#[cfg(unix)]
fn group_alive(pid: u32) -> bool {
	unsafe { libc::killpg(pid as libc::pid_t, 0) == 0 }
}

#[cfg(not(unix))]
fn group_alive(_pid: u32) -> bool {
	false
}
