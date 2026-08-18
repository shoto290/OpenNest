//! One visible conversation outliving the provider session it was being answered
//! in, driven through the command layer the frontend really calls.
//!
//! Everything here is the host: the conversation commands over IPC, the real
//! database opened through `db::bootstrap`, the real transport, and the fake Claude
//! child at the end of it. What it proves is the whole of the ticket's first
//! acceptance case — a provider session deliberately made invalid, a run rotated in
//! its place, and the same chat carried on out of the file alone.
//!
//! Deliberately a single test, for the reason `e2e_session.rs` is: the binary
//! override and the fake's scenario are process-global, and `cargo test` runs the
//! tests of one binary in parallel.

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
const IDENTIFIER: &str = "com.opennest.bounded-rotation";
const DEADLINE: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

const TURN: &str = "t1";
/// The bot every scope in this file names. Its id is the one the host writes for
/// the bot it seats itself, so a test can stamp a participant without minting one.
const BOT: &str = "default";
/// Long enough that the tail cannot reach the beginning: the first messages have
/// to be recoverable through the summary or not at all.
const SPOKEN: usize = 30;
/// The message the prompt answers, chosen far enough back that no tail holds it.
const ANSWERED: &str = "m2";
const PROMPT: &str = "p1";
const PROMPT_TEXT: &str = "so where does that leave the roof?";

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

	fn scoped_events(&self) -> Vec<ScopedEvent> {
		self.log.lock().expect("event log").clone()
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

	/// The run the frontend opens against the durable lineage before it asks for a
	/// process, and the scope every command and event of that process is stamped
	/// with. `reason` describes the run this one replaces, never itself.
	fn open_run(&self, conversation: &str, started_at: i64, reason: Option<&str>) -> RuntimeScope {
		let opened = self
			.call(
				"conversation_open_runtime_session",
				json!({
					"conversationId": conversation,
					"botId": BOT,
					"startedAt": started_at,
					"reason": reason
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

	fn start(&self, scope: &RuntimeScope, resume: Option<&str>) -> Result<Value, Value> {
		self.call(
			"claude_start_or_resume_session",
			json!({
				"scope": scope,
				"resume": resume,
				"cwd": std::env::temp_dir()
			}),
		)
	}

	fn page(&self, conversation: &str) -> Vec<Value> {
		self.call(
			"conversation_message_page",
			json!({ "conversationId": conversation, "beforeSeq": null, "limit": 100 }),
		)
		.expect("the page")["messages"]
			.as_array()
			.expect("the page holds messages")
			.clone()
	}
}

fn scenario(name: &str) {
	std::env::set_var(SCENARIO_ENV, name);
}

fn turn_ended(seen: &[ClaudeEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::TurnEnded { .. } => Some(()),
		_ => None,
	})
}

fn resume_failure(seen: &[ClaudeEvent]) -> Option<bool> {
	seen.iter().find_map(|event| match event {
		ClaudeEvent::Failed { error: TransportError::ResumeFailed { forgot_session_id } } => {
			Some(*forgot_session_id)
		}
		_ => None,
	})
}

fn deltas(seen: &[ClaudeEvent]) -> String {
	seen.iter()
		.filter_map(|event| match event {
			ClaudeEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn occurrences(text: &str, needle: &str) -> usize {
	text.matches(needle).count()
}

/// A chat with a history longer than any tail, held by the one bot with an id this
/// file can name: asking for its chat is what seats it, the way the legacy import
/// seats it on an install that predates the roster. Every scope below stamps
/// `BOT`, so the participant is a constant here rather than something threaded
/// through nine call sites of a test about context.
fn a_chat_with_a_history(harness: &Harness) -> String {
	let chat = harness.call("conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();

	harness
		.call(
			"conversation_start_turn",
			json!({ "turn": { "id": TURN, "conversationId": conversation, "startedAt": 1 } }),
		)
		.expect("the turn is started");
	for index in 1..=SPOKEN {
		said(harness, &conversation, index);
	}
	conversation
}

/// One message, alternating speakers so the rebuilt tail reads as a conversation.
/// A reply is opened empty and streamed into, the way the transport writes one.
fn said(harness: &Harness, conversation: &str, index: usize) {
	let id = format!("m{index}");
	let content = format!("message {index}");
	if index % 2 == 1 {
		harness
			.call(
				"conversation_append_user_message",
				json!({ "message": {
					"id": id,
					"conversationId": conversation,
					"turnId": TURN,
					"authorBotId": null,
					"repliedToMessageId": null,
					"content": content,
					"createdAt": index
				}}),
			)
			.expect("the message is appended");
		return;
	}
	harness
		.call(
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": id,
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": BOT,
				"repliedToMessageId": null,
				"createdAt": index
			}}),
		)
		.expect("the reply is opened");
	harness
		.call("conversation_append_text", json!({ "id": id, "delta": content }))
		.expect("the reply streams");
	harness
		.call("conversation_finalize_message", json!({ "id": id, "completion": "complete" }))
		.expect("the reply ends");
}

/// A provider session refused, a run rotated in its place, and the same visible
/// chat carried on: the child that answers afterwards is a fresh process that was
/// never told anything, and everything it knows arrives in the context rebuilt from
/// the file.
#[test]
fn a_refused_provider_session_is_rotated_and_the_same_chat_carries_on() {
	std::env::set_var(BINARY_OVERRIDE_ENV, FAKE);

	let harness = launch();
	let data_dir = harness.app.path().app_data_dir().expect("data dir");
	let conversation = a_chat_with_a_history(&harness);
	let before = harness.page(&conversation);
	assert_eq!(before.len(), SPOKEN, "the history was not written as it was told");

	// The invalid provider session: the stored id is refused, and the host puts a
	// fresh child in its place rather than leaving the reader with nothing.
	scenario("resume_crash");
	let refused_run = harness.open_run(&conversation, 1, None);
	assert_eq!(
		harness.start(&refused_run, Some("a session that is gone")),
		Ok(json!({ "resumed": false }))
	);
	assert!(
		harness.wait_for("the refused resume to be reported", resume_failure),
		"the host kept a provider id the child refused"
	);

	// The rotation: what the conversation is worth keeping is folded and stored
	// first, and only then is the run that was answering in it closed out and
	// replaced. The reason lands on the row being left behind.
	let checkpoint = harness
		.call(
			"conversation_capture_checkpoint",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"runtimeSessionId": refused_run.runtime_session_id,
				"createdAt": 2
			}),
		)
		.expect("the checkpoint is taken");
	assert_eq!(checkpoint["lastMessageSeq"], json!(10), "the checkpoint folded the tail as well");
	assert_eq!(checkpoint["runtimeSessionId"], json!(refused_run.runtime_session_id));
	assert!(checkpoint["tokenCount"].as_i64().is_some_and(|count| count > 0));

	scenario("normal");
	let live = harness.open_run(&conversation, 3, Some("the provider session was refused"));
	assert_eq!(live.epoch, 2, "the rotation did not continue the lineage");
	assert_ne!(live.runtime_session_id, refused_run.runtime_session_id);
	assert_eq!(harness.start(&live, None), Ok(json!({ "resumed": false })));

	// The prompt reaches the transcript before it reaches the child, and it answers a
	// message no tail still holds.
	harness
		.call(
			"conversation_append_user_message",
			json!({ "message": {
				"id": PROMPT,
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": null,
				"repliedToMessageId": ANSWERED,
				"content": PROMPT_TEXT,
				"createdAt": 4
			}}),
		)
		.expect("the prompt is appended");

	// The second fold, the way the app takes one: before a run that was told nothing
	// is told everything, so that nothing falls between the summary and the tail.
	let folded = harness
		.call(
			"conversation_capture_checkpoint",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"runtimeSessionId": live.runtime_session_id,
				"createdAt": 5
			}),
		)
		.expect("the checkpoint is taken");
	assert_eq!(
		folded["lastMessageSeq"],
		json!(11),
		"the recovery point did not follow the message the tail could no longer reach"
	);

	let context = harness
		.call(
			"conversation_bounded_context",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"promptMessageId": PROMPT
			}),
		)
		.expect("the context is rebuilt");
	let context = context.as_str().expect("the context crosses as text").to_owned();

	harness.forget_events();
	harness
		.call("claude_submit_prompt", json!({ "scope": live, "text": context }))
		.expect("the prompt is accepted");
	harness.wait_for("the rebuilt turn to end", turn_ended);

	// What the child was really told, read back off its own stream rather than off
	// the value the command answered with.
	let told = deltas(&harness.events());
	assert_eq!(told, format!("echo :: {context}"), "the child was told something else");
	assert_eq!(occurrences(&told, PROMPT_TEXT), 1, "the rotation carried the prompt twice");
	assert_eq!(occurrences(&told, "message 3\n"), 1, "the summary lost what it folded");
	assert_eq!(occurrences(&told, "message 30\n"), 1, "the tail lost what was just said");
	assert!(
		told.contains("The message this one replies to:\nassistant: message 2"),
		"an answer to a message no tail still holds lost its target: {told}"
	);
	assert!(told.ends_with(PROMPT_TEXT), "the prompt was not the last thing the run was told");

	// The whole turn crossed under the run that produced it, and the run it replaced
	// reaches nothing: the rotation is invisible to the reader and refused to a
	// caller still naming the old one.
	assert!(
		harness.scoped_events().iter().all(|scoped| scoped.scope.as_ref() == Some(&live)),
		"an event crossed under a run other than the one answering: {:#?}",
		harness.scoped_events()
	);
	assert_eq!(
		harness.call("claude_submit_prompt", json!({ "scope": refused_run, "text": "hello" })),
		Err(json!({
			"kind": "staleRuntimeSession",
			"runtimeSessionId": refused_run.runtime_session_id
		})),
		"a caller naming the rotated run reached the process that replaced it"
	);

	// Nothing was hidden, removed or reordered on the way: the transcript the reader
	// sees is the one it saw before the rotation, with the prompt at the end of it.
	let after = harness.page(&conversation);
	assert_eq!(after.len(), SPOKEN + 1, "the rotation changed what the reader can see");
	assert_eq!(after[..SPOKEN], before[..], "the rotation moved a row the reader had seen");
	assert_eq!(after[SPOKEN]["id"], json!(PROMPT));
	assert_eq!(after[SPOKEN]["content"], json!(PROMPT_TEXT));

	assert_eq!(harness.call("claude_shutdown", json!({ "scope": live })), Ok(Value::Null));
	std::fs::remove_dir_all(&data_dir).expect("cleanup");
}
