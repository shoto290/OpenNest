//! The runtime a bot is started as, driven through the commands the frontend
//! really calls: the real database, the real transport, and a fake child that
//! answers with the system prompt it was handed and the directory it was started
//! in.
//!
//! What it proves is that the identity travels from the record to the process and
//! nowhere else: a bot that was described again is a different process answering
//! differently, and the file is what both of them were read from.
//!
//! Deliberately a single test, for the reason `bounded_rotation.rs` is: the binary
//! override and the fake's scenario are process-global, and `cargo test` runs the
//! tests of one binary in parallel.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use opennest_app::agent::commands::EVENT_CHANNEL;
use opennest_app::agent::contract::{AgentEvent, RuntimeScope, ScopedEvent, TransportError};
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::AgentState;
use opennest_app::bundles;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const IDENTIFIER: &str = "com.opennest.runtime-identity";
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

const TURN: &str = "t1";
const NAME: &str = "Camille";
const FRENCH: &str = "Answer only in French.";
const DUTCH: &str = "Answer only in Dutch.";
const SPANISH: &str = "Answer only in Spanish.";

struct Harness {
	app: App<MockRuntime>,
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ScopedEvent>>>,
}

/// The host as it launches: `AgentState` for the runtime and the database opened
/// the way `lib.rs` opens it, from an identifier this suite has to itself.
fn launch() -> Harness {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = IDENTIFIER.into();

	let app = mock_builder()
		.manage(AgentState::default())
		.invoke_handler(invoke_handler())
		.build(context)
		.expect("app builds");
	// A run that stopped halfway must not decide what the next one finds: the file
	// is emptied before it is opened, never after.
	if let Ok(dir) = app.path().app_data_dir() {
		let _ = std::fs::remove_dir_all(&dir);
	}
	app.manage(db::bootstrap(app.handle()));
	let window =
		WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window builds");

	let log: Arc<Mutex<Vec<ScopedEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.lock().expect("event log").push(parsed);
		}
	});

	Harness { app, window, log }
}

impl Harness {
	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		tauri::test::get_ipc_response(
			&self.window,
			InvokeRequest {
				cmd: cmd.into(),
				callback: tauri::ipc::CallbackFn(0),
				error: tauri::ipc::CallbackFn(1),
				url: "tauri://localhost".parse().expect("url"),
				body: body.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		)
		.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
		.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
	}

	fn events(&self) -> Vec<AgentEvent> {
		self.log.lock().expect("event log").iter().map(|scoped| scoped.event.clone()).collect()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[AgentEvent]) -> Option<T>) -> T {
		let deadline = Instant::now() + DEADLINE;
		loop {
			let seen = self.events();
			if let Some(found) = ready(&seen) {
				return found;
			}
			assert!(
				Instant::now() < deadline,
				"waited {DEADLINE:?} for {expected} and only saw {seen:#?}"
			);
			std::thread::sleep(POLL);
		}
	}

	fn create_bot(&self) -> String {
		self.call("conversation_create_bot", json!({ "identity": an_identity(None, None) }))
			.expect("the bot is created")["id"]
			.as_str()
			.expect("the bot holds an id")
			.to_owned()
	}

	/// Who the bot is now, replaced whole — the write the settings panel makes on
	/// every edit.
	fn describe(&self, bot: &str, instructions: &str, working_dir: Option<&Path>) {
		self.call(
			"conversation_update_bot",
			json!({ "id": bot, "identity": an_identity(Some(instructions), working_dir) }),
		)
		.expect("the bot is described");
	}

	fn main_chat(&self, bot: &str) -> String {
		self.call("conversation_main_chat", json!({ "botId": bot })).expect("the chat")["id"]
			.as_str()
			.expect("the chat holds an id")
			.to_owned()
	}

	fn open_run(&self, conversation: &str, bot: &str, started_at: i64) -> RuntimeScope {
		let opened = self
			.call(
				"conversation_open_runtime_session",
				json!({
					"conversationId": conversation,
					"botId": bot,
					"startedAt": started_at,
					"reason": Value::Null
				}),
			)
			.expect("the run opens");
		RuntimeScope {
			conversation_id: opened["conversationId"].as_str().expect("a conversation").to_owned(),
			bot_id: opened["botId"].as_str().expect("a bot").to_owned(),
			runtime_session_id: opened["id"].as_str().expect("an id").to_owned(),
			epoch: opened["seq"].as_i64().expect("a seq"),
		}
	}

	/// Where a run starts when the bot names nowhere. Never `$HOME`: the child
	/// inherits it as its working directory.
	fn start(&self, scope: &RuntimeScope) {
		assert_eq!(
			self.call(
				"agent_start_or_resume_session",
				json!({ "scope": scope, "resume": Value::Null, "cwd": std::env::temp_dir() }),
			),
			Ok(json!({ "resumed": false })),
			"the run did not start"
		);
	}

	/// The child's own account of what it was started as, taken from the one turn it
	/// answers. The message id carries its pid, so a reply also says which process
	/// gave it.
	fn runtime_of(&self, conversation: &str, bot: &str, at: i64) -> Answer {
		self.forget_events();
		let scope = self.open_run(conversation, bot, at);
		self.start(&scope);
		self.call("agent_submit_prompt", json!({ "scope": scope, "text": "who are you?" }))
			.expect("the prompt is taken");
		self.wait_for("the child to say what it was started as", answered)
	}
}

/// One process's answer: what it was told to be, and which process said so.
#[derive(Debug)]
struct Answer {
	spoken: String,
	from: String,
}

fn answered(seen: &[AgentEvent]) -> Option<Answer> {
	seen.iter().find_map(|event| match event {
		AgentEvent::MessageCompleted { message } if !message.text.is_empty() => {
			Some(Answer { spoken: message.text.clone(), from: message.id.clone() })
		}
		_ => None,
	})
}

fn refused_directory(seen: &[AgentEvent]) -> Option<String> {
	seen.iter().find_map(|event| match event {
		AgentEvent::Failed { error: TransportError::WorkingDirectoryRefused { path } } => {
			Some(path.clone())
		}
		_ => None,
	})
}

/// A bot described whole, the way the settings panel submits it: every field of the
/// identity, with the two this suite is about spelled by the caller.
fn an_identity(instructions: Option<&str>, working_dir: Option<&Path>) -> Value {
	json!({
		"name": NAME,
		"title": "",
		"model": "sonnet",
		"avatarAnimal": "cat",
		"avatarBlot": Value::Null,
		"avatarImagePath": Value::Null,
		"workingDir": working_dir.map(|dir| dir.to_string_lossy().into_owned()),
		"instructions": instructions.unwrap_or_default(),
		"deniedTools": []
	})
}

/// Where the host keeps this bot's plugin bundle, resolved the way the host
/// resolves it rather than spelled again here.
fn bundle_of(harness: &Harness, bot: &str) -> PathBuf {
	let root = bundles::root(harness.app.handle()).expect("the bundle root");
	bundles::dir(&root, bot)
}

/// The bot as the frontend reads it back, which is the only place a caller can see
/// whether a refused write left anything behind.
fn stored_bot(harness: &Harness, bot: &str) -> Value {
	let listed = harness.call("conversation_bots", json!({})).expect("the roster");
	listed
		.as_array()
		.and_then(|bots| bots.iter().find(|listed| listed["id"] == bot).cloned())
		.expect("the bot is on the roster")
}

/// A brief rewritten the way a reader does it: the file's own frontmatter left where
/// it is — the marker that says whose file it is included — and the body replaced.
fn rewrite_the_brief(agent: &Path, brief: &str) {
	let text = std::fs::read_to_string(agent).expect("the agent file is there");
	let (front, _) = text.rsplit_once("---").expect("the closing fence");
	std::fs::write(agent, format!("{front}---\n\n{brief}\n")).expect("the hand edit lands");
}

/// Every bundle the marketplace lists, by name and by the source it points at.
fn listed_plugins(harness: &Harness) -> Vec<(String, String)> {
	let root = bundles::root(harness.app.handle()).expect("the bundle root");
	let text = std::fs::read_to_string(bundles::marketplace_file(&root)).unwrap_or_default();
	let listed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
	listed["plugins"]
		.as_array()
		.map(|plugins| {
			plugins
				.iter()
				.map(|plugin| {
					(
						plugin["name"].as_str().unwrap_or_default().to_owned(),
						plugin["source"].as_str().unwrap_or_default().to_owned(),
					)
				})
				.collect()
		})
		.unwrap_or_default()
}

/// A directory of this suite's own, created fresh and named the way a reader would
/// type it: what a bot names has to be there for the child to be started in it.
fn a_directory(name: &str) -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-runtime-identity-{name}"));
	let _ = std::fs::remove_dir_all(&dir);
	std::fs::create_dir_all(&dir).expect("the directory is created");
	dir
}

/// The path as the child sees it. macOS hands a symlinked temporary directory out
/// and resolves it on the way in, so what a bot stores and what a child reports are
/// only comparable resolved — which is why nothing above resolves anything.
fn as_the_child_sees_it(dir: &Path) -> String {
	dir.canonicalize().unwrap_or_else(|_| dir.to_owned()).display().to_string()
}

/// The body a bot is really started on: the brief the reader wrote and nothing the
/// host added to it. Asserted whole, so a host sentence laid down beside their words
/// fails here rather than reaching a reader's exported bundle.
fn briefed(brief: &str) -> String {
	format!("system<{brief}>")
}

/// Who the child was told it is, as the fake reports the open request. Spelled here
/// rather than imported: what a child is really handed is the contract, so the test
/// says the words instead of asking the module for them.
fn told() -> String {
	format!("told<You are {NAME}.")
}

/// The sidecar's own environment is fixed when it is spawned, and one process
/// serves every session — so a scenario that changes between two of them travels
/// on a file the fake reads each time it opens one.
fn scenario(name: &str) {
	let path =
		std::env::temp_dir().join(format!("opennest-fake-scenario-{}.txt", std::process::id()));
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, path);
}

/// Every runtime a bot is started as, in the order a reader produces them: a bot
/// carrying an identity, the same bot described again, one carrying nothing, and
/// one naming a directory the machine no longer has.
#[test]
fn every_run_carries_the_identity_the_bot_holds_when_it_starts() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	scenario("identity");

	let harness = launch();
	let workshop = a_directory("workshop");
	let studio = a_directory("studio");
	let bot = harness.create_bot();
	let conversation = harness.main_chat(&bot);
	harness
		.call(
			"conversation_start_turn",
			json!({ "turn": { "id": TURN, "conversationId": conversation, "startedAt": 1 } }),
		)
		.expect("the turn is started");

	// A bot carrying both: its instructions are the child's system prompt, and its
	// directory is where the child runs.
	harness.describe(&bot, FRENCH, Some(&workshop));
	let first = harness.runtime_of(&conversation, &bot, 1);
	assert!(first.spoken.contains(&briefed(FRENCH)), "got {}", first.spoken);
	// And who it is travels beside the brief rather than inside it: the host renders
	// the sentences over the bot's own name and sends them on the open request.
	assert!(
		first.spoken.contains(&told()),
		"the open request does not name the bot: {}",
		first.spoken
	);
	assert!(first.spoken.contains("You are not Claude Code"), "got {}", first.spoken);
	assert!(
		first.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&workshop))),
		"got {}",
		first.spoken
	);

	// Described again, and started again: the process that answers afterwards is a
	// different one, and what it was told is what the file says now.
	harness.describe(&bot, DUTCH, Some(&studio));
	let rotated = harness.runtime_of(&conversation, &bot, 2);
	assert!(rotated.spoken.contains(&briefed(DUTCH)), "got {}", rotated.spoken);
	assert!(
		rotated.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&studio))),
		"got {}",
		rotated.spoken
	);
	assert_ne!(rotated.from, first.from, "the new identity landed in the same process");

	// Nothing to say for itself and nowhere of its own: the body is empty, who it is
	// still reaches it on the open request, and the run starts in the directory a run
	// has always started in.
	harness.describe(&bot, "", None);
	let plain = harness.runtime_of(&conversation, &bot, 3);
	assert!(!plain.spoken.contains(DUTCH), "got {}", plain.spoken);
	assert!(plain.spoken.contains(&told()), "got {}", plain.spoken);
	assert!(
		plain.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&std::env::temp_dir()))),
		"got {}",
		plain.spoken
	);

	// The directory is gone since the bot was described. The reader is told which
	// one was refused, and still gets a process — started where one is started for a
	// bot that names none.
	let gone = a_directory("gone");
	std::fs::remove_dir_all(&gone).expect("the directory is taken away");
	harness.describe(&bot, FRENCH, Some(&gone));
	let elsewhere = harness.runtime_of(&conversation, &bot, 4);
	assert!(
		elsewhere.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&std::env::temp_dir()))),
		"got {}",
		elsewhere.spoken
	);
	assert!(elsewhere.spoken.contains(&briefed(FRENCH)), "got {}", elsewhere.spoken);
	let refused = harness.wait_for("the refused directory to be reported", refused_directory);
	assert!(refused.ends_with("opennest-runtime-identity-gone"), "got {refused}");

	// What the child was started on is a bundle on the disk, and describing the bot is
	// what wrote it: the brief is the body of the agent the main thread is promoted to,
	// not a prompt the host appends.
	harness.describe(&bot, DUTCH, None);
	let bundle = bundle_of(&harness, &bot);
	let agent = bundle.join("agents").join(format!("{}.md", bundles::slug(NAME)));
	let written = std::fs::read_to_string(&agent).expect("the agent file is there");
	assert!(written.contains(DUTCH), "got {written}");
	assert!(
		!written.contains("You are not Claude Code"),
		"the host's text is in the bundle: {written}"
	);
	assert!(!written.contains("skills:"), "got {written}");
	assert!(!written.contains("permissionMode"), "got {written}");

	// One marketplace over every bundle, so a reader adds this directory once instead
	// of installing one plugin per bot. Each entry names the bundle by the bot's id —
	// the one name two bots cannot share — and sources it relative to the file listing
	// it.
	assert_eq!(listed_plugins(&harness), vec![(bot.clone(), format!("./plugins/{bot}"))]);

	// A reader drops a skill into their bot's directory and rewrites the brief by
	// hand. Describing the bot again is an unrelated write, and it is not allowed to
	// cost them either: only generated files are written, and the body on the disk is
	// what the bot is.
	let skill = bundle.join("skills").join("baking").join("SKILL.md");
	std::fs::create_dir_all(skill.parent().expect("the skill directory")).expect("made");
	std::fs::write(&skill, "how to bake").expect("the skill is dropped in");
	rewrite_the_brief(&agent, FRENCH);
	harness.describe(&bot, DUTCH, None);
	assert_eq!(std::fs::read_to_string(&skill).ok().as_deref(), Some("how to bake"));
	let kept = std::fs::read_to_string(&agent).expect("the agent file is there");
	assert!(kept.contains(FRENCH), "the hand edited brief was written over: {kept}");

	// A brief edited between two launches, with no panel write to notice it: the run is
	// started on what the file says, and the record catches up with it there too.
	rewrite_the_brief(&agent, SPANISH);
	let edited = harness.runtime_of(&conversation, &bot, 5);
	assert!(edited.spoken.contains(&briefed(SPANISH)), "got {}", edited.spoken);

	// Which is what makes the fallback honest. A bundle that is not there when a run
	// starts is written again from the record, and what it writes is the hand edit
	// rather than the last value the panel submitted.
	std::fs::remove_dir_all(&bundle).expect("the bundle is taken away");
	let rebuilt = harness.runtime_of(&conversation, &bot, 6);
	assert!(rebuilt.spoken.contains(&briefed(SPANISH)), "got {}", rebuilt.spoken);
	assert!(agent.is_file(), "the run that found no bundle did not write one");

	// A server written through the commands is the one the next process is really
	// given. It is the one surface that raises a bot's capability rather than reducing
	// it — a declared server starts a process on the reader's machine — so what a
	// child finds in the bundle is measured rather than assumed. The child names the
	// servers and never their configuration: one is a command to run and an
	// environment that often holds a token, and neither belongs in a transcript.
	harness
		.call(
			"conversation_set_bot_mcp_server",
			json!({
				"botId": &bot,
				"name": "atlas",
				"config": { "command": "atlas-mcp", "args": ["--stdio"] },
			}),
		)
		.expect("the server is written");
	let manifest = bundle.join(".claude-plugin").join("plugin.json");
	let declared: Value =
		serde_json::from_str(&std::fs::read_to_string(&manifest).expect("the manifest"))
			.expect("the manifest is json");
	assert_eq!(declared["mcpServers"], json!("./.mcp.json"));
	let served = harness.runtime_of(&conversation, &bot, 7);
	assert!(served.spoken.contains("mcp<atlas>"), "got {}", served.spoken);
	assert!(served.spoken.contains(&briefed(SPANISH)), "got {}", served.spoken);

	// And taking it away is the same: the file goes with the last server, the manifest
	// stops pointing at it, and the process after that is given none.
	harness
		.call("conversation_delete_bot_mcp_server", json!({ "botId": &bot, "name": "atlas" }))
		.expect("the server is taken away");
	assert!(!bundle.join(".mcp.json").exists(), "an empty server file was left behind");
	let bare = harness.runtime_of(&conversation, &bot, 8);
	assert!(bare.spoken.contains("mcp<none>"), "got {}", bare.spoken);

	// A bundle the disk will not take fails the save that triggered it. The row goes
	// back to what it was, so what the panel reports and what the next process would be
	// started on cannot come apart — which is the whole reason a brief lives in a file.
	let manifest_dir = bundle.join(".claude-plugin");
	std::fs::remove_dir_all(&manifest_dir).expect("the manifest directory is taken away");
	std::fs::write(&manifest_dir, "not a directory").expect("a file stands in its place");
	let mut renaming = an_identity(Some(SPANISH), None);
	renaming["name"] = json!("Renamed");
	let refused = harness
		.call("conversation_update_bot", json!({ "id": bot, "identity": renaming }))
		.expect_err("the save is refused");
	assert_eq!(refused["kind"], "unwritableBundle", "got {refused}");
	assert_eq!(stored_bot(&harness, &bot)["name"], NAME, "the refused save renamed the bot");
	std::fs::remove_file(&manifest_dir).expect("the stand-in is taken away");

	// Deleting the bot takes the directory it ran as with it, and the entry that
	// listed it: nothing derives either for a bot the file no longer holds.
	harness.call("conversation_delete_bot", json!({ "id": bot })).expect("the bot is deleted");
	assert!(!bundle.exists(), "a deleted bot left its bundle behind");
	assert_eq!(listed_plugins(&harness), Vec::new());

	let _ = std::fs::remove_dir_all(&workshop);
	let _ = std::fs::remove_dir_all(&studio);
	if let Ok(dir) = harness.app.path().app_data_dir() {
		let _ = std::fs::remove_dir_all(dir);
	}
}
