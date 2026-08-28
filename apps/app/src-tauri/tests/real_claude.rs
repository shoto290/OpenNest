use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use opennest_app::agent::commands::check;
use opennest_app::agent::contract::{
	ActivityKind, AgentEvent, ConnectionState, PermissionDecision, TurnOutcome,
};
use opennest_app::agent::session::{Bundle, EventSink, Session, SessionOptions};
use opennest_app::agent::sidecar::{self, Sidecar, SidecarOptions};
use opennest_app::agent::redact;
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

async fn started(resume: Option<String>, instructions: Option<&str>, cwd: PathBuf) -> Live {
	started_on(resume, instructions, SONNET, cwd).await
}

async fn started_on(
	resume: Option<String>,
	instructions: Option<&str>,
	model: &str,
	cwd: PathBuf,
) -> Live {
	started_with(resume, instructions.map(|told| bundle_carrying(told, model)), cwd).await
}

async fn started_with(resume: Option<String>, bundle: Option<Bundle>, cwd: PathBuf) -> Live {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let sidecar = Sidecar::start(SidecarOptions::new(
		sidecar::resolve().expect("the agent sidecar ships with the host"),
	))
	.await
	.expect("the sidecar announces itself");
	let options = SessionOptions::new(cwd).resuming(resume).bundled(bundle);
	let session = Session::start(sidecar.clone(), options, sink).await.expect("session starts");
	Live { session, sidecar, events }
}

fn bundles_root() -> PathBuf {
	std::env::temp_dir().join("opennest-real-claude-bundles")
}

const PROBE_NAME: &str = "Probe";

fn probe_bot(id: &str, instructions: &str, model: &str) -> Bot {
	Bot {
		id: id.to_owned(),
		space_id: "personal".to_owned(),
		section_id: None,
		name: PROBE_NAME.to_owned(),
		title: String::new(),
		model: model.to_owned(),
		avatar_animal: AvatarAnimal::Owl,
		avatar_blot: None,
		avatar_image_path: None,
		working_dir: None,
		instructions: instructions.to_owned(),
		memory: String::new(),
		denied_tools: Vec::new(),
		permissions: None,
		created_at: 1,
	}
}

fn bundle_carrying(instructions: &str, model: &str) -> Bundle {
	written(&probe_bot("live-bot", instructions, model))
}

fn styled_bundle(bot: &Bot, output_style: &str) -> Bundle {
	let root = bundles_root();
	bundles::write_styled(&root, bot, output_style).expect("the bundle is written");
	handed_over(&root, bot)
}

fn changing_rules() -> String {
	bundles::CHANGING_TOOLS.map(|tool| format!("\"{tool}\"")).join(",")
}

fn under_default(rules: &str) -> String {
	format!(r#"{{"permissions":{{"defaultMode":"default","allow":[{rules}]}}}}"#)
}

fn denying(rules: &str) -> String {
	format!(r#"{{"permissions":{{"deny":[{rules}]}}}}"#)
}

fn ruled(bot: &Bot, settings: &str) -> Bundle {
	let root = bundles_root();
	bundles::write(&root, bot).expect("the bundle is written");
	std::fs::write(bundles::dir(&root, &bot.id).join("settings.json"), settings)
		.expect("the settings file is written");
	handed_over(&root, bot)
}

fn written(bot: &Bot) -> Bundle {
	let root = bundles_root();
	bundles::write(&root, bot).expect("the bundle is written");
	handed_over(&root, bot)
}

fn handed_over(root: &Path, bot: &Bot) -> Bundle {
	Bundle {
		path: bundles::dir(root, &bot.id).display().to_string(),
		system_path: Some(system_plugin().display().to_string()),
		user_path: Some(user_plugin().display().to_string()),
		space_path: Some(space_plugin().display().to_string()),
		agent: bundles::slug(&bot.name),
		identity: bundles::identity(bot),
		output_style: bundles::output_style(root, &bot.id),
		settings_path: bundles::settings_file(root, &bot.id).map(|path| path.display().to_string()),
	}
}

fn system_plugin() -> PathBuf {
	let path = std::env::temp_dir().join("opennest-real-claude-system");
	bundles::system::write(&path).expect("the app's plugin is written");
	path
}

fn user_plugin() -> PathBuf {
	let path = std::env::temp_dir().join("opennest-real-claude-user");
	bundles::user::lay_down(&path).expect("the person's plugin is laid down");
	path
}

fn space_plugin() -> PathBuf {
	let path = std::env::temp_dir().join("opennest-real-claude-space");
	bundles::space::lay_down_at(&path).expect("the space's plugin is laid down");
	path
}

impl Live {
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

const BANANA: &str = "Whatever you are asked, end every reply with the word BANANA.";
const ORANGE: &str = "Whatever you are asked, end every reply with the word ORANGE.";
const WHERE_AND_WHO: &str = "Run the bash command `pwd` and reply with nothing but its output.";

const WHICH_MODEL: &str =
	"Which Claude model are you running as? Reply with one word: opus, sonnet or haiku.";

const WHICH_ROOT: &str =
	"What is the full path of the directory your own skills live in? Reply with nothing but that path.";

const SONNET: &str = "sonnet";
const HAIKU: &str = "haiku";

const QUOTE_THE_LAYER: &str =
	"Quote, word for word, the sentence in your instructions that begins with \"Leave out\".";

const LAYER_WORDS: &str = "closing recaps";

const AFTER_A_WRITE: &str = "After you write one of your own skills, which file do you overwrite afterwards, and how many characters may its title line be? Reply with the file name and the number.";

const LEARNED_FILE: &str = ".learned.md";
const TITLE_LIMIT: &str = "72";

const WHO_AND_WHAT: &str = "Who are you and what can you do?";

const OPENNEST: &str = "opennest";
const LEARNING_WORDS: [&str; 3] = ["learn", "remember", "skill"];

const CLAUDE_CODE: &str = "claude code";

const QUOTE_THE_STYLE: &str =
	"Are you running under an output style? If you are, quote the sentence of it that tells you how long an answer should be. If you are not, reply with nothing but the word NONE.";

const CONCISE_WORDS: &str = "concise";

const CONCISE_STYLE: &str = "Concise";
const NO_STYLE: &str = "default";

const WRITE_A_FILE: &str = "Write the single word OPENNEST into a file named probe.txt in your working directory. Reply with nothing but DONE.";
const PROBE_FILE: &str = "probe.txt";
const PROBE_WORD: &str = "OPENNEST";

fn asked_permission(events: &[AgentEvent]) -> bool {
	events.iter().any(|event| matches!(event, AgentEvent::PermissionRequested { .. }))
}

fn asked_for(events: &[AgentEvent]) -> Vec<String> {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::PermissionRequested { request } => Some(request.tool_name.clone()),
			_ => None,
		})
		.collect()
}

fn tools_used(events: &[AgentEvent]) -> Vec<String> {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::Activity { activity } if activity.kind == ActivityKind::Tool => {
				Some(activity.title.clone())
			}
			_ => None,
		})
		.collect()
}

fn a_clean_file(dir: &Path) -> PathBuf {
	let file = dir.join(PROBE_FILE);
	let _ = std::fs::remove_file(&file);
	file
}

fn a_directory(name: &str) -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-real-{name}"));
	std::fs::create_dir_all(&dir).expect("the directory is created");
	dir.canonicalize().expect("the directory resolves")
}

fn seen_as(dir: &Path) -> String {
	dir.display().to_string()
}

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

const CLAUDE_MD_WORD: &str = "ZEPPELIN";
const MEMORY_WORD: &str = "MARMALADE";
const THE_CODE_WORDS: &str = "Without reading any file, name the project code word and \
	the memory code word you were given. Reply with the two words, or NONE for either \
	one you do not have.";

fn memory_dir(cwd: &Path) -> PathBuf {
	let slug: String = seen_as(cwd)
		.chars()
		.map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
		.collect();
	redact::home_dir().expect("a home directory").join(".claude/projects").join(slug).join("memory")
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_reads_neither_the_claude_md_of_its_directory_nor_the_memory_derived_from_it() {
	let sealed = a_directory("sealed");
	std::fs::write(sealed.join("CLAUDE.md"), format!("The project code word is {CLAUDE_MD_WORD}."))
		.expect("the working directory carries a CLAUDE.md");
	let memory = memory_dir(&sealed);
	std::fs::create_dir_all(&memory).expect("the memory directory is created");
	std::fs::write(memory.join("MEMORY.md"), format!("The memory code word is {MEMORY_WORD}."))
		.expect("the memory carries a word");

	let mut bot = started(None, Some(BANANA), sealed.clone()).await;
	let answer = text(&bot.run_turn(THE_CODE_WORDS).await);
	bot.sidecar.shutdown().await;

	let _ = std::fs::remove_dir_all(&sealed);
	let _ = std::fs::remove_dir_all(&memory);

	assert!(
		answer.contains("BANANA"),
		"the bundle's own brief did not survive isolation: {answer:?}"
	);
	assert!(
		!answer.contains(CLAUDE_MD_WORD),
		"the working directory's CLAUDE.md reached the child: {answer:?}"
	);
	assert!(!answer.contains(MEMORY_WORD), "the derived memory reached the child: {answer:?}");
}

const PROBE_SERVER: &str = r#"import json, sys

TOOLS = [{
    "name": "code_word",
    "description": "Returns the probe code word.",
    "inputSchema": {"type": "object", "properties": {}},
}]

for line in sys.stdin:
    if not line.strip():
        continue
    message = json.loads(line)
    if "id" not in message:
        continue
    method = message.get("method")
    answer = {"jsonrpc": "2.0", "id": message["id"]}
    if method == "initialize":
        answer["result"] = {
            "protocolVersion": message.get("params", {}).get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "probe", "version": "0.1.0"},
        }
    elif method == "tools/list":
        answer["result"] = {"tools": TOOLS}
    elif method == "tools/call":
        answer["result"] = {"content": [{"type": "text", "text": "PORTCULLIS"}]}
    elif method == "ping":
        answer["result"] = {}
    else:
        answer["error"] = {"code": -32601, "message": "no such method"}
    sys.stdout.write(json.dumps(answer) + "\n")
    sys.stdout.flush()
"#;

const MCP_WORD: &str = "PORTCULLIS";
const CALL_THE_SERVER: &str =
	"Call the code_word tool of the probe MCP server and reply with exactly what it returns.";

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_reaches_the_mcp_servers_its_bundle_declares() {
	let bot = probe_bot("live-bot-mcp", BANANA, SONNET);
	let bundle = written(&bot);
	let script = PathBuf::from(&bundle.path).join("probe_server.py");
	std::fs::write(&script, PROBE_SERVER).expect("the server ships inside the bundle");
	bundles::set_mcp_server(
		&bundles_root(),
		&bot,
		"probe",
		&serde_json::json!({ "command": "python3", "args": [script.display().to_string()] }),
	)
	.expect("the bundle declares its server");

	let mut served = started_with(None, Some(bundle), std::env::temp_dir()).await;
	let answer = text(&served.run_turn(CALL_THE_SERVER).await);
	served.sidecar.shutdown().await;

	assert!(
		answer.contains(MCP_WORD),
		"the server the bundle declares was out of reach: {answer:?}"
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_is_handed_its_own_directory_before_its_first_turn() {
	let mut live = started(None, Some(BANANA), std::env::temp_dir()).await;
	let told = text(&live.run_turn(WHICH_ROOT).await);
	live.sidecar.shutdown().await;

	let bundle = bundles::dir(&bundles_root(), "live-bot");
	let resolved = bundle.canonicalize().unwrap_or_else(|_| bundle.clone());
	assert!(
		told.contains(&seen_as(&bundle)) || told.contains(&seen_as(&resolved)),
		"the layer did not reach the child with a path: {told:?} for {}",
		seen_as(&resolved)
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_under_the_model_its_bundle_names() {
	let mut picked = started_on(None, Some(BANANA), HAIKU, std::env::temp_dir()).await;
	let named = text(&picked.run_turn(WHICH_MODEL).await).to_lowercase();
	picked.sidecar.shutdown().await;

	assert!(named.contains(HAIKU), "the picked model did not reach the child: {named:?}");
	assert!(!named.contains(SONNET), "the child answered under the default tier: {named:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_session_carries_the_bundle_brief_and_the_opennest_layer_at_once() {
	let mut live = started(None, Some(BANANA), std::env::temp_dir()).await;
	let answer = text(&live.run_turn(QUOTE_THE_LAYER).await);
	live.sidecar.shutdown().await;

	assert!(answer.contains("BANANA"), "the bundle's brief did not reach the child: {answer:?}");
	assert!(answer.contains(LAYER_WORDS), "the appended layer did not reach the child: {answer:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_the_app_plugins_learn_rules_without_invoking_the_skill() {
	let mut live = started(None, Some(BANANA), std::env::temp_dir()).await;
	let turn = live.run_turn(AFTER_A_WRITE).await;
	live.sidecar.shutdown().await;

	let answer = text(&turn);
	assert!(
		answer.contains(LEARNED_FILE),
		"the preloaded rules did not reach the child: {answer:?}"
	);
	assert!(answer.contains(TITLE_LIMIT), "the preloaded rules were not held whole: {answer:?}");
	let used = tools_used(&turn);
	assert!(used.is_empty(), "the bot went looking for rules it was already holding: {used:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_says_its_name_the_app_it_runs_in_and_that_it_learns() {
	let mut live = started(None, Some(BANANA), std::env::temp_dir()).await;
	let answer = text(&live.run_turn(WHO_AND_WHAT).await).to_lowercase();
	live.sidecar.shutdown().await;

	assert!(
		answer.contains(&PROBE_NAME.to_lowercase()),
		"the bot did not give its own name: {answer:?}"
	);
	assert!(answer.contains(OPENNEST), "the bot did not place itself in the app: {answer:?}");
	assert!(
		LEARNING_WORDS.iter().any(|word| answer.contains(word)),
		"the bot said nothing about learning: {answer:?}"
	);
	assert!(!answer.contains(CLAUDE_CODE), "the bot presented itself as Claude Code: {answer:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_in_the_style_its_bundle_carries() {
	let concise = probe_bot("live-bot-concise", BANANA, SONNET);
	let mut styled =
		started_with(None, Some(styled_bundle(&concise, CONCISE_STYLE)), std::env::temp_dir())
			.await;
	let under_concise = text(&styled.run_turn(QUOTE_THE_STYLE).await).to_lowercase();
	styled.sidecar.shutdown().await;

	let plain = probe_bot("live-bot-plain", BANANA, SONNET);
	let mut unstyled =
		started_with(None, Some(styled_bundle(&plain, NO_STYLE)), std::env::temp_dir()).await;
	let under_default = text(&unstyled.run_turn(QUOTE_THE_STYLE).await).to_lowercase();
	unstyled.sidecar.shutdown().await;

	assert!(
		under_concise.contains(CONCISE_WORDS),
		"the picked style did not reach the child: {under_concise:?}"
	);
	assert!(
		!under_default.contains(CONCISE_WORDS),
		"a bot under no style was still handed the concise one: {under_default:?}"
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_writes_inside_its_own_directory_without_asking_the_reader() {
	let workshop = a_directory("auto-write");
	let file = a_clean_file(&workshop);

	let mut live = started(None, Some(BANANA), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(!asked_permission(&events), "the write still reached the reader's dialog");
	let written = std::fs::read_to_string(&file).expect("the bot wrote the file it was asked for");
	assert!(written.contains(PROBE_WORD), "the file holds {written:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_denied_the_changing_tools_still_changes_nothing_under_auto() {
	let workshop = a_directory("auto-denied");
	let file = a_clean_file(&workshop);

	let mut held_back = probe_bot("live-bot-denied", BANANA, SONNET);
	held_back.denied_tools = bundles::CHANGING_TOOLS.map(str::to_owned).to_vec();
	let mut live = started_with(None, Some(written(&held_back)), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(!file.exists(), "a bot denied every changing tool still wrote {}", seen_as(&file));
	assert!(!asked_permission(&events), "a held-back bot reached the reader's dialog");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_allowed_the_write_by_its_settings_asks_the_reader_nothing() {
	let workshop = a_directory("settings-allowed");
	let file = a_clean_file(&workshop);

	let bot = probe_bot("live-bot-allowed", BANANA, SONNET);
	let allowed = ruled(&bot, &under_default(&changing_rules()));
	let mut live = started_with(None, Some(allowed), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(
		!asked_permission(&events),
		"an allowed write still reached the reader's dialog: {:?} tools {:?}",
		asked_for(&events),
		tools_used(&events)
	);
	let written = std::fs::read_to_string(&file).expect("the bot wrote the file it was asked for");
	assert!(written.contains(PROBE_WORD), "the file holds {written:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_denied_the_write_by_its_settings_writes_nothing_and_asks_nothing() {
	let workshop = a_directory("settings-denied");
	let file = a_clean_file(&workshop);

	let bot = probe_bot("live-bot-refused", BANANA, SONNET);
	let refused = ruled(&bot, &denying(&changing_rules()));
	let mut live = started_with(None, Some(refused), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(
		!file.exists(),
		"a bot denied the write still wrote {} with {:?}",
		seen_as(&file),
		tools_used(&events)
	);
	assert!(!asked_permission(&events), "a denied write reached the reader's dialog");
}

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

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_captured_id_resumes_the_conversation() {
	let mut first = live(None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.sidecar.shutdown().await;

	let mut second = live(Some(id)).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "the captured id did not resume: {:?}", text(&recall));

	second.sidecar.shutdown().await;
}

#[cfg(unix)]
fn group_alive(pid: u32) -> bool {
	unsafe { libc::killpg(pid as libc::pid_t, 0) == 0 }
}

#[cfg(not(unix))]
fn group_alive(_pid: u32) -> bool {
	false
}
