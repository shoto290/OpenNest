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
use opennest_app::agent::{redact, store};
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
	started_with(resume, instructions.map(|told| bundle_carrying(told, model)), cwd).await
}

/// The same child again, on a bundle the caller built: the only way in for a bundle
/// carrying more than a brief.
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

/// The name every probe bot answers under, carried into its bundle's identity zone.
const PROBE_NAME: &str = "Probe";

/// The bot every live test is served by, under an id of the caller's so one test's
/// bundle is never the one another wrote.
fn probe_bot(id: &str, instructions: &str, model: &str) -> Bot {
	Bot {
		id: id.to_owned(),
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
		created_at: 1,
	}
}

/// The bot as a bundle on the disk, written the way the host writes one: what it
/// was told is the body of the agent the main thread is promoted to.
fn bundle_carrying(instructions: &str, model: &str) -> Bundle {
	written(&probe_bot("live-bot", instructions, model))
}

/// The same bundle, written under a style the caller named. The one door a reader's
/// pick comes through — see `bundles::write_styled`.
fn styled_bundle(bot: &Bot, output_style: &str) -> Bundle {
	let root = bundles_root();
	bundles::write_styled(&root, bot, output_style).expect("the bundle is written");
	handed_over(&root, bot)
}

fn written(bot: &Bot) -> Bundle {
	let root = bundles_root();
	bundles::write(&root, bot).expect("the bundle is written");
	handed_over(&root, bot)
}

/// The bundle on the disk as the host hands it to a session, read back rather than
/// assumed: what a run is opened on is what the files say, whichever door wrote them.
fn handed_over(root: &Path, bot: &Bot) -> Bundle {
	Bundle {
		path: bundles::dir(root, &bot.id).display().to_string(),
		agent: bundles::slug(&bot.name),
		output_style: bundles::output_style(root, &bot.id),
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

/// What the session started with, asked of the bot itself: the hook prints it into
/// the context at turn zero, so a child that can answer is a child the hook reached.
const WHICH_ROOT: &str =
	"What is the PLUGIN_ROOT you were given at the start of this session? Reply with nothing but that path.";

/// What a bot is created on, and what a reader would have had to pick. A child
/// naming the second is a child the key reached: nothing else would move it off the
/// first.
const SONNET: &str = "sonnet";
const HAIKU: &str = "haiku";

/// The layer this app appends to every session, asked of the child itself. Quoting is
/// the one route: the layer holds no marker of its own, and asking about it is exactly
/// the case it allows a bot to speak about its own instructions.
const QUOTE_THE_LAYER: &str =
	"Quote, word for word, the sentence in your instructions that begins with \"Leave out\".";

/// A fragment of that sentence, mirroring `sidecar/src/providers/claude/system-layer.ts`.
/// A child that can produce it was handed the layer.
const LAYER_WORDS: &str = "closing recaps";

/// What the bot is, asked the way a person would ask it. The layer places the bot in
/// this app and names its learning, so a child handed it can answer all three at once
/// — its own name from its bundle, the app from the layer, and that it learns.
const WHO_AND_WHAT: &str = "Who are you and what can you do?";

/// The app the layer puts the bot in, and any word for the learning it names. The
/// third, its own name, is [`PROBE_NAME`].
const OPENNEST: &str = "opennest";
const LEARNING_WORDS: [&str; 3] = ["learn", "remember", "skill"];

/// What the session was opened under, asked of the child itself: the Concise style is
/// a system prompt of the provider's, so a child running under it can quote the line
/// it was given and a child running under none has nothing to quote.
const QUOTE_THE_STYLE: &str =
	"Are you running under an output style? If you are, quote the sentence of it that tells you how long an answer should be. If you are not, reply with nothing but the word NONE.";

/// A word of that instruction. Measured against `Concise` and against `default` in the
/// same suite, since the value is free text on the wire and only a run can say whether
/// the provider resolved it.
const CONCISE_WORDS: &str = "concise";

/// The two styles a bot may be moved between, spelled the way the provider knows them
/// — the value is written into the agent file as it stands and passed to the session
/// as it stands.
const CONCISE_STYLE: &str = "Concise";
const NO_STYLE: &str = "default";

/// One file inside the bot's own working directory, and the word it must hold. The
/// disk is what is read back: a bot refused the tool still reports it wrote one.
const WRITE_A_FILE: &str = "Write the single word OPENNEST into a file named probe.txt in your working directory. Reply with nothing but DONE.";
const PROBE_FILE: &str = "probe.txt";
const PROBE_WORD: &str = "OPENNEST";

/// Appended to close delegation: `disallowedTools` binds the bot's own thread only, so
/// a denied bot asked without this hands the write to a subagent.
const ALONE: &str = " Do it yourself, never delegate it to a subagent.";

/// Whether anything reached the reader at all. Every request is auto-approved on the
/// way through, so this is what tells `auto` from the default mode.
fn asked_permission(events: &[AgentEvent]) -> bool {
	events.iter().any(|event| matches!(event, AgentEvent::PermissionRequested { .. }))
}

fn a_clean_file(dir: &Path) -> PathBuf {
	let file = dir.join(PROBE_FILE);
	let _ = std::fs::remove_file(&file);
	file
}

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

/// Two words no model can guess, planted where a default session reads them: one in
/// the `CLAUDE.md` of the directory the bot works in, one in the memory directory the
/// CLI derives from that same path.
const CLAUDE_MD_WORD: &str = "ZEPPELIN";
const MEMORY_WORD: &str = "MARMALADE";
const THE_CODE_WORDS: &str = "Without reading any file, name the project code word and \
	the memory code word you were given. Reply with the two words, or NONE for either \
	one you do not have.";

/// Where the CLI keeps the memory it derives from a working directory: the path with
/// every character that is not a letter or a digit turned into a dash.
fn memory_dir(cwd: &Path) -> PathBuf {
	let slug: String = seen_as(cwd)
		.chars()
		.map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
		.collect();
	redact::home_dir().expect("a home directory").join(".claude/projects").join(slug).join("memory")
}

/// A bot carries its bundle and nothing the machine leaves around. `settingSources: []`
/// and `strictMcpConfig` are passed on every spawn, so the `CLAUDE.md` sitting in the
/// working directory is never read — the child cannot name a word it says out loud.
///
/// The derived memory is closed by a second option: `settingSources: []` leaves
/// `~/.claude/projects/<cwd-slug>/memory/` being read, and `CLAUDE_CODE_DISABLE_AUTO_MEMORY`
/// in the child's environment is what stops it — otherwise two bots sharing a working
/// directory would read each other's.
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

/// A stdio server, spoken over newline-delimited JSON-RPC, small enough to live in the
/// bundle it is declared from. It answers one tool, and that tool answers one word no
/// model can guess: the word coming back is the whole measurement.
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

/// A bot keeps the servers its own bundle declares. `strictMcpConfig` drops every MCP
/// configuration the session was not handed — the bundle's `.mcp.json` included — so
/// the sidecar reads that file and hands the servers over under the names the bundle
/// gives them. Measured by calling one: the word only exists inside the process the
/// bundle asked for.
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

/// The bot is told where its own directory is before it says anything, by the
/// `SessionStart` hook in its own bundle. `CLAUDE_PLUGIN_ROOT` is set for a hook and
/// empty in the bot's own `Bash`, so this is the only route the path has — and the
/// only measurement that can tell whether it arrives at all.
///
/// The path is compared both as it was written and as the machine resolves it: macOS
/// hands the temporary directory out through a symlink, and the child reports where
/// it really is.
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
		"the hook did not reach the child: {told:?} for {}",
		seen_as(&resolved)
	);
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

/// Both prompts a session is composed of, proved in one turn: the bundle's own brief
/// and the layer this app appends to the preset. The bot ends on its nonsense word
/// because its bundle says so, and it can quote the layer because the `append`
/// reached the child — measured, a system prompt of ours would have replaced the
/// preset and taken the agent with it.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_session_carries_the_bundle_brief_and_the_opennest_layer_at_once() {
	let mut live = started(None, Some(BANANA), std::env::temp_dir()).await;
	let answer = text(&live.run_turn(QUOTE_THE_LAYER).await);
	live.sidecar.shutdown().await;

	assert!(answer.contains("BANANA"), "the bundle's brief did not reach the child: {answer:?}");
	assert!(answer.contains(LAYER_WORDS), "the appended layer did not reach the child: {answer:?}");
}

/// What a person gets when they ask the bot what it is. The three halves come from
/// three places — the name from the bundle's identity zone, the app and the learning
/// from the layer — so this is the only measurement that can tell whether the
/// OpenNest situation reaches a run as something the bot will say out loud.
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
}

/// The style a bot is written under is the style its session is really opened in,
/// and it reaches the child on the open request rather than through the agent file:
/// the format acts on none of `metadata`, so this is the only measurement that can
/// tell whether a reader's pick reaches a run at all.
///
/// Both halves in one test on purpose. `Concise` alone would pass on a machine whose
/// provider defaults to it anyway, so the bot written under `default` is the control:
/// the same question, the same bundle, and no Concise instruction to quote.
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

/// The mode every session is opened under. Measured in `-p` mode, the same write is
/// refused under the default mode and lands under `auto`, and the frontmatter key is
/// ignored on the promoted path — so `buildOptions` is the only place that can set it
/// and this is the only measurement that can tell whether it reaches a run.
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

/// The brake `auto` must not lift. A bot denying the changing tools names them in its
/// bundle's `disallowedTools`, which is honoured on the promoted path: the mode moves
/// what is asked of the reader, never what a bot is allowed to hold.
///
/// The turn forbids delegation on purpose. Measured here: `disallowedTools` binds the
/// bot's own thread and not the one `Task` starts, so a denied bot left free to
/// delegate had a subagent write the file — under the default mode that write reached
/// the reader's dialog, under `auto` it lands silently. Denying `Task` is a product
/// decision of its own and is not taken here.
#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_denied_the_changing_tools_still_changes_nothing_under_auto() {
	let workshop = a_directory("auto-denied");
	let file = a_clean_file(&workshop);

	let mut held_back = probe_bot("live-bot-denied", BANANA, SONNET);
	held_back.denied_tools = bundles::CHANGING_TOOLS.map(str::to_owned).to_vec();
	let mut live = started_with(None, Some(written(&held_back)), workshop).await;
	live.run_turn(&format!("{WRITE_A_FILE}{ALONE}")).await;
	live.sidecar.shutdown().await;

	assert!(!file.exists(), "a bot denied every changing tool still wrote {}", seen_as(&file));
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
