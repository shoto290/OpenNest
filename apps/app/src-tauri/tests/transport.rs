//! Transport tests driven by the deterministic fake sidecar.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use opennest_app::agent::commands::start_with_fallback;
use opennest_app::agent::contract::{
	ActivityKind, ActivityStatus, AgentCommand, AgentEvent, ConnectionState, MessageCompletion,
	PermissionDecision, PermissionRequest, QuestionRequest, TransportError, TurnOutcome, TurnState,
};
use opennest_app::agent::session::{EventSink, Session, SessionOptions, PARTIAL_MESSAGES};
use opennest_app::agent::sidecar::{self, Sidecar, SidecarOptions, SHUTDOWN_GRACE};
use tokio::sync::mpsc;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SETTLE: Duration = Duration::from_millis(400);
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);
/// Every rung of the escalation and then some. The ladder's own waits are the
/// only thing a shutdown may spend time on, and each is bounded by
/// `SHUTDOWN_GRACE`.
const LADDER_CEILING: Duration = Duration::from_secs(12);

struct Harness {
	session: Session,
	sidecar: Arc<Sidecar>,
	events: mpsc::UnboundedReceiver<AgentEvent>,
}

/// The scenario travels with the session rather than with the process now: one
/// sidecar serves every run, so what one of them is asked to be has to be said
/// when it is opened.
fn options(scenario: &str) -> SessionOptions {
	let mut options = SessionOptions::new(std::env::temp_dir())
		.with_env("FAKE_AGENT_SCENARIO", scenario);
	options.startup_timeout = Duration::from_secs(2);
	options
}

fn sidecar_options() -> SidecarOptions {
	let mut options = SidecarOptions::new(PathBuf::from(FAKE_SIDECAR));
	options.ready_timeout = Duration::from_secs(2);
	options
}

async fn sidecar() -> Arc<Sidecar> {
	Sidecar::start(sidecar_options()).await.expect("the fake sidecar announces itself")
}

/// A sidecar started under variables of its own — what the session env cannot
/// carry, because it describes the process rather than the run.
async fn sidecar_with(env: &[(&str, &str)]) -> Arc<Sidecar> {
	let options = env
		.iter()
		.fold(sidecar_options(), |options, (key, value)| options.with_env(key, *value));
	Sidecar::start(options).await.expect("the fake sidecar announces itself")
}

async fn start(options: SessionOptions) -> Result<Harness, TransportError> {
	start_on(sidecar().await, options).await
}

async fn start_on(
	sidecar: Arc<Sidecar>,
	options: SessionOptions,
) -> Result<Harness, TransportError> {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let session = Session::start(sidecar.clone(), options, sink).await?;
	Ok(Harness { session, sidecar, events })
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
	async fn drain_turn(&mut self) -> Vec<AgentEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + DEADLINE;
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => {
					let ended = matches!(event, AgentEvent::TurnEnded { .. });
					let fatal = matches!(&event, AgentEvent::Failed { error } if error.is_fatal());
					seen.push(event);
					if ended || fatal {
						return seen;
					}
				}
				Ok(None) | Err(_) => return seen,
			}
		}
	}

	/// Collects until the caller's expectation holds. A wait that runs out says
	/// what it was waiting for and what arrived instead, which a fixed sleep
	/// cannot: it just leaves the next assertion to fail somewhere else.
	async fn wait_for(
		&mut self,
		expectation: &str,
		is_satisfied: impl Fn(&[AgentEvent]) -> bool,
	) -> Vec<AgentEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + DEADLINE;
		while !is_satisfied(&seen) {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => seen.push(event),
				Ok(None) => panic!("the channel closed while waiting for {expectation}: {seen:#?}"),
				Err(_) => panic!("timed out waiting for {expectation}: {seen:#?}"),
			}
		}
		seen
	}

	async fn wait_for_question(&mut self) -> QuestionRequest {
		let seen =
			self.wait_for("a question request", |events| question_request(events).is_some()).await;
		question_request(&seen).expect("the wait only returns once it is there")
	}

	async fn wait_for_permission(&mut self) -> PermissionRequest {
		let seen = self
			.wait_for("a permission request", |events| permission_request(events).is_some())
			.await;
		permission_request(&seen).expect("the wait only returns once it is there")
	}
}

/// The one wait that cannot be an expectation: proving nothing arrives needs a
/// window for it to arrive in. Every other caller states what it awaits.
async fn drain_after_settling(
	events: &mut mpsc::UnboundedReceiver<AgentEvent>,
) -> Vec<AgentEvent> {
	tokio::time::sleep(SETTLE).await;
	let mut seen = Vec::new();
	while let Ok(event) = events.try_recv() {
		seen.push(event);
	}
	seen
}

fn reports_a_crash(events: &[AgentEvent]) -> bool {
	events.iter().any(|event| {
		matches!(
			event,
			AgentEvent::ConnectionChanged { state: ConnectionState::Crashed }
				| AgentEvent::Failed { error: TransportError::Crashed { .. } }
		)
	})
}

fn permission_request(events: &[AgentEvent]) -> Option<PermissionRequest> {
	events.iter().find_map(|event| match event {
		AgentEvent::PermissionRequested { request } => Some(request.clone()),
		_ => None,
	})
}

fn question_request(events: &[AgentEvent]) -> Option<QuestionRequest> {
	events.iter().find_map(|event| match event {
		AgentEvent::QuestionRequested { request } => Some(request.clone()),
		_ => None,
	})
}

fn has_started_streaming(events: &[AgentEvent]) -> bool {
	events.iter().any(|event| matches!(event, AgentEvent::MessageStarted { .. }))
}

fn assistant_text(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageCompleted { message } => Some(message.text.clone()),
			_ => None,
		})
		.collect()
}

fn deltas(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
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
		AgentEvent::SessionReady { session_id, resumed } if session_id == "fake-session-0001" && !resumed
	)));
	assert_eq!(deltas(&events), "echo :: bonjour");
	assert_eq!(assistant_text(&events), "echo :: bonjour");
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	assert_eq!(harness.session.turn_state().await, TurnState::Idle);
	harness.session.shutdown().await;
}

/// The two asks about the install travel down the pipe every session shares, so
/// both are answered by the one process the host already holds — and both come back
/// as an answer rather than as a frame no session was owed.
#[tokio::test]
async fn the_install_is_asked_of_the_sidecar_the_sessions_are_served_from() {
	let live = sidecar_with(&[("FAKE_AGENT_MODELS", "quasar,nimbus-preview")]).await;

	assert!(live.authenticated().await.expect("the sign-in probe answers"));
	assert_eq!(live.catalogue().await.expect("the catalogue answers"), ["quasar", "nimbus-preview"]);

	let mut harness = start_on(live, options("normal")).await.expect("session starts");
	harness.submit("bonjour").await.expect("prompt accepted");
	assert_eq!(outcome(&harness.drain_turn().await), Some(TurnOutcome::Completed));
	harness.session.shutdown().await;
}

/// Two callers asking at the same moment are both answered from the one line: the
/// second is not left waiting on a channel the first replaced.
#[tokio::test]
async fn two_asks_landing_together_are_both_answered() {
	let live = sidecar_with(&[("FAKE_AGENT_MODELS", "quasar")]).await;

	let (first, second) = tokio::join!(live.catalogue(), live.catalogue());

	assert_eq!(first.expect("the first ask answers"), ["quasar"]);
	assert_eq!(second.expect("the second ask answers"), ["quasar"]);
	live.shutdown().await;
}

/// An ask on a sidecar that has stopped talking is refused on the spot. It is the
/// launch that waits on this answer, and a caller left hanging on a dead pipe is a
/// reader shown nothing at all.
#[tokio::test]
async fn an_ask_on_a_dead_sidecar_is_refused_rather_than_left_hanging() {
	let gone = sidecar().await;
	gone.shutdown().await;

	assert!(matches!(
		gone.authenticated().await,
		Err(TransportError::WriteFailed { .. }) | Err(TransportError::Crashed { .. })
	));
	assert!(matches!(
		gone.catalogue().await,
		Err(TransportError::WriteFailed { .. }) | Err(TransportError::Crashed { .. })
	));
}

/// A capability the sidecar never announced is one the host never asks for. The
/// reader is answered with the whole message instead of a stream that would never
/// arrive — the same reply, said once.
#[tokio::test]
async fn a_sidecar_that_names_no_deltas_answers_in_whole_messages() {
	let plain = sidecar_with(&[("FAKE_AGENT_CAPABILITIES", "resume")]).await;
	assert!(!plain.supports(PARTIAL_MESSAGES));

	let mut harness = start_on(plain, options("normal")).await.expect("session starts");
	harness.submit("bonjour").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	assert_eq!(deltas(&events), "", "a sidecar naming no deltas streamed some");
	assert_eq!(assistant_text(&events), "echo :: bonjour");
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
}

/// Every session is a lane on one process, and a lane outlives the turns it
/// carries: the second prompt reaches the same run as the first.
#[tokio::test]
async fn a_second_turn_reuses_the_same_session() {
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
		AgentEvent::SessionReady { session_id, resumed } if session_id == "carried-over" && *resumed
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
			AgentEvent::Activity { activity } => Some(activity),
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
			matches!(event, AgentEvent::Failed { error: TransportError::InvalidFrame { .. } })
		})
		.count();
	assert_eq!(invalid, 2);
	assert_eq!(assistant_text(&events), "recovered");
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_missing_sidecar_is_reported_before_spawning() {
	let options = SidecarOptions::new(PathBuf::from("/nonexistent/opennest-agent"));
	let error = Sidecar::start(options).await.err().expect("spawn fails");
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
	assert!(matches!(error, TransportError::Crashed { .. }));
}

#[tokio::test]
async fn a_child_can_refuse_the_resume_flag_alone() {
	let refused = start(options("resume_crash").resuming(Some("dead-id".into()))).await;
	assert!(matches!(refused.err(), Some(TransportError::Crashed { .. })));

	let harness = start(options("resume_crash")).await.expect("a fresh start is accepted");
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_refused_resume_falls_back_to_a_fresh_session() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let started = start_with_fallback(sidecar().await, options("resume_crash"), Some("dead-id".into()), sink)
		.await
		.expect("the fresh start rescues the launch");

	assert!(!started.session.resumed(), "the fallback session must not claim the stored id");
	assert!(matches!(started.resume_refusal, Some(TransportError::Crashed { .. })));
	started.session.shutdown().await;
}

/// A resume that only ran out of time has proven nothing about the id. Claude
/// replays a conversation before it acknowledges anything, so the bigger the
/// transcript the likelier the wait — and that transcript is exactly what
/// blaming the id would cost.
#[tokio::test]
async fn a_resume_that_timed_out_is_reported_as_a_timeout() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let started = start_with_fallback(sidecar().await, options("resume_timeout"), Some("slow-id".into()), sink)
		.await
		.expect("the fresh start rescues the launch");

	assert!(!started.session.resumed());
	assert!(
		matches!(started.resume_refusal, Some(TransportError::StartupTimeout { .. })),
		"a slow resume was reported as something the id could be blamed for: {:?}",
		started.resume_refusal
	);
	started.session.shutdown().await;
}

/// The fallback is expected to work, so the attempt it replaces has nothing to
/// report: a crash banner would flash on the one path built never to fail the
/// reader.
#[tokio::test]
async fn a_refused_resume_keeps_its_crash_off_the_channel() {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let sidecar = sidecar().await;
	let started =
		start_with_fallback(sidecar.clone(), options("resume_crash"), Some("dead-id".into()), sink)
			.await
			.expect("the fresh start rescues the launch");
	let mut harness = Harness { session: started.session, sidecar, events };
	let seen = drain_after_settling(&mut harness.events).await;

	assert!(!reports_a_crash(&seen), "the refused attempt reached the reader: {seen:#?}");
	harness.session.shutdown().await;
}

/// A start that fails is reported by the command that owns it, once. The child
/// it kills on the way out reaches `on_exit` too, on a task of its own, and a
/// second account of the same failure racing the first can leave a startup
/// timeout on screen as "claude exited unexpectedly".
#[tokio::test]
async fn a_failed_start_keeps_the_child_it_killed_off_the_channel() {
	let (tx, mut events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let error =
		Session::start(sidecar().await, options("startup_timeout"), sink).await.err().expect("handshake fails");
	assert!(matches!(error, TransportError::StartupTimeout { .. }));

	let seen = drain_after_settling(&mut events).await;

	assert!(!reports_a_crash(&seen), "the killed child reported a crash of its own: {seen:#?}");
}

/// The commands a session announces cross as their own frame, with what each one
/// does. The unit tests read the frame off a hand-built value; this one reads it
/// off a real child, through the envelope and the tag that resolves it, and proves
/// the list lands before the reader is told the session is open.
#[tokio::test]
async fn the_commands_a_session_announces_reach_the_reader() {
	let mut harness = start(options("commands")).await.expect("the session opens");

	let seen = drain_after_settling(&mut harness.events).await;

	assert_eq!(
		seen.iter()
			.find_map(|event| match event {
				AgentEvent::CommandsListed { commands } => Some(commands.clone()),
				_ => None,
			})
			.expect("the announcement reached the reader"),
		vec![
			AgentCommand {
				name: "review".to_owned(),
				description: Some("Review the pending changes".to_owned()),
			},
			AgentCommand { name: "plan".to_owned(), description: None },
		]
	);
	harness.session.shutdown().await;
}

/// A resume that works must lose nothing it emitted while it was still being
/// judged, and the announcement has to lead the turn it belongs to.
#[tokio::test]
async fn an_accepted_resume_keeps_what_it_buffered() {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let sidecar = sidecar().await;
	let started = start_with_fallback(
		sidecar.clone(),
		options("early_init"),
		Some("carried-over".into()),
		sink,
	)
	.await
	.expect("the stored id is accepted");
	assert_eq!(started.resume_refusal, None, "the stored id was never given up on");
	let mut harness = Harness { session: started.session, sidecar, events };

	harness.submit("et avant ?").await.expect("prompt accepted");
	let seen = harness.drain_turn().await;

	let announced = seen
		.iter()
		.position(|event| {
			matches!(
				event,
				AgentEvent::SessionReady { session_id, resumed }
					if session_id == "carried-over" && *resumed
			)
		})
		.expect("the buffered announcement survived the promotion");
	let streamed = seen
		.iter()
		.position(|event| matches!(event, AgentEvent::MessageDelta { .. }))
		.expect("the turn streamed");

	assert_eq!(announced, 0, "the flush comes before anything the session emits after it");
	assert!(announced < streamed, "the turn overtook the announcement");
	assert_eq!(assistant_text(&seen), "resumed carried-over :: et avant ?");
	harness.session.shutdown().await;
}

/// A failure the fresh start reproduces belongs to the install, so it travels
/// upward and the caller never reaches the branch that would drop the stored id.
#[tokio::test]
async fn a_start_failing_without_the_resume_flag_too_stays_a_failure() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let error =
		start_with_fallback(sidecar().await, options("startup_crash"), Some("dead-id".into()), sink)
			.await
			.err()
			.expect("both attempts fail");

	assert!(matches!(error, TransportError::Crashed { .. }));
}

/// When the two attempts fail differently the reader is owed the fresh one:
/// the resume attempt's verdict is the older of the two and the one about a
/// flag that is no longer in play.
#[tokio::test]
async fn two_different_failures_surface_the_fresh_one() {
	let (tx, _events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);

	let error = start_with_fallback(
		sidecar().await,
		options("resume_timeout_then_crash"),
		Some("slow-id".into()),
		sink,
	)
	.await
	.err()
	.expect("both attempts fail");

	assert!(
		matches!(error, TransportError::Crashed { .. }),
		"the spent resume attempt outlived the fresh one: {error:?}"
	);
}

#[tokio::test]
async fn a_mid_turn_crash_lands_on_the_crashed_connection_state() {
	let mut harness = start(options("crash")).await.expect("session starts");
	harness.submit("meurs").await.expect("prompt accepted");
	let events = harness.drain_turn().await;

	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::ConnectionChanged { state: ConnectionState::Crashed }
	)));
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::Failed { error: TransportError::Crashed { .. } }
	)));
	assert_eq!(harness.session.turn_state().await, TurnState::Failed);
}

#[tokio::test]
async fn cancelling_ends_the_turn_and_leaves_the_session_reusable() {
	let mut harness = start(options("slow")).await.expect("session starts");
	harness.submit("compte jusqu'a mille").await.expect("prompt accepted");
	harness.wait_for("the answer to start streaming", has_started_streaming).await;

	harness.cancel().await.expect("cancel accepted");
	let events = harness.drain_turn().await;
	assert_eq!(outcome(&events), Some(TurnOutcome::Cancelled));
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::MessageCompleted { message } if message.completion == MessageCompletion::Cancelled
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
	let request = harness.wait_for_permission().await;

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
		AgentEvent::Activity { activity } if activity.status == ActivityStatus::Succeeded
	)));
	assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn a_permission_request_can_be_denied() {
	let mut harness = start(options("permission")).await.expect("session starts");
	harness.submit("ecris un fichier").await.expect("prompt accepted");
	let request = harness.wait_for_permission().await;

	harness
		.session
		.respond_to_permission(&request.id, PermissionDecision::Deny)
		.await
		.expect("decision accepted");

	let events = harness.drain_turn().await;
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::Activity { activity } if activity.status == ActivityStatus::Failed
	)));
	harness.session.shutdown().await;
}

/// The ask travels as questions rather than as a permission, and the answers go
/// back as the tool input the child reads: one label, several joined, and words
/// typed instead all arrive as they were written.
#[tokio::test]
async fn a_question_is_answered_with_what_the_reader_said() {
	let mut harness = start(options("question")).await.expect("session starts");
	harness.submit("choisis").await.expect("prompt accepted");
	let request = harness.wait_for_question().await;

	let headers: Vec<&str> = request.questions.iter().map(|asked| asked.header.as_str()).collect();
	assert_eq!(headers, ["Library", "Extras"]);
	assert_eq!(
		request.questions[0].options[0].preview.as_deref(),
		Some("import { format } from \"date-fns\"")
	);
	assert!(!request.questions[0].multi_select);
	assert!(request.questions[1].multi_select);

	let answers = HashMap::from([
		("Which library should we use?".to_owned(), "date-fns".to_owned()),
		("Which extras do you want?".to_owned(), "Tests, Docs".to_owned()),
	]);
	harness
		.session
		.answer_question(&request.id, answers, None)
		.await
		.expect("the answers are accepted");

	let events = harness.drain_turn().await;
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::PermissionResolved { id, decision }
			if id == &request.id && *decision == PermissionDecision::AllowOnce
	)));
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::Activity { activity } if activity.status == ActivityStatus::Succeeded
	)));
	assert_eq!(
		assistant_text(&events),
		"Which extras do you want?=Tests, Docs | Which library should we use?=date-fns"
	);
	harness.session.shutdown().await;
}

/// Refusing to answer is refusing the tool: the question goes back through the
/// permission path and the child is denied.
#[tokio::test]
async fn a_question_can_be_denied() {
	let mut harness = start(options("question")).await.expect("session starts");
	harness.submit("choisis").await.expect("prompt accepted");
	let request = harness.wait_for_question().await;

	harness
		.session
		.respond_to_permission(&request.id, PermissionDecision::Deny)
		.await
		.expect("decision accepted");

	let events = harness.drain_turn().await;
	assert!(events.iter().any(|event| matches!(
		event,
		AgentEvent::Activity { activity } if activity.status == ActivityStatus::Failed
	)));
	harness.session.shutdown().await;
}

#[tokio::test]
async fn answering_a_question_nobody_asked_is_rejected() {
	let harness = start(options("normal")).await.expect("session starts");
	let error = harness
		.session
		.answer_question("nope", HashMap::new(), None)
		.await
		.expect_err("unknown id rejected");
	assert!(matches!(error, TransportError::UnknownPermission { .. }));
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
/// its own, so the shutdown returns inside it and never reaches a signal.
/// Anything at or past it means the escalation had to do the work.
#[tokio::test]
async fn closing_stdin_ends_a_healthy_sidecar_without_reaching_the_signal() {
	let harness = start(options("normal")).await.expect("session starts");

	let started = Instant::now();
	harness.sidecar.shutdown().await;
	let elapsed = started.elapsed();

	assert!(elapsed < SHUTDOWN_GRACE, "shutdown waited {elapsed:?} instead of taking EOF");
}

/// EOF on stdout says the child stopped talking, not that it stopped running.
/// The wait that follows holds the child lock, so an unbounded one leaves the
/// quit path blocked on the very child it exists to end.
#[tokio::test]
async fn a_sidecar_that_closes_stdout_and_keeps_running_is_reported_and_still_terminable() {
	let deaf = sidecar_with(&[("FAKE_AGENT_IGNORE_EOF", "1")]).await;
	let mut harness = start_on(deaf, options("stdout_eof")).await.expect("session starts");
	harness.submit("tais-toi mais reste").await.expect("prompt accepted");

	harness
		.wait_for("the silent child to be reported", |events| {
			events.iter().any(|event| {
				matches!(event, AgentEvent::ConnectionChanged { state: ConnectionState::Crashed })
			})
		})
		.await;

	tokio::time::timeout(DEADLINE, harness.sidecar.terminate())
		.await
		.expect("the quit path never got the child lock back");
}

/// The probe file is named after this test process: worktrees run their suites
/// side by side and a shared path would have them racing.
#[cfg(unix)]
fn probe_file(label: &str) -> PathBuf {
	let path = std::env::temp_dir()
		.join(format!("opennest-orphan-probe-{}-{label}.pid", std::process::id()));
	let _ = std::fs::remove_file(&path);
	path
}

/// Runs a session that has spawned a grandchild only a process-group kill can
/// reach.
#[cfg(unix)]
async fn orphan_probe(
	label: &str,
	sidecar: Arc<Sidecar>,
	options: SessionOptions,
) -> (Harness, i32) {
	let pid_file = probe_file(label);

	let harness =
		start_on(sidecar, options.with_env("FAKE_AGENT_PID_FILE", pid_file.to_string_lossy()))
			.await
			.expect("session starts");
	harness.submit("lance un enfant").await.expect("prompt accepted");
	poll_until("the fake child to record its grandchild", || recorded_pid(&pid_file).is_some())
		.await;

	let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
	assert!(is_alive(orphan), "grandchild should be running before the kill");
	let _ = std::fs::remove_file(&pid_file);

	(harness, orphan)
}

/// The filesystem and the process table cannot be awaited, so these two are the
/// only waits left that genuinely have to sample.
#[cfg(unix)]
async fn poll_until(expectation: &str, is_satisfied: impl Fn() -> bool) {
	let deadline = tokio::time::Instant::now() + DEADLINE;
	while !is_satisfied() {
		assert!(tokio::time::Instant::now() < deadline, "timed out waiting for {expectation}");
		tokio::time::sleep(POLL).await;
	}
}

#[cfg(unix)]
fn recorded_pid(pid_file: &std::path::Path) -> Option<i32> {
	std::fs::read_to_string(pid_file).ok()?.trim().parse().ok()
}

#[cfg(unix)]
#[tokio::test]
async fn shutdown_takes_the_whole_process_group_down() {
	let (harness, orphan) = orphan_probe("shutdown", sidecar().await, options("orphan")).await;

	harness.sidecar.shutdown().await;

	poll_until("the shutdown to leave no orphan behind", || !is_alive(orphan)).await;
}

/// A child deaf to EOF is the only thing the escalation is left for, and it
/// still has to be reached — bounded, so a wedged child cannot hold the app on
/// its way out.
#[cfg(unix)]
#[tokio::test]
async fn shutdown_escalates_on_a_sidecar_that_ignores_stdin_close() {
	let deaf = sidecar_with(&[("FAKE_AGENT_IGNORE_EOF", "1")]).await;
	let (harness, orphan) = orphan_probe("deaf", deaf, options("orphan")).await;

	tokio::time::timeout(Duration::from_secs(8), harness.sidecar.shutdown())
		.await
		.expect("the escalation keeps the shutdown bounded");

	poll_until("the escalation to leave no orphan behind", || !is_alive(orphan)).await;
}

/// A start that fails still spent time as a live agent, and the real one has its
/// stdio MCP servers up by then. Reaping the sidecar reaches none of them, so the
/// group has to be swept on the way out.
#[cfg(unix)]
#[tokio::test]
async fn a_start_that_crashes_leaves_its_group_to_the_sweep() {
	let pid_file = probe_file("startup-crash");
	let host = sidecar().await;
	let error = start_on(
		host.clone(),
		options("startup_crash")
			.with_env("FAKE_AGENT_PID_FILE", pid_file.to_string_lossy())
			.with_env("FAKE_AGENT_ORPHAN_AT_STARTUP", "1"),
	)
	.await
	.err()
	.expect("handshake fails");
	assert!(matches!(error, TransportError::Crashed { .. }));

	let orphan = recorded_pid(&pid_file).expect("the fake recorded its grandchild");
	host.terminate().await;
	poll_until("the failed start to leave no orphan behind", || !is_alive(orphan)).await;

	let _ = std::fs::remove_file(&pid_file);
}

/// The last rung of the ladder waits on a child the signal before it may never
/// have reached — one that left the group, a platform where a group signal does
/// nothing at all — and that wait holds the child lock. `agent_shutdown` and
/// every restart go through it, so an unbounded one leaves the command
/// unresolved and the frontend deduplicating every later attempt into a promise
/// that can no longer settle.
#[cfg(unix)]
#[tokio::test]
async fn shutting_down_returns_even_when_no_group_signal_reaches_the_sidecar() {
	let escaped =
		sidecar_with(&[("FAKE_AGENT_IGNORE_EOF", "1"), ("FAKE_AGENT_ESCAPE_GROUP", "1")]).await;
	let harness = start_on(escaped, options("normal")).await.expect("session starts");
	let child = harness.sidecar.pid() as libc::pid_t;

	poll_until("the sidecar to leave the group the host put it in", || unsafe {
		libc::getpgid(child) != child
	})
	.await;

	tokio::time::timeout(LADDER_CEILING, harness.sidecar.shutdown())
		.await
		.expect("the shutdown never gave the child lock back");
}

/// A child that dies on its own is reaped where it is read, and the pid it held
/// goes back to the system the moment it is. Anything still tracking that pid —
/// the exit sweep, the quit path, a restart — would be aiming a `SIGKILL` at
/// whoever holds it by then, so the group has to be spent and dropped in the
/// same breath as the reaping.
#[cfg(unix)]
#[tokio::test]
async fn a_sidecar_that_exits_on_its_own_spends_its_group_and_stops_tracking_it() {
	let pid_file = probe_file("natural-exit");
	let mut harness = start(
		options("sidecar_exit")
			.with_env("FAKE_AGENT_PID_FILE", pid_file.to_string_lossy())
			.with_env("FAKE_AGENT_ORPHAN_AT_STARTUP", "1"),
	)
	.await
	.expect("session starts");
	let pid = harness.sidecar.pid();

	poll_until("the fake to record its grandchild", || recorded_pid(&pid_file).is_some()).await;
	let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
	let _ = std::fs::remove_file(&pid_file);

	harness.submit("meurs").await.expect("prompt accepted");
	harness.drain_turn().await;

	poll_until("the reaped pid to leave the list a later sweep signals", || {
		!sidecar::live_groups().contains(&pid)
	})
	.await;
	poll_until("the reaping to take the grandchild with it", || !is_alive(orphan)).await;

	tokio::time::timeout(DEADLINE, harness.sidecar.terminate())
		.await
		.expect("the quit path never returned");
	assert!(
		!sidecar::live_groups().contains(&pid),
		"the quit path put a reaped pid back on the list"
	);
}

#[cfg(unix)]
#[tokio::test]
async fn terminating_takes_the_whole_process_group_down() {
	let (harness, orphan) = orphan_probe("terminate", sidecar().await, options("orphan")).await;

	harness.sidecar.terminate().await;

	poll_until("the exit path to leave no orphan behind", || !is_alive(orphan)).await;
}

#[cfg(unix)]
fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}
