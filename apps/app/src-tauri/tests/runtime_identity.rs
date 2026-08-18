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

use opennest_app::claude::binary::BINARY_OVERRIDE_ENV;
use opennest_app::claude::commands::EVENT_CHANNEL;
use opennest_app::claude::contract::{ClaudeEvent, RuntimeScope, ScopedEvent, TransportError};
use opennest_app::claude::ClaudeState;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_claude");
const SCENARIO_ENV: &str = "FAKE_CLAUDE_SCENARIO";
const IDENTIFIER: &str = "com.opennest.runtime-identity";
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

const TURN: &str = "t1";
const FRENCH: &str = "Answer only in French.";
const DUTCH: &str = "Answer only in Dutch.";

struct Harness {
	app: App<MockRuntime>,
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ScopedEvent>>>,
}

/// The host as it launches: `ClaudeState` for the runtime and the database opened
/// the way `lib.rs` opens it, from an identifier this suite has to itself.
fn launch() -> Harness {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = IDENTIFIER.into();

	let app = mock_builder()
		.manage(ClaudeState::default())
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

	fn events(&self) -> Vec<ClaudeEvent> {
		self.log.lock().expect("event log").iter().map(|scoped| scoped.event.clone()).collect()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[ClaudeEvent]) -> Option<T>) -> T {
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
				"claude_start_or_resume_session",
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
		self.call("claude_submit_prompt", json!({ "scope": scope, "text": "who are you?" }))
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

fn answered(seen: &[ClaudeEvent]) -> Option<Answer> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::MessageCompleted { message } if !message.text.is_empty() => {
			Some(Answer { spoken: message.text.clone(), from: message.id.clone() })
		}
		_ => None,
	})
}

fn refused_directory(seen: &[ClaudeEvent]) -> Option<String> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::Failed { error: TransportError::WorkingDirectoryRefused { path } } => {
			Some(path.clone())
		}
		_ => None,
	})
}

/// A bot described whole, the way the settings panel submits it: every field of the
/// identity, with the two this suite is about spelled by the caller.
fn an_identity(instructions: Option<&str>, working_dir: Option<&Path>) -> Value {
	json!({
		"name": "Camille",
		"title": "",
		"description": "",
		"model": "sonnet",
		"avatarAnimal": "cat",
		"avatarPose": "idle",
		"avatarImagePath": Value::Null,
		"workingDir": working_dir.map(|dir| dir.to_string_lossy().into_owned()),
		"instructions": instructions.unwrap_or_default()
	})
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

fn scenario(name: &str) {
	std::env::set_var(SCENARIO_ENV, name);
}

/// Every runtime a bot is started as, in the order a reader produces them: a bot
/// carrying an identity, the same bot described again, one carrying nothing, and
/// one naming a directory the machine no longer has.
#[test]
fn every_run_carries_the_identity_the_bot_holds_when_it_starts() {
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);
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
	assert!(first.spoken.contains(&format!("system<{FRENCH}>")), "got {}", first.spoken);
	assert!(
		first.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&workshop))),
		"got {}",
		first.spoken
	);

	// Described again, and started again: the process that answers afterwards is a
	// different one, and what it was told is what the file says now.
	harness.describe(&bot, DUTCH, Some(&studio));
	let rotated = harness.runtime_of(&conversation, &bot, 2);
	assert!(rotated.spoken.contains(&format!("system<{DUTCH}>")), "got {}", rotated.spoken);
	assert!(
		rotated.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&studio))),
		"got {}",
		rotated.spoken
	);
	assert_ne!(rotated.from, first.from, "the new identity landed in the same process");

	// Nothing to say for itself and nowhere of its own: no system prompt at all, and
	// the directory a run has always started in.
	harness.describe(&bot, "", None);
	let plain = harness.runtime_of(&conversation, &bot, 3);
	assert!(plain.spoken.contains("system<none>"), "got {}", plain.spoken);
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
	assert!(elsewhere.spoken.contains(&format!("system<{FRENCH}>")), "got {}", elsewhere.spoken);
	let refused = harness.wait_for("the refused directory to be reported", refused_directory);
	assert!(refused.ends_with("opennest-runtime-identity-gone"), "got {refused}");

	let _ = std::fs::remove_dir_all(&workshop);
	let _ = std::fs::remove_dir_all(&studio);
	if let Ok(dir) = harness.app.path().app_data_dir() {
		let _ = std::fs::remove_dir_all(dir);
	}
}
