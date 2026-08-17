//! The conversation commands as the frontend meets them: over IPC, in JSON.
//!
//! What the repository tests around the database cannot see is exactly what fails
//! here — a command left out of the registry, an argument the frontend spells
//! another way, a field renamed on the way out, a refusal flattened into a string.
//! Every call below goes through `get_ipc_response`, so what is asserted is the
//! JSON itself and not a Rust value that happens to serialize.
//!
//! The database is the real one, opened through `db::bootstrap` the way the launch
//! opens it. The identifier decides the app data directory, so each test claims one
//! of its own rather than writing where a real install would — or where its
//! neighbour is reading.

use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const TURN: &str = "t1";

/// The host as it launches: the same `bootstrap`, resolved from the same app
/// handle, and the outcome managed whole. `lib.rs` runs it from the setup hook
/// because only a built app carries the identifier the data directory comes from —
/// and the hook fires with the event loop, which `MockRuntime` never starts, so
/// here it runs immediately after the build instead.
fn app(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	let app = mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds");
	app.manage(db::bootstrap(app.handle()));
	app
}

/// A host that came up without a database, managed the way a failed launch manages
/// it. No identifier of its own: nothing here touches the disk.
fn app_without_a_database() -> App<MockRuntime> {
	mock_builder()
		.invoke_handler(invoke_handler())
		.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir))
		.build(mock_context(noop_assets()))
		.expect("app builds")
}

fn window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app, "main", Default::default()).build().expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
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

/// The bot and the id of the one chat it holds, asked for the way the app asks:
/// nothing can be written to a transcript until both are on the record.
fn a_bot_and_its_chat(window: &WebviewWindow<MockRuntime>) -> (Value, String) {
	let bot = call(window, "conversation_default_bot", json!({})).expect("the default bot");
	let chat =
		call(window, "conversation_main_chat", json!({ "botId": bot["id"] })).expect("the chat");
	let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
	(bot, conversation_id)
}

fn a_turn(conversation_id: &str) -> Value {
	json!({ "turn": { "id": TURN, "conversationId": conversation_id, "startedAt": 1 } })
}

fn a_user_message(id: &str, conversation_id: &str, content: &str, created_at: i64) -> Value {
	json!({ "message": {
		"id": id,
		"conversationId": conversation_id,
		"turnId": TURN,
		"authorBotId": null,
		"repliedToMessageId": null,
		"content": content,
		"createdAt": created_at
	}})
}

fn a_page(conversation_id: &str, before_seq: Option<i64>, limit: u32) -> Value {
	json!({ "conversationId": conversation_id, "beforeSeq": before_seq, "limit": limit })
}

fn seqs(page: &Value) -> Vec<i64> {
	page["messages"]
		.as_array()
		.expect("the page holds messages")
		.iter()
		.map(|message| message["seq"].as_i64().expect("a seq"))
		.collect()
}

fn cleanup(app: &App<MockRuntime>) {
	let dir = app.path().app_data_dir().expect("data dir");
	std::fs::remove_dir_all(&dir).expect("cleanup");
}

/// Two things at once, and neither is provable without the other: the command is
/// registered — an unregistered one is not refused, it is not answered at all —
/// and the reason there is no database survives the crossing with its shape. A
/// frontend that meets `{"kind":"unavailable"}` can say the transcript is not being
/// written; one that meets a string cannot.
#[test]
fn a_host_without_a_database_answers_a_registered_command_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_main_chat", json!({ "botId": "default" })),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

/// A whole turn written the way the frontend will write one, then read back as the
/// page it displays: both roles, a streamed reply closed at its ending, oldest
/// first, and every field under the name the reader expects.
#[test]
fn a_turn_written_over_ipc_reads_back_as_the_page_the_reader_displays() {
	let app = app("com.opennest.conversation-commands-1");
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	assert_eq!(bot["id"], json!("default"));
	assert_eq!(bot["name"], json!("Claude"));
	assert_eq!(bot["model"], json!("sonnet"));
	assert!(bot["createdAt"].is_i64(), "the bot crossed without a camelCase moment: {bot}");

	assert_eq!(call(&window, "conversation_start_turn", a_turn(&conversation)), Ok(json!(1)));
	assert_eq!(
		call(
			&window,
			"conversation_append_user_message",
			a_user_message("m1", &conversation, "hello", 2)
		),
		Ok(json!(1))
	);
	assert_eq!(
		call(
			&window,
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": "m2",
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": "default",
				"repliedToMessageId": "m1",
				"createdAt": 3
			}})
		),
		Ok(json!(2))
	);
	for delta in ["hi ", "there"] {
		assert_eq!(
			call(&window, "conversation_append_text", json!({ "id": "m2", "delta": delta })),
			Ok(Value::Null)
		);
	}
	assert_eq!(
		call(
			&window,
			"conversation_finalize_message",
			json!({ "id": "m2", "completion": "complete" })
		),
		Ok(Value::Null)
	);
	assert_eq!(
		call(&window, "conversation_complete_turn", json!({ "id": TURN, "completedAt": 4 })),
		Ok(Value::Null)
	);

	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 50));

	assert_eq!(
		page,
		Ok(json!({
			"conversationId": conversation,
			"hasMore": false,
			"messages": [
				{
					"id": "m1",
					"conversationId": conversation,
					"turnId": TURN,
					"seq": 1,
					"role": "user",
					"content": "hello",
					"completion": "complete",
					"createdAt": 2
				},
				{
					"id": "m2",
					"conversationId": conversation,
					"turnId": TURN,
					"seq": 2,
					"role": "assistant",
					"content": "hi there",
					"completion": "complete",
					"createdAt": 3
				}
			]
		}))
	);

	cleanup(&app);
}

/// The read a long chat is opened with, over the boundary the cursor crosses:
/// the newest page first, then the one before it, named by the lowest `seq` the
/// reader already holds. A gap or a repeat here is a message the user never sees
/// or sees twice.
#[test]
fn the_newest_page_comes_first_and_its_oldest_seq_walks_back_to_the_rest() {
	let app = app("com.opennest.conversation-commands-2");
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	for index in 0..5 {
		call(
			&window,
			"conversation_append_user_message",
			a_user_message(&format!("m{index}"), &conversation, "hello", 1),
		)
		.expect("the message is appended");
	}

	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, 3))
		.expect("the page");
	let oldest_held = seqs(&newest).first().copied().expect("the page holds messages");
	let older =
		call(&window, "conversation_message_page", a_page(&conversation, Some(oldest_held), 3))
			.expect("the older page");

	assert_eq!(seqs(&newest), vec![3, 4, 5], "the first page was not the newest one");
	assert_eq!(newest["hasMore"], json!(true), "a full page claimed there was nothing older");
	assert_eq!(seqs(&older), vec![1, 2], "the cursor skipped or repeated a seq");
	assert_eq!(older["hasMore"], json!(false), "a partial page offered more");

	cleanup(&app);
}

/// The two rules the repositories hold, seen from the other side of the boundary.
/// Both carry what disagreed, because a caller that may have replayed an event has
/// no other way to tell its own duplicate from two events claiming one place.
#[test]
fn a_refused_write_keeps_the_shape_that_says_what_disagreed() {
	let app = app("com.opennest.conversation-commands-3");
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let replayed = call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	);
	let claimed = call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "bonjour", 2),
	);
	let reopened = call(
		&window,
		"conversation_finalize_message",
		json!({ "id": "m1", "completion": "failed" }),
	);

	assert_eq!(replayed, Ok(json!(1)), "a replayed append was refused");
	assert_eq!(
		claimed,
		Err(json!({ "kind": "conflict", "id": "m1", "field": "content" })),
		"a second message under one id was not refused as a conflict"
	);
	assert_eq!(
		reopened,
		Err(json!({
			"kind": "invalidTransition",
			"id": "m1",
			"from": "complete",
			"to": "failed"
		})),
		"a message that had already ended was given a second ending"
	);

	cleanup(&app);
}
