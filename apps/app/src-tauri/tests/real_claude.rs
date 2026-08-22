//! End-to-end proof against the agent sidecar this build ships.
//!
//! Ignored by default: these tests need a signed-in subscription and the network.
//! Run them with `cargo test --test real_claude -- --ignored --test-threads=1`.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use opennest_app::agent::commands::check;
use opennest_app::agent::contract::{
	ActivityKind, AgentEvent, ConnectionState, PermissionDecision, SessionSnapshot, TurnOutcome,
};
use opennest_app::agent::session::{Bundle, EventSink, Session, SessionOptions};
use opennest_app::agent::sidecar::{self, Sidecar, SidecarOptions};
use opennest_app::agent::store;
use opennest_app::bundles;
use opennest_app::db::repositories::conversations::{AvatarAnimal, Bot};
use tokio::sync::mpsc;

const TURN_TIMEOUT: Duration = Duration::from_secs(180);

struct Live {
	session: Session,
	sidecar: Arc<Sidecar>,
	events: mpsc::UnboundedReceiver<AgentEvent>,
}

async fn live(resume: Option<String>) -> Live {
	started(resume, None, std::env::temp_dir()).await
}

/// One child, started the way the host starts one for a bot: resuming what it was
/// given, promoted to the agent in the bot's own plugin bundle, in the directory the
/// bot names. The bundle is written on the model every bot is created on.
async fn started(resume: Option<String>, instructions: Option<&str>, cwd: PathBuf) -> Live {
	started_on(resume, instructions, SONNET, cwd).await
}

/// The same child, on a named model. The model reaches it as a key of the agent file
/// it is promoted to and by no other route — no option is passed beside it, and one
/// would override the key.
async fn started_on(
	resume: Option<String>,
	instructions: Option<&str>,
	model: &str,
	cwd: PathBuf,
) -> Live {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let sidecar = Sidecar::start(SidecarOptions::new(
		sidecar::resolve().expect("the agent sidecar ships with the host"),
	))
	.await
	.expect("the sidecar announces itself");
	let options = SessionOptions::new(cwd)
		.resuming(resume)
		.bundled(instructions.map(|told| bundle_carrying(told, model)));
	let session = Session::start(sidecar.clone(), options, sink).await.expect("session starts");
	Live { session, sidecar, events }
}

/// The bot as a bundle on the disk, written the way the host writes one: what it
/// was told is the body of the agent the main thread is promoted to.
fn bundle_carrying(instructions: &str, model: &str) -> Bundle {
	let root = std::env::temp_dir().join("opennest-real-claude-bundles");
	let bot = Bot {
		id: "live-bot".to_owned(),
		name: "Probe".to_owned(),
		title: String::new(),
		model: model.to_owned(),
		avatar_animal: AvatarAnimal::Owl,
		avatar_blot: None,
		avatar_image_path: None,
		working_dir: None,
		instructions: instructions.to_owned(),
		memory: String::new(),
		denied_tools: Vec::new(),
		created_at: 1,
	};
	bundles::write(&root, &bot).expect("the bundle is written");
	Bundle {
		path: bundles::dir(&root, &bot.id).display().to_string(),
		agent: bundles::slug(&bot.name),
	}
}

impl Live {
	/// Drains one turn, auto-approving every permission so the run stays
	/// unattended.
	async fn run_turn(&mut self, prompt: &str) -> Vec<AgentEvent> {
		self.session.submit_prompt(prompt).await.expect("prompt accepted");
		self.collect().await
	}

	async fn collect(&mut self) -> Vec<AgentEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + TURN_TIMEOUT;
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => {
					if let AgentEvent::PermissionRequested { request } = &event {
						self.session
							.respond_to_permission(&request.id, PermissionDecision::AllowOnce)
							.await
							.expect("approval accepted");
					}
					let ended = matches!(event, AgentEvent::TurnEnded { .. });
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

fn text(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageCompleted { message } => Some(message.text.clone()),
			_ => None,
		})
		.collect::<Vec<_>>()
		.join(" ")
}

fn streamed(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn session_id(events: &[AgentEvent]) -> Option<String> {
	events.iter().find_map(|event| match event {
		AgentEvent::SessionReady { session_id, .. } => Some(session_id.clone()),
		_ => None,
	})
}

/// The two instructions below are nonsense on purpose: a bot obeying them is
/// obeying its own system prompt rather than answering the way any model would.
const BANANA: &str = "Whatever you are asked, end every reply with the word BANANA.";
const ORANGE: &str = "Whatever you are asked, end every reply with the word ORANGE.";
const WHERE_AND_WHO: &str = "Run the bash command `pwd` and reply with nothing but its output.";

/// What model the child is answering under, asked of the child itself: the CLI names
/// it in the system prompt of every session it starts, so the answer is what the
/// process really runs on rather than what anything on this side believes.
const WHICH_MODEL: &str =
	"Which Claude model are you running as? Reply with one word: opus, sonnet or haiku.";

/// What a bot is created on, and what a reader would have had to pick. A child
/// naming the second is a child the key reached: nothing else would move it off the
/// first.
const SONNET: &str = "sonnet";
const HAIKU: &str = "haiku";

/// A directory of this suite's own. macOS hands the temporary one out through a
/// symlink and resolves it on the way in, so it is resolved here too — the child
/// reports where it really is.
fn a_directory(name: &str) -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-real-{name}"));
	std::fs::create_dir_all(&dir).expect("the directory is created");
	dir.canonicalize().expect("the directory resolves")
}

fn seen_as(dir: &Path) -> String {
	dir.display().to_string()
}

/// The runtime identity against the real CLI: a bot's instructions are the system
/// prompt of the process answering for it, and the directory it names is where that
/// process runs. Rotating it is a second process — started as the bot reads by
/// then, obeying that and no longer what the first one was given.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_rotation_starts_a_second_process_under_the_identity_the_bot_holds_now() {
	let workshop = a_directory("workshop");
	let mut first = started(None, Some(BANANA), workshop.clone()).await;
	let opening = first.run_turn(WHERE_AND_WHO).await;
	let retired = first.sidecar.pid();

	assert!(
		text(&opening).contains("BANANA"),
		"the instructions were not obeyed: {:?}",
		text(&opening)
	);
	assert!(
		text(&opening).contains(&seen_as(&workshop)),
		"the child did not run where the bot works: {:?}",
		text(&opening)
	);
	first.sidecar.shutdown().await;

	// The bot was described again. Neither of the two can be said to a child that is
	// already running, so the run is replaced by one started as the bot reads now.
	let studio = a_directory("studio");
	let mut second = started(None, Some(ORANGE), studio.clone()).await;
	let after = second.run_turn(WHERE_AND_WHO).await;

	assert_ne!(second.sidecar.pid(), retired, "the new identity landed in the same process");
	assert!(
		text(&after).contains("ORANGE"),
		"the new instructions were not obeyed: {:?}",
		text(&after)
	);
	assert!(
		!text(&after).contains("BANANA"),
		"the retired instructions outlived the process they were given to: {:?}",
		text(&after)
	);
	assert!(
		text(&after).contains(&seen_as(&studio)),
		"the child did not follow the bot to its new directory: {:?}",
		text(&after)
	);

	second.sidecar.shutdown().await;
	let _ = std::fs::remove_dir_all(&workshop);
	let _ = std::fs::remove_dir_all(&studio);
}

/// The model a reader picks is the model the bot runs on. It travels as the `model`
/// key of the agent file in the bot's bundle and by no other route — `buildOptions`
/// passes none, and one passed there would override the key — so this is the only
/// measurement that can tell whether the picker reaches the runtime at all.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_under_the_model_its_bundle_names() {
	let mut picked = started_on(None, Some(BANANA), HAIKU, std::env::temp_dir()).await;
	let named = text(&picked.run_turn(WHICH_MODEL).await).to_lowercase();
	picked.sidecar.shutdown().await;

	assert!(named.contains(HAIKU), "the picked model did not reach the child: {named:?}");
	assert!(!named.contains(SONNET), "the child answered under the default tier: {named:?}");
}

/// The check report is what the frontend receives first, and it is built from a
/// sign-in probe that also carries an email, an org id and a subscription type.
///
/// It is asked of the sidecar that ships with this build, which is the whole point:
/// nothing on the machine's `PATH` takes part in the answer.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn the_check_report_carries_no_identity() {
	let state = opennest_app::agent::AgentState::default();
	let report = check(&state).await;
	assert_eq!(report.connection, ConnectionState::Ready, "expected a signed-in install");
	assert!(report.authenticated, "expected a signed-in install");
	assert!(report.binary_version.is_some(), "the sidecar announced no version");

	let serialized = serde_json::to_string(&report).expect("report serializes");
	assert!(!serialized.contains('@'), "an email reached the contract: {serialized}");
	for forbidden in ["orgId", "orgName", "subscriptionType", "apiProvider", "authMethod"] {
		assert!(!serialized.contains(forbidden), "{forbidden} reached the contract: {serialized}");
	}
}

/// Two turns across two processes: the second one resumes the first by id and
/// still knows the number, and a real tool call shows up as activity.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn two_turns_stream_and_the_second_resumes_the_first() {
	let mut first = live(None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;

	assert!(!streamed(&opening).is_empty(), "partial text must reach the contract");
	assert!(text(&opening).contains("OK"), "got {:?}", text(&opening));
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.sidecar.shutdown().await;

	let mut second = live(Some(id.clone())).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "resumed turn lost the context: {:?}", text(&recall));

	let tooling =
		second.run_turn("Run the bash command `echo OPENNEST_PROBE` and report its output.").await;
	let tools: Vec<_> = tooling
		.iter()
		.filter_map(|event| match event {
			AgentEvent::Activity { activity } if activity.kind == ActivityKind::Tool => {
				Some(activity)
			}
			_ => None,
		})
		.collect();
	assert!(!tools.is_empty(), "a real tool call must surface as activity");
	assert!(text(&tooling).contains("OPENNEST_PROBE"), "got {:?}", text(&tooling));

	second.sidecar.shutdown().await;
}

/// Stop interrupts a live turn, the session stays usable, and shutdown leaves
/// nothing behind.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn stop_interrupts_a_live_turn_and_leaves_no_orphan() {
	let mut live = live(None).await;
	let pid = live.sidecar.pid();

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
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	});
	assert_eq!(outcome, Some(TurnOutcome::Cancelled));

	let after = live.run_turn("Reply with exactly: STILL_ALIVE").await;
	assert!(
		text(&after).contains("STILL_ALIVE"),
		"session unusable after stop: {:?}",
		text(&after)
	);

	live.sidecar.shutdown().await;
	tokio::time::sleep(Duration::from_secs(1)).await;
	assert!(!group_alive(pid), "shutdown left agent processes behind");
}

/// The restart path, minus the app: an id minted by a real child goes through
/// the store on disk and still resumes the conversation on the way back.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn an_id_stored_on_disk_resumes_the_conversation() {
	let mut first = live(None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.sidecar.shutdown().await;

	let path = std::env::temp_dir().join(format!("opennest-live-{id}.json"));
	store::save(&path, &SessionSnapshot { session_id: Some(id), ..SessionSnapshot::default() });
	let restored = store::load(&path).session_id.expect("the stored id survives the round trip");

	let mut second = live(Some(restored)).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "the stored id did not resume: {:?}", text(&recall));

	second.sidecar.shutdown().await;
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
