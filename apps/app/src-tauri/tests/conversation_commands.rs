
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use opennest_app::bundles;
use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const TURN: &str = "t1";
const BOT: &str = "default";

struct Home {
	identifier: String,
	dir: PathBuf,
}

impl Home {
	fn new() -> Self {
		static CLAIMED: AtomicUsize = AtomicUsize::new(0);
		let identifier = format!(
			"com.opennest.conversation-commands-{}-{}",
			std::process::id(),
			CLAIMED.fetch_add(1, Ordering::Relaxed)
		);
		let dir = host(&identifier).path().app_data_dir().expect("data dir");
		Self { identifier, dir }
	}

	fn app(&self) -> App<MockRuntime> {
		let app = host(&self.identifier);
		app.manage(db::bootstrap(app.handle()));
		app
	}
}

impl Drop for Home {
	fn drop(&mut self) {
		let _ = std::fs::remove_dir_all(&self.dir);
	}
}

fn host(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds")
}

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

fn a_bot_and_its_chat(window: &WebviewWindow<MockRuntime>) -> (Value, String) {
	let chat = call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
	let listed = call(window, "conversation_bots", json!({})).expect("the bots");
	let bot = listed
		.as_array()
		.and_then(|bots| bots.iter().find(|bot| bot["id"] == json!(BOT)))
		.cloned()
		.expect("the chat seated the bot it was asked for");
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

fn an_answer_to(
	target: &str,
	id: &str,
	conversation_id: &str,
	content: &str,
	created_at: i64,
) -> Value {
	let mut message = a_user_message(id, conversation_id, content, created_at);
	message["message"]["repliedToMessageId"] = json!(target);
	message
}

fn a_streaming_reply(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	index: i64,
) -> String {
	let id = format!("m{index}");
	call(
		window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": id,
			"conversationId": conversation_id,
			"turnId": TURN,
			"authorBotId": BOT,
			"repliedToMessageId": null,
			"createdAt": index
		}}),
	)
	.expect("the reply is opened");
	call(
		window,
		"conversation_append_text",
		json!({ "id": id, "delta": format!("message {index}") }),
	)
	.expect("the reply streams");
	id
}

fn said(window: &WebviewWindow<MockRuntime>, conversation_id: &str, index: i64) {
	if index % 2 == 1 {
		call(
			window,
			"conversation_append_user_message",
			a_user_message(
				&format!("m{index}"),
				conversation_id,
				&format!("message {index}"),
				index,
			),
		)
		.expect("the message is appended");
		return;
	}
	let id = a_streaming_reply(window, conversation_id, index);
	call(window, "conversation_finalize_message", json!({ "id": id, "completion": "complete" }))
		.expect("the reply ends");
}

fn a_run(conversation_id: &str, bot: &Value, started_at: i64) -> Value {
	json!({ "conversationId": conversation_id, "botId": bot["id"], "startedAt": started_at })
}

fn a_provider_session(
	conversation_id: &str,
	bot_id: &Value,
	run: &Value,
	provider_session_id: &str,
) -> Value {
	json!({
		"conversationId": conversation_id,
		"botId": bot_id,
		"runtimeSessionId": run["id"],
		"providerSessionId": provider_session_id
	})
}

fn checkpoint(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	bot: &Value,
	created_at: i64,
) -> Value {
	call(
		window,
		"conversation_capture_checkpoint",
		json!({
			"conversationId": conversation_id,
			"botId": bot["id"],
			"runtimeSessionId": null,
			"createdAt": created_at
		}),
	)
	.expect("the checkpoint is considered")
}

fn a_reference(conversation_id: &str, message_id: &str) -> Value {
	json!({ "conversationId": conversation_id, "messageId": message_id })
}

fn a_page(conversation_id: &str, before_seq: Option<i64>, limit: u32) -> Value {
	json!({ "conversationId": conversation_id, "beforeSeq": before_seq, "limit": limit })
}

fn a_pin(conversation_id: &str, message_id: &str, block_index: i64, pinned_at: i64) -> Value {
	json!({
		"conversationId": conversation_id,
		"messageId": message_id,
		"blockIndex": block_index,
		"pinnedAt": pinned_at
	})
}

fn a_bubble(conversation_id: &str, message_id: &str, block_index: i64) -> Value {
	json!({
		"conversationId": conversation_id,
		"messageId": message_id,
		"blockIndex": block_index
	})
}

fn pins(window: &WebviewWindow<MockRuntime>, conversation_id: &str) -> Vec<(String, Value, Value)> {
	call(window, "conversation_pinned_messages", json!({ "conversationId": conversation_id }))
		.expect("the pins")
		.as_array()
		.expect("the pins come back as a list")
		.iter()
		.map(|pin| {
			(
				pin["message"]["id"].as_str().expect("an id").to_owned(),
				pin["blockIndex"].clone(),
				pin["pinnedAt"].clone(),
			)
		})
		.collect()
}

fn occurrences(text: &str, needle: &str) -> usize {
	text.matches(needle).count()
}

fn walked_back(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	page: u32,
) -> (Vec<i64>, usize) {
	let mut reached: Vec<i64> = Vec::new();
	let mut cursor: Option<i64> = None;
	let mut crossings = 0;
	loop {
		let crossing =
			call(window, "conversation_message_page", a_page(conversation_id, cursor, page))
				.expect("the page");
		let mut held = seqs(&crossing);
		assert!(!held.is_empty(), "a page that claimed there was more came back empty");
		crossings += 1;
		cursor = held.first().copied();
		held.append(&mut reached);
		reached = held;
		if crossing["hasMore"] == json!(false) {
			return (reached, crossings);
		}
	}
}

fn seqs(page: &Value) -> Vec<i64> {
	page["messages"]
		.as_array()
		.expect("the page holds messages")
		.iter()
		.map(|message| message["seq"].as_i64().expect("a seq"))
		.collect()
}

#[test]
fn a_host_without_a_database_answers_a_registered_command_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_main_chat", json!({ "botId": BOT })),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

#[test]
fn a_turn_written_over_ipc_reads_back_as_the_page_the_reader_displays() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	assert_eq!(bot["id"], json!(BOT));
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
				"authorBotId": BOT,
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
					"createdAt": 2,
					"repliedToMessageId": null,
					"runtimeSessionId": null,
				},
				{
					"id": "m2",
					"conversationId": conversation,
					"turnId": TURN,
					"seq": 2,
					"role": "assistant",
					"content": "hi there",
					"completion": "complete",
					"createdAt": 3,
					"repliedToMessageId": "m1",
					"runtimeSessionId": null,
				}
			]
		}))
	);
}

#[test]
fn opening_a_run_answers_with_the_row_a_runtime_scope_is_built_from() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	let opened = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 17))
		.expect("the run opens");
	let replacement =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 18))
			.expect("the next run opens");

	assert_eq!(opened["conversationId"], json!(conversation));
	assert_eq!(opened["botId"], bot["id"]);
	assert_eq!(opened["seq"], json!(1), "the lineage did not start at 1");
	assert_eq!(opened["startedAt"], json!(17));
	assert!(
		opened["id"].as_str().is_some_and(|id| !id.is_empty()),
		"a run crossed without an id of its own: {opened}"
	);
	assert_eq!(replacement["seq"], json!(2), "the restart did not continue the lineage");
	assert_ne!(replacement["id"], opened["id"], "the restart reused the replaced run's id");
}

#[test]
fn the_id_a_run_answers_under_is_recorded_once_and_only_while_it_is_live() {
	const ANNOUNCED: &str = "claude-9f3c";

	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
		.expect("the run opens");
	let record = |body: Value| call(&window, "conversation_record_provider_session", body);

	let recorded = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let replayed = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let disagreed = record(a_provider_session(&conversation, &bot["id"], &run, "claude-0000"));
	let outsider = record(a_provider_session(&conversation, &json!("nobody"), &run, "claude-1111"));

	let replacement =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
			.expect("the run that replaces it opens");
	let late = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let fresh = record(a_provider_session(&conversation, &bot["id"], &replacement, "claude-4d2a"));

	let stale_write = Err(json!({ "kind": "storage", "failure": { "kind": "staleWrite" } }));
	assert_eq!(recorded, Ok(Value::Null), "the live run would not take the id it answers under");
	assert_eq!(replayed, Ok(Value::Null), "the same callback twice was not answered as one write");
	assert_eq!(disagreed, stale_write, "a second, different id was not refused: {disagreed:?}");
	assert_eq!(
		outsider.as_ref().err().and_then(|failure| failure["kind"].as_str()),
		Some("storage"),
		"a run named under another bot was refused as something else: {outsider:?}"
	);
	assert_eq!(late, stale_write, "a replaced run still took an id: {late:?}");
	assert_eq!(
		fresh,
		Ok(Value::Null),
		"the replacement had been written by the run it replaced: {fresh:?}"
	);
}

#[test]
fn a_run_opened_after_a_crash_continues_the_lineage_instead_of_reusing_its_names() {
	let home = Home::new();

	let crashed = {
		let app = home.app();
		let window = window(&app);
		let (bot, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
			.expect("the run the host dies under opens")
	};

	let app = home.app();
	let window = window(&app);
	let (bot, conversation) = a_bot_and_its_chat(&window);
	let recovered =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
			.expect("the run after the crash opens");

	assert_eq!(crashed["seq"], json!(1), "the lineage did not start at 1");
	assert_eq!(recovered["seq"], json!(2), "the launch after the crash restarted the lineage");
	assert_ne!(recovered["id"], crashed["id"], "the run after the crash took the crashed one's id");
}

#[test]
fn opening_a_run_for_a_bot_the_conversation_does_not_hold_is_refused_as_storage() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	let refused = call(
		&window,
		"conversation_open_runtime_session",
		json!({ "conversationId": conversation, "botId": "nobody", "startedAt": 1 }),
	);

	assert_eq!(
		refused.as_ref().err().and_then(|failure| failure["kind"].as_str()),
		Some("storage"),
		"a run opened for an outsider was refused as something else: {refused:?}"
	);
}

#[test]
fn the_newest_page_comes_first_and_its_oldest_seq_walks_back_to_the_rest() {
	let home = Home::new();
	let app = home.app();
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
}

#[test]
fn a_refused_write_keeps_the_shape_that_says_what_disagreed() {
	let home = Home::new();
	let app = home.app();
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
}

#[test]
fn a_history_longer_than_the_old_snapshot_cap_reads_back_whole_after_a_relaunch() {
	const HISTORY: i64 = 250;
	const PAGE: u32 = 20;

	let home = Home::new();

	{
		let app = home.app();
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_start_turn", a_turn(&conversation))
			.expect("the turn is started");
		for index in 1..=HISTORY {
			call(
				&window,
				"conversation_append_user_message",
				a_user_message(&format!("m{index}"), &conversation, "hello", index),
			)
			.expect("the message is appended");
		}
	}

	let app = home.app();
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	let (reached, crossings) = walked_back(&window, &conversation, PAGE);

	assert_eq!(
		reached,
		(1..=HISTORY).collect::<Vec<_>>(),
		"the walk back skipped, repeated or reordered a message the reader had seen"
	);
	assert_eq!(crossings, 13, "the reader paid for more crossings than the history needed");
}

#[test]
fn a_pin_is_read_back_from_any_point_of_the_history_whatever_page_the_reader_holds() {
	const HISTORY: i64 = 120;
	const PAGE: u32 = 20;

	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	for index in 1..=HISTORY {
		said(&window, &conversation, index);
	}

	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 1, 500))
		.expect("the oldest pin is stored");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 1, 900))
		.expect("a second pin on the same bubble is accepted");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 0, 800))
		.expect("another bubble of the same message is pinned");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m110", 0, 600))
		.expect("the newer pin is stored");
	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, PAGE))
		.expect("the newest page");

	assert!(
		!seqs(&newest).contains(&2),
		"the fixture loaded a page that already holds the oldest pinned message"
	);
	assert_eq!(
		pins(&window, &conversation),
		vec![
			("m110".to_owned(), json!(0), json!(600)),
			("m2".to_owned(), json!(0), json!(800)),
			("m2".to_owned(), json!(1), json!(500)),
		],
		"the pins came back out of order, moved their moment or missed the loaded window"
	);

	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m110", 0))
		.expect("the pin is cleared");
	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m110", 0))
		.expect("a bubble with no pin was refused");
	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m2", 0))
		.expect("one bubble of a message is cleared");

	assert_eq!(
		pins(&window, &conversation),
		vec![("m2".to_owned(), json!(1), json!(500))],
		"clearing one pin took another with it"
	);
	assert_eq!(
		call(&window, "conversation_pin_message", a_pin(&conversation, "m999", 0, 700)),
		Err(json!({ "kind": "unknownMessage", "id": "m999" })),
		"a pin on a message the conversation does not hold was accepted"
	);
	assert_eq!(
		call(&window, "conversation_unpin_message", a_bubble(&conversation, "m999", 0)),
		Err(json!({ "kind": "unknownMessage", "id": "m999" })),
		"an unpin on a message the conversation does not hold was accepted"
	);
	assert_eq!(
		pins(&window, &conversation),
		vec![("m2".to_owned(), json!(1), json!(500))],
		"a refused pin rewrote the pins the conversation holds"
	);
}

#[test]
fn a_chat_past_the_fold_bound_survives_a_dead_host_with_nothing_lost_or_doubled() {
	const HISTORY: i64 = 230;
	const TAIL: i64 = 20;
	const PAGE: u32 = 20;
	const ANSWERED: &str = "m3";
	const PROMPT: &str = "p1";
	const PROMPT_TEXT: &str = "so where does that leave the roof?";

	let home = Home::new();

	{
		let app = home.app();
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_start_turn", a_turn(&conversation))
			.expect("the turn is started");
		for index in 1..HISTORY {
			said(&window, &conversation, index);
		}
		a_streaming_reply(&window, &conversation, HISTORY);
	}

	let app = home.app();
	let window = window(&app);
	let (bot, conversation) = a_bot_and_its_chat(&window);

	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, 1))
		.expect("the newest page");
	assert_eq!(
		newest["messages"][0],
		json!({
			"id": format!("m{HISTORY}"),
			"conversationId": conversation,
			"turnId": TURN,
			"seq": HISTORY,
			"role": "assistant",
			"content": format!("message {HISTORY}"),
			"completion": "interrupted",
			"createdAt": HISTORY,
			"repliedToMessageId": null,
			"runtimeSessionId": null,
		}),
		"the reply the dead host left came back as something else"
	);

	let folded = checkpoint(&window, &conversation, &bot, 1);
	assert_eq!(
		folded["lastMessageSeq"],
		json!(HISTORY - TAIL),
		"the first fold stopped somewhere other than the edge of the tail"
	);
	assert!(folded["tokenCount"].as_i64().is_some_and(|count| count > 0));

	call(
		&window,
		"conversation_append_user_message",
		an_answer_to(ANSWERED, PROMPT, &conversation, PROMPT_TEXT, HISTORY + 1),
	)
	.expect("the prompt is appended");

	let again = checkpoint(&window, &conversation, &bot, 2);
	assert_eq!(
		again["lastMessageSeq"],
		json!(HISTORY + 1 - TAIL),
		"the recovery point did not follow the messages the tail could no longer reach"
	);

	let context = call(
		&window,
		"conversation_bounded_context",
		json!({
			"conversationId": conversation,
			"botId": bot["id"],
			"promptMessageId": PROMPT
		}),
	)
	.expect("the context is rebuilt");
	let context = context.as_str().expect("the context crosses as text").to_owned();

	assert!(
		context.contains("The conversation so far:\n…"),
		"a fold that could not reach the beginning did not say so: {context}"
	);
	assert_eq!(
		occurrences(&context, "message 211\n"),
		1,
		"the message between the two folds is in neither the summary nor the tail"
	);
	assert_eq!(occurrences(&context, "message 212\n"), 1, "the tail lost the message it opens on");
	assert_eq!(
		occurrences(&context, &format!("message {HISTORY}\n")),
		1,
		"the tail lost what the dead host had been saying"
	);
	assert!(
		context.contains("The message this one replies to:\nuri: opennest://c/")
			&& context.contains("from: user\nclaude session: unknown\nmessage 3"),
		"an answer to an earlier message lost the target it points at: {context}"
	);
	assert_eq!(occurrences(&context, "message 3\n"), 1, "the answered message was carried twice");
	assert_eq!(occurrences(&context, PROMPT_TEXT), 1, "the prompt was carried twice");
	assert!(context.ends_with(PROMPT_TEXT), "the prompt was not the last thing the run is told");

	let (reached, _) = walked_back(&window, &conversation, PAGE);
	assert_eq!(
		reached,
		(1..=HISTORY + 1).collect::<Vec<_>>(),
		"the walk back skipped, repeated or reordered a message the reader had seen"
	);
	assert_eq!(
		call(&window, "conversation_message_page", a_page(&conversation, None, 1))
			.expect("the newest page")["messages"][0]["id"],
		json!(PROMPT),
		"the prompt is not where the reader last left it"
	);
}

fn an_identity(name: &str, model: &str, animal: &str, blot: Value) -> Value {
	json!({
		"name": name,
		"title": "Reviewer",
		"model": model,
		"avatarAnimal": animal,
		"avatarBlot": blot,
		"avatarImagePath": null,
		"workingDir": "/work/opennest",
		"instructions": "Answer with the file you would touch.",
		"deniedTools": []
	})
}

#[test]
fn a_bot_created_over_ipc_is_listed_described_and_deleted_with_its_chat() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "owl", json!("red")) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["name"], json!("Nyx"));
	assert_eq!(created["title"], json!("Reviewer"));
	assert_eq!(created["model"], json!("sonnet"));
	assert_eq!(created["avatarAnimal"], json!("owl"));
	assert_eq!(created["avatarBlot"], json!("red"));
	assert_eq!(created["avatarImagePath"], json!(null));
	assert_eq!(created["workingDir"], json!("/work/opennest"));
	assert_eq!(created["instructions"], json!("Answer with the file you would touch."));
	assert!(created["createdAt"].is_i64(), "a bot crossed without a camelCase moment: {created}");

	let chat = call(&window, "conversation_main_chat", json!({ "botId": id }))
		.expect("the chat the bot was created with");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let listed = call(&window, "conversation_bots", json!({})).expect("the bots");
	assert_eq!(
		listed.as_array().expect("a list").iter().map(|bot| bot["id"].clone()).collect::<Vec<_>>(),
		vec![json!(id)],
		"the bot that was created is not the one the list holds"
	);

	let updated = call(
		&window,
		"conversation_update_bot",
		json!({ "id": id, "identity": an_identity("Ada", "opus", "koala", Value::Null) }),
	)
	.expect("the bot is updated");
	assert_eq!(updated["name"], json!("Ada"));
	assert_eq!(updated["model"], json!("opus"), "a bot was not moved between models");
	assert_eq!(updated["avatarAnimal"], json!("koala"));
	assert_eq!(updated["avatarBlot"], json!(null), "a mark taken off a bot was kept");
	assert_eq!(updated["createdAt"], created["createdAt"], "an update moved the moment");

	assert_eq!(call(&window, "conversation_delete_bot", json!({ "id": id })), Ok(Value::Null));
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
	assert_eq!(
		call(
			&window,
			"conversation_message_page",
			json!({
				"conversationId": conversation,
				"beforeSeq": null,
				"limit": 20
			})
		),
		Ok(json!({ "conversationId": conversation, "messages": [], "hasMore": false })),
		"the transcript of a deleted bot is still reachable"
	);
}

#[test]
fn a_face_outside_the_closed_vocabulary_is_refused_before_it_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let animal = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "dragon", json!("red")) }),
	);
	let blot = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "owl", json!("chartreuse")) }),
	);

	assert!(animal.is_err(), "an animal the engine cannot draw was accepted: {animal:?}");
	assert!(blot.is_err(), "a colour outside the palette was accepted: {blot:?}");
	assert_eq!(
		call(&window, "conversation_bots", json!({})),
		Ok(json!([])),
		"a bot the boundary refused reached the file anyway"
	);
}

#[test]
fn a_model_label_outside_the_offered_aliases_is_stored_and_read_back_whole() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "claude-opus-4-1-20250805", "owl", json!("red")) }),
	)
	.expect("a bot on a label the host does not know");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["model"], json!("claude-opus-4-1-20250805"));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["model"].clone()),
		Ok(json!("claude-opus-4-1-20250805")),
		"a label the file holds came back changed"
	);

	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({ "id": id, "identity": an_identity("Nyx", "fable", "owl", json!("red")) })
		)
		.map(|bot| bot["model"].clone()),
		Ok(json!("fable"))
	);
}

#[test]
fn the_tools_a_bot_denies_are_written_to_its_agent_file_and_read_back_from_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut held_back = an_identity("Nyx", "sonnet", "owl", json!("red"));
	held_back["deniedTools"] = json!(["Bash", "Edit", "NotebookEdit", "Write"]);

	let created = call(&window, "conversation_create_bot", json!({ "identity": held_back }))
		.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["deniedTools"], json!(["Bash", "Edit", "NotebookEdit", "Task", "Write"]));
	assert_eq!(created["changesNothing"], json!(true));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["changesNothing"].clone()),
		Ok(json!(true)),
		"the file the session is promoted onto denies nothing"
	);

	let mut one_tool = an_identity("Nyx", "sonnet", "owl", json!("red"));
	one_tool["deniedTools"] = json!(["WebFetch"]);
	let updated =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": one_tool }))
			.expect("the bot is updated");

	assert_eq!(updated["deniedTools"], json!(["WebFetch"]), "a denial outlived the list");
	assert_eq!(updated["changesNothing"], json!(false));
}

#[test]
fn a_write_naming_a_bot_that_is_gone_crosses_as_an_unknown_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "cat", Value::Null) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();
	call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the bot is deleted");

	assert_eq!(
		call(&window, "conversation_delete_bot", json!({ "id": id })),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({ "id": id, "identity": an_identity("Ada", "sonnet", "cat", Value::Null) })
		),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
}

fn avatar_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("avatars")
}

fn stored_avatars(app: &App<MockRuntime>) -> Vec<String> {
	let Ok(entries) = std::fs::read_dir(avatar_dir(app)) else {
		return Vec::new();
	};
	let mut names: Vec<String> =
		entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
	names.sort();
	names
}

fn a_picture(width: u32, height: u32, format: image::ImageFormat) -> Vec<u8> {
	let mut canvas = image::RgbImage::new(width, height);
	for (x, y, pixel) in canvas.enumerate_pixels_mut() {
		*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 64]);
	}
	let mut encoded = std::io::Cursor::new(Vec::new());
	image::DynamicImage::ImageRgb8(canvas)
		.write_to(&mut encoded, format)
		.expect("the fixture encodes");
	encoded.into_inner()
}

fn a_png(width: u32, height: u32) -> Vec<u8> {
	a_picture(width, height, image::ImageFormat::Png)
}

fn an_upload(id: &str, bytes: &[u8]) -> Value {
	json!({ "id": id, "bytes": bytes })
}

fn a_bot(window: &WebviewWindow<MockRuntime>, name: &str) -> String {
	call(
		window,
		"conversation_create_bot",
		json!({ "identity": an_identity(name, "sonnet", "owl", json!("red")) }),
	)
	.expect("the bot is created")["id"]
		.as_str()
		.expect("the bot holds an id")
		.to_owned()
}

fn wearing(window: &WebviewWindow<MockRuntime>, id: &str) -> Value {
	call(window, "conversation_bots", json!({}))
		.expect("the bots")
		.as_array()
		.expect("a list")
		.iter()
		.find(|bot| bot["id"] == json!(id))
		.expect("the bot is listed")["avatarImagePath"]
		.clone()
}

#[test]
fn an_uploaded_picture_is_stored_squared_beside_the_database_and_crosses_as_a_path() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(200, 80)))
		.expect("the picture is stored");

	let recorded = worn["avatarImagePath"].as_str().expect("a path crossed").to_owned();
	assert_eq!(
		Path::new(&recorded).parent(),
		Some(avatar_dir(&app).as_path()),
		"a picture was stored somewhere other than the directory the asset scope covers"
	);
	assert_eq!(Path::new(&recorded).extension().and_then(|it| it.to_str()), Some("png"));
	assert_eq!(stored_avatars(&app).len(), 1, "one upload left more than one file");
	let stored = image::load_from_memory_with_format(
		&std::fs::read(&recorded).expect("the stored file is readable"),
		image::ImageFormat::Png,
	)
	.expect("the stored file decodes as png");
	assert_eq!(
		image::GenericImageView::dimensions(&stored),
		(512, 512),
		"a picture reached the disk without being squared and resized"
	);
	assert_eq!(wearing(&window, &id), json!(recorded), "the list answers another path");
	assert_eq!(
		worn["avatarAnimal"],
		json!("owl"),
		"an uploaded picture took the animal the bot falls back to with it"
	);
}

#[test]
fn a_jpeg_is_accepted_and_stored_as_the_one_format() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let worn = call(
		&window,
		"conversation_set_bot_avatar_image",
		an_upload(&id, &a_picture(64, 90, image::ImageFormat::Jpeg)),
	)
	.expect("the picture is stored");

	let recorded = worn["avatarImagePath"].as_str().expect("a path crossed");
	assert_eq!(
		image::guess_format(&std::fs::read(recorded).expect("readable")).expect("a format"),
		image::ImageFormat::Png
	);
}

#[test]
fn a_picture_the_host_refuses_leaves_nothing_on_the_disk_and_nothing_on_the_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, b"GIF89a\0\0\0\0\0\0")),
		Err(json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } })),
		"a format this build cannot decode was accepted"
	);
	assert_eq!(
		call(
			&window,
			"conversation_set_bot_avatar_image",
			an_upload(&id, b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>")
		),
		Err(json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } })),
		"markup named an image was accepted"
	);
	let torn =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(40, 40)[..24]));
	assert!(
		matches!(&torn, Err(refusal) if refusal["kind"] == json!("rejectedAvatarImage")
			&& refusal["reason"]["kind"] == json!("undecodable")),
		"bytes that claimed a format and were not one crossed as something else: {torn:?}"
	);

	assert_eq!(stored_avatars(&app), Vec::<String>::new(), "a refused picture reached the disk");
	assert_eq!(wearing(&window, &id), json!(null), "a refused picture reached the bot");
}

#[test]
fn a_picture_over_the_limit_is_refused_with_the_limit_it_broke() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let limit = 5 * 1024 * 1024;

	let refused =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &vec![0u8; limit + 1]));

	assert_eq!(
		refused,
		Err(json!({
			"kind": "rejectedAvatarImage",
			"reason": { "kind": "tooLarge", "bytes": limit + 1, "limit": limit }
		}))
	);
	assert_eq!(stored_avatars(&app), Vec::<String>::new());
}

#[test]
fn replacing_a_picture_leaves_exactly_one_file_behind() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let first = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the first picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();
	let second = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(48, 20)))
		.expect("the second picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	assert_ne!(first, second, "a replacement was written over the file it replaced");
	assert!(!Path::new(&first).exists(), "the replaced picture stayed behind");
	assert!(Path::new(&second).exists(), "the replacement is not there");
	assert_eq!(stored_avatars(&app).len(), 1);
	assert_eq!(wearing(&window, &id), json!(second));
}

#[test]
fn deleting_a_bot_leaves_no_picture_behind_and_leaves_every_other_bot_its_own() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let doomed = a_bot(&window, "Nyx");
	let spared = a_bot(&window, "Ada");
	call(&window, "conversation_set_bot_avatar_image", an_upload(&doomed, &a_png(30, 30)))
		.expect("the doomed bot's picture is stored");
	let kept =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&spared, &a_png(30, 30)))
			.expect("the spared bot's picture is stored")["avatarImagePath"]
			.as_str()
			.expect("a path")
			.to_owned();

	call(&window, "conversation_delete_bot", json!({ "id": doomed })).expect("the bot is deleted");

	assert_eq!(stored_avatars(&app).len(), 1, "a deleted bot left its picture behind");
	assert!(Path::new(&kept).exists(), "deleting one bot took another bot's picture");
}

#[test]
fn an_identity_written_without_a_path_takes_the_picture_off_and_one_written_with_it_keeps_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	let mut echoed = an_identity("Nyx", "sonnet", "owl", json!("red"));
	echoed["avatarImagePath"] = json!(worn);
	let unchanged =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": echoed }))
			.expect("the bot is updated");

	assert_eq!(unchanged["avatarImagePath"], json!(worn), "an unrelated edit dropped the picture");
	assert!(Path::new(&worn).exists(), "an unrelated edit swept the picture");

	let bare = call(
		&window,
		"conversation_update_bot",
		json!({ "id": id, "identity": an_identity("Nyx", "sonnet", "owl", json!("red")) }),
	)
	.expect("the bot is updated");

	assert_eq!(bare["avatarImagePath"], json!(null));
	assert_eq!(stored_avatars(&app), Vec::<String>::new(), "the picture taken off stayed on disk");
}

#[test]
fn a_recorded_path_outside_the_avatar_directory_is_refused_rather_than_read() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let outside = app.path().app_data_dir().expect("data dir").join("elsewhere.png");
	std::fs::write(&outside, a_png(20, 20)).expect("the file outside exists");
	std::fs::create_dir_all(avatar_dir(&app)).expect("the avatar directory exists");

	for escaping in [
		outside.to_string_lossy().into_owned(),
		avatar_dir(&app).join("..").join("elsewhere.png").to_string_lossy().into_owned(),
		"/etc/passwd".to_owned(),
	] {
		let mut identity = an_identity("Nyx", "sonnet", "owl", json!("red"));
		identity["avatarImagePath"] = json!(escaping);
		let updated =
			call(&window, "conversation_update_bot", json!({ "id": id, "identity": identity }))
				.expect("the bot is updated");

		assert_eq!(
			updated["avatarImagePath"],
			json!(null),
			"a path out of the avatar directory was handed to the webview: {escaping}"
		);
		assert_eq!(wearing(&window, &id), json!(null));
	}

	assert!(outside.exists(), "a refused path was read and swept anyway");
	assert!(Path::new("/etc/passwd").exists(), "the sweep reached outside its own directory");
}

#[test]
fn a_picture_missing_from_the_disk_reads_as_no_picture_rather_than_a_broken_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	std::fs::remove_file(&worn).expect("the picture is removed from under the row");

	assert_eq!(wearing(&window, &id), json!(null));
	assert!(
		call(&window, "conversation_bots", json!({})).is_ok(),
		"a read of the roster did not survive a missing file"
	);
}

#[test]
fn an_upload_naming_a_bot_that_is_gone_is_refused_before_any_file_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the bot is deleted");

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30))),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
	assert_eq!(stored_avatars(&app), Vec::<String>::new());
}

#[test]
fn a_host_without_a_database_refuses_an_upload_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(BOT, &a_png(20, 20))),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

#[test]
fn a_launch_reads_the_roster_it_finds_and_never_writes_a_bot_back_into_it() {
	let home = Home::new();

	let id = {
		let app = home.app();
		let window = window(&app);
		assert_eq!(
			call(&window, "conversation_bots", json!({})),
			Ok(json!([])),
			"a fresh install came up with a bot nobody created"
		);
		let id = a_bot(&window, "Nyx");
		assert_eq!(
			call(&window, "conversation_bots", json!({})).map(|bots| bots.as_array().map(Vec::len)),
			Ok(Some(1))
		);
		id
	};

	{
		let app = home.app();
		let window = window(&app);
		assert_eq!(
			call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["id"].clone()),
			Ok(json!(id)),
			"a relaunch did not find the bot the last one wrote"
		);
		call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the last bot goes");
		assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
	}

	let app = home.app();
	let window = window(&app);
	assert_eq!(
		call(&window, "conversation_bots", json!({})),
		Ok(json!([])),
		"a launch after the last bot was deleted brought one back"
	);
}

fn attachment_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("attachments")
}

fn a_new_bot_and_its_chat(window: &WebviewWindow<MockRuntime>, name: &str) -> (String, String) {
	let id = a_bot(window, name);
	let conversation_id = call(window, "conversation_main_chat", json!({ "botId": id }))
		.expect("the chat")["id"]
		.as_str()
		.expect("the chat holds an id")
		.to_owned();
	(id, conversation_id)
}

fn an_attachment(name: &str, bytes: &[u8]) -> Value {
	json!({ "name": name, "bytes": bytes })
}

fn an_attachment_stored_for(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	bytes: &[u8],
) -> String {
	call(
		window,
		"chat_store_attachments",
		json!({ "conversationId": conversation_id, "attachments": [an_attachment("a.txt", bytes)] }),
	)
	.expect("the attachment is stored")[0]
		.as_str()
		.expect("a path")
		.to_owned()
}

#[test]
fn attachments_submitted_for_a_chat_are_written_under_it_and_cross_as_absolute_paths() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (_, conversation_id) = a_new_bot_and_its_chat(&window, "Nyx");

	let stored = call(
		&window,
		"chat_store_attachments",
		json!({
			"conversationId": conversation_id,
			"attachments": [
				an_attachment("notes.md", b"first"),
				an_attachment("../../etc/passwd", b"second"),
			]
		}),
	)
	.expect("the attachments are stored");

	let paths: Vec<String> = stored
		.as_array()
		.expect("a list of paths")
		.iter()
		.map(|path| path.as_str().expect("a path").to_owned())
		.collect();
	let dir = attachment_dir(&app).join(&conversation_id);
	assert_eq!(paths.len(), 2, "the answer left a submitted file out");
	assert!(
		paths.iter().all(|path| Path::new(path).parent() == Some(dir.as_path())),
		"a file was stored somewhere other than the directory of its conversation"
	);
	assert_eq!(
		std::fs::read(&paths[0]).expect("the first file is readable"),
		b"first",
		"the answer is not in the order the files were submitted"
	);
	assert_eq!(std::fs::read(&paths[1]).expect("the second file is readable"), b"second");
	assert_eq!(
		Path::new(&paths[0]).extension().and_then(|it| it.to_str()),
		Some("md"),
		"a stored file lost the extension that says what it is"
	);
}

#[test]
fn attachments_for_a_conversation_that_is_not_on_the_record_are_refused_and_nothing_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_new_bot_and_its_chat(&window, "Nyx");

	assert_eq!(
		call(
			&window,
			"chat_store_attachments",
			json!({
				"conversationId": "not-a-conversation",
				"attachments": [an_attachment("notes.md", b"first")]
			}),
		),
		Err(json!({ "kind": "unknownConversation", "id": "not-a-conversation" }))
	);
	assert!(
		!attachment_dir(&app).join("not-a-conversation").exists(),
		"a refused call made the directory its files would have gone in"
	);
}

#[test]
fn deleting_a_bot_takes_the_attachments_of_its_conversation_and_leaves_every_other_one_its_own() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (doomed, doomed_chat) = a_new_bot_and_its_chat(&window, "Nyx");
	let (_, spared_chat) = a_new_bot_and_its_chat(&window, "Ada");
	let dropped = an_attachment_stored_for(&window, &doomed_chat, b"gone");
	let kept = an_attachment_stored_for(&window, &spared_chat, b"kept");

	call(&window, "conversation_delete_bot", json!({ "id": doomed })).expect("the bot is deleted");

	assert!(
		!attachment_dir(&app).join(&doomed_chat).exists(),
		"a deleted bot left the directory of its conversation behind"
	);
	assert!(!Path::new(&dropped).exists(), "a deleted bot left its attachments behind");
	assert!(Path::new(&kept).exists(), "deleting one bot took another conversation's attachments");
}

#[test]
fn the_commands_a_session_announced_are_held_against_the_bot_and_replaced_by_the_next() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let silent = a_bot(&window, "Ada");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([]),
		"a bot no session has announced anything for offers a command"
	);

	call(
		&window,
		"conversation_record_bot_commands",
		json!({ "botId": &id, "commands": ["review", "compact"] }),
	)
	.expect("the first session's commands");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([{ "name": "review" }, { "name": "compact" }])
	);

	call(
		&window,
		"conversation_record_bot_commands",
		json!({
			"botId": &id,
			"commands": [{ "name": "status", "description": "What this session is" }],
		}),
	)
	.expect("the next session's commands");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([{ "name": "status", "description": "What this session is" }]),
		"an announcement was added to the one before it instead of replacing it"
	);
	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &silent }))
			.expect("the commands"),
		json!([]),
		"one bot's session announced for another"
	);
	assert_eq!(
		call(
			&window,
			"conversation_record_bot_commands",
			json!({ "botId": "missing", "commands": ["review"] })
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

#[test]
fn a_bots_skills_are_written_listed_marked_and_taken_away() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_bot_and_its_chat(&window);

	let created = call(
		&window,
		"conversation_create_bot_skill",
		json!({
			"botId": BOT,
			"draft": {
				"name": "Baking Bread",
				"description": "How to bake.",
				"body": "Bake at 220 degrees.",
			},
		}),
	)
	.expect("the skill is written");
	assert_eq!(created["id"], json!("baking-bread"));
	assert_eq!(created["name"], json!("Baking Bread"));
	assert_eq!(created["description"], json!("How to bake."));
	assert_eq!(created["body"], json!("Bake at 220 degrees."));
	assert_eq!(created["isPreloaded"], json!(false));

	assert_eq!(readers_skills(&window, BOT), json!([created]));

	let marked = call(
		&window,
		"conversation_set_bot_skill_preloaded",
		json!({ "botId": BOT, "skillId": "baking-bread", "isPreloaded": true }),
	)
	.expect("the mark lands");
	assert_eq!(marked["isPreloaded"], json!(true));

	let updated = call(
		&window,
		"conversation_update_bot_skill",
		json!({
			"botId": BOT,
			"skillId": "baking-bread",
			"draft": {
				"name": "Baking",
				"description": "Bread.",
				"body": "Bake at 240 degrees.",
				"whenToUse": "When the loaf is flat.",
				"allowedTools": ["Read", "Write"],
				"userInvocable": true,
				"metadata": { "author": "someone" },
			},
		}),
	)
	.expect("the skill is rewritten");
	assert_eq!(updated["name"], json!("Baking"));
	assert_eq!(updated["body"], json!("Bake at 240 degrees."));
	assert_eq!(updated["isPreloaded"], json!(true), "an edit dropped the mark");
	assert_eq!(updated["whenToUse"], json!("When the loaf is flat."));
	assert_eq!(updated["allowedTools"], json!(["Read", "Write"]));
	assert_eq!(updated["userInvocable"], json!(true));
	assert_eq!(updated["metadata"]["author"], json!("someone"));
	assert_eq!(updated["license"], json!(null), "a key the file never carried");
	assert_eq!(
		updated["metadata"]["opennest"]["preload"],
		json!("true"),
		"a caller writing the map took the mark with it"
	);

	call(
		&window,
		"conversation_set_bot_skill_preloaded",
		json!({ "botId": BOT, "skillId": "baking-bread", "isPreloaded": false }),
	)
	.expect("the mark goes");
	call(
		&window,
		"conversation_delete_bot_skill",
		json!({ "botId": BOT, "skillId": "baking-bread" }),
	)
	.expect("the skill is taken away");

	assert_eq!(readers_skills(&window, BOT), json!([]));
	assert_eq!(
		call(
			&window,
			"conversation_create_bot_skill",
			json!({
				"botId": "missing",
				"draft": { "name": "Baking", "description": "", "body": "" },
			}),
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

fn readers_skills(window: &WebviewWindow<MockRuntime>, bot_id: &str) -> Value {
	let listed =
		call(window, "conversation_bot_skills", json!({ "botId": bot_id })).expect("the skills");
	let readers = listed
		.as_array()
		.expect("a list of skills")
		.iter()
		.filter(|skill| skill["id"] != json!("learn"))
		.cloned()
		.collect();
	Value::Array(readers)
}

fn bundle_of(app: &App<MockRuntime>, bot_id: &str) -> PathBuf {
	let root = bundles::root(app.handle()).expect("the bundle root");
	bundles::dir(&root, bot_id)
}

fn json_at(path: &Path) -> Value {
	std::fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or(Value::Null)
}

#[test]
fn a_bots_mcp_servers_are_written_listed_replaced_and_taken_away() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_bot_and_its_chat(&window);
	let bundle = bundle_of(&app, BOT);
	let servers = bundle.join(".mcp.json");
	let manifest = bundle.join(".claude-plugin").join("plugin.json");

	let atlas = json!({ "command": "atlas-mcp", "args": ["--stdio"] });
	let ledger = json!({ "command": "ledger-mcp", "env": { "LEDGER_MODE": "read" } });

	let written = call(
		&window,
		"conversation_set_bot_mcp_server",
		json!({ "botId": BOT, "name": "atlas", "config": atlas }),
	)
	.expect("the server is written");
	assert_eq!(written, json!({ "name": "atlas", "config": atlas }));

	call(
		&window,
		"conversation_set_bot_mcp_server",
		json!({ "botId": BOT, "name": "ledger", "config": ledger }),
	)
	.expect("the second server is written");

	assert_eq!(
		call(&window, "conversation_bot_mcp_servers", json!({ "botId": BOT }))
			.expect("the servers"),
		json!([
			{ "name": "atlas", "config": atlas },
			{ "name": "ledger", "config": ledger },
		])
	);
	assert_eq!(json_at(&servers)["mcpServers"], json!({ "atlas": atlas, "ledger": ledger }));

	assert_eq!(json_at(&manifest)["mcpServers"], json!("./.mcp.json"));

	let mut theirs = json_at(&servers);
	theirs["opennestIsNotToTouchThis"] = json!(true);
	std::fs::write(&servers, theirs.to_string()).expect("the hand edit lands");

	let replaced = json!({ "command": "atlas-mcp", "args": ["--http"] });
	call(
		&window,
		"conversation_set_bot_mcp_server",
		json!({ "botId": BOT, "name": "atlas", "config": replaced }),
	)
	.expect("the server is replaced");
	let after = json_at(&servers);
	assert_eq!(after["mcpServers"], json!({ "atlas": replaced, "ledger": ledger }));
	assert_eq!(after["opennestIsNotToTouchThis"], json!(true));

	let refused = call(
		&window,
		"conversation_set_bot_mcp_server",
		json!({ "botId": BOT, "name": "atlas", "config": "atlas-mcp --secret hunter2" }),
	)
	.expect_err("a scalar is not a server");
	assert_eq!(refused["kind"], json!("unwritableBundle"));
	assert!(
		!refused["detail"].as_str().unwrap_or_default().contains("hunter2"),
		"the refusal carried the configuration: {refused}"
	);
	assert_eq!(json_at(&servers)["mcpServers"]["atlas"], replaced, "the refusal wrote anyway");

	call(&window, "conversation_delete_bot_mcp_server", json!({ "botId": BOT, "name": "atlas" }))
		.expect("the server is taken away");
	assert_eq!(json_at(&servers)["mcpServers"], json!({ "ledger": ledger }));
	assert_eq!(
		call(
			&window,
			"conversation_delete_bot_mcp_server",
			json!({ "botId": BOT, "name": "atlas" })
		)
		.expect_err("a name the bundle does not declare")["kind"],
		json!("unwritableBundle")
	);

	call(&window, "conversation_delete_bot_mcp_server", json!({ "botId": BOT, "name": "ledger" }))
		.expect("the last server is taken away");
	let bare = json_at(&servers);
	assert_eq!(bare["mcpServers"], Value::Null);
	assert_eq!(bare["opennestIsNotToTouchThis"], json!(true));

	std::fs::write(&servers, json!({ "mcpServers": { "atlas": atlas } }).to_string())
		.expect("a file with nothing but servers in it");
	call(&window, "conversation_delete_bot_mcp_server", json!({ "botId": BOT, "name": "atlas" }))
		.expect("the server is taken away");
	assert_eq!(json_at(&servers), Value::Null, "an empty server file was left behind");
	assert_eq!(json_at(&manifest)["mcpServers"], Value::Null);

	assert_eq!(
		call(
			&window,
			"conversation_set_bot_mcp_server",
			json!({ "botId": "missing", "name": "atlas", "config": atlas }),
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

#[test]
fn a_duplicated_bot_carries_the_bundle_and_none_of_the_transcript() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "owl", json!("red")) }),
	)
	.expect("the bot is created");
	let source_id = source["id"].as_str().expect("the bot holds an id").to_owned();

	call(
		&window,
		"conversation_create_bot_skill",
		json!({
			"botId": source_id,
			"draft": {
				"name": "Baking Bread",
				"description": "How to bake.",
				"body": "Bake at 220 degrees.",
			},
		}),
	)
	.expect("the skill is written");
	let atlas = json!({ "command": "atlas-mcp", "args": ["--stdio"] });
	call(
		&window,
		"conversation_set_bot_mcp_server",
		json!({ "botId": source_id, "name": "atlas", "config": atlas }),
	)
	.expect("the server is written");

	let source_bundle = bundle_of(&app, &source_id);
	let theirs =
		r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"echo theirs"}]}]}}"#;
	std::fs::create_dir_all(source_bundle.join("hooks")).expect("the hooks directory");
	std::fs::write(source_bundle.join("hooks").join("hooks.json"), theirs).expect("the hook lands");
	std::fs::write(source_bundle.join(".learned.md"), "What the source remembered\n")
		.expect("the memory lands");

	let chat = call(&window, "conversation_main_chat", json!({ "botId": source_id }))
		.expect("the chat the source was created with");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let duplicate = call(&window, "conversation_duplicate_bot", json!({ "botId": source_id }))
		.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the duplicate holds an id").to_owned();

	assert_ne!(duplicate_id, source_id, "a duplicate answered under the source's id");
	assert_eq!(duplicate["name"], json!("Nyx copy"));
	assert_eq!(duplicate["title"], source["title"]);
	assert_eq!(duplicate["model"], source["model"]);
	assert_eq!(duplicate["avatarAnimal"], source["avatarAnimal"]);
	assert_eq!(duplicate["avatarBlot"], source["avatarBlot"]);
	assert_eq!(duplicate["avatarImagePath"], source["avatarImagePath"]);
	assert_eq!(duplicate["workingDir"], source["workingDir"]);
	assert_eq!(duplicate["instructions"], source["instructions"]);
	assert_eq!(duplicate["deniedTools"], source["deniedTools"]);
	assert_eq!(duplicate["outputStyle"], source["outputStyle"]);

	let duplicate_chat = call(&window, "conversation_main_chat", json!({ "botId": duplicate_id }))
		.expect("the chat the duplicate was created with");
	let duplicate_conversation =
		duplicate_chat["id"].as_str().expect("the chat holds an id").to_owned();
	assert_ne!(duplicate_conversation, conversation, "a duplicate was seated in the source's chat");
	assert_eq!(
		call(
			&window,
			"conversation_message_page",
			json!({ "conversationId": duplicate_conversation, "beforeSeq": null, "limit": 20 })
		),
		Ok(json!({
			"conversationId": duplicate_conversation,
			"messages": [],
			"hasMore": false
		})),
		"a duplicate opened on what the source had said"
	);

	assert_eq!(
		readers_skills(&window, &duplicate_id),
		readers_skills(&window, &source_id),
		"the skills the source carries did not come over"
	);

	let bundle = bundle_of(&app, &duplicate_id);
	assert_eq!(json_at(&bundle.join(".mcp.json"))["mcpServers"], json!({ "atlas": atlas }));
	assert_eq!(
		std::fs::read_to_string(bundle.join("hooks").join("hooks.json")).ok(),
		Some(theirs.to_owned()),
		"a hook the reader gave the source did not come over"
	);
	assert!(
		!bundle.join(".learned.md").exists(),
		"what the source remembered was copied into a bot that has been told nothing"
	);

	let root = bundles::root(app.handle()).expect("the bundle root");
	let manifest = json_at(&bundle.join(".claude-plugin").join("plugin.json"));
	assert_eq!(manifest["name"], json!(duplicate_id));
	assert_eq!(manifest["mcpServers"], json!("./.mcp.json"));
	assert!(
		bundles::agent_file(&root, &duplicate_id).is_some(),
		"the duplicate has no agent file of its own"
	);
	let history = call(&window, "conversation_bot_history", json!({ "botId": duplicate_id }))
		.expect("the duplicate's history");
	assert!(
		!history.as_array().expect("a list of writes").is_empty(),
		"the duplicate has no history of its own"
	);

	assert!(source_bundle.join(".learned.md").exists(), "the source lost what it remembered");
	assert_eq!(
		json_at(&source_bundle.join(".mcp.json"))["mcpServers"],
		json!({ "atlas": atlas }),
		"the source lost the server it declares"
	);
	assert_eq!(
		call(&window, "conversation_bots", json!({}))
			.expect("the bots")
			.as_array()
			.expect("a list")
			.iter()
			.map(|bot| bot["name"].clone())
			.collect::<Vec<_>>(),
		vec![json!("Nyx"), json!("Nyx copy")]
	);
}

#[test]
fn a_duplicate_of_a_bot_that_is_gone_crosses_as_an_unknown_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_duplicate_bot", json!({ "botId": "missing" })),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
}

#[test]
fn a_reference_resolves_a_message_to_the_uri_and_the_run_that_produced_it() {
	const ANNOUNCED: &str = "claude-7b21";

	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	call(
		&window,
		"conversation_record_provider_session",
		a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED),
	)
	.expect("the run takes the id it answers under");
	let reply = a_streaming_reply(&window, &conversation, 2);
	call(
		&window,
		"conversation_finalize_message",
		json!({ "id": reply, "completion": "complete" }),
	)
	.expect("the reply ends");

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");
	let answer =
		call(&window, "conversation_message_reference", a_reference(&conversation, &reply))
			.expect("the reply reference");

	assert_eq!(prompt["uri"], json!(format!("opennest://c/{conversation}/m/m1")));
	assert_eq!(prompt["conversationId"], json!(conversation));
	assert_eq!(prompt["messageId"], json!("m1"));
	assert_eq!(prompt["role"], json!("user"));
	assert_eq!(prompt["seq"], json!(1));
	assert_eq!(prompt["createdAt"], json!(1));
	assert_eq!(prompt["excerpt"], json!("hi"));
	assert_eq!(
		prompt["runtimeSessionId"], run["id"],
		"the prompt did not reach the run its turn was answered by"
	);
	assert_eq!(prompt["providerSessionId"], json!(ANNOUNCED));

	assert_eq!(answer["role"], json!("assistant"));
	assert_eq!(answer["excerpt"], json!("message 2"));
	assert_eq!(answer["runtimeSessionId"], run["id"], "the reply forgot the run that spoke it");
	assert_eq!(answer["providerSessionId"], json!(ANNOUNCED));
}

#[test]
fn a_turn_no_run_ever_answered_leaves_its_prompt_without_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	a_streaming_reply(&window, &conversation, 2);

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");

	assert_eq!(
		prompt["runtimeSessionId"],
		Value::Null,
		"a prompt of a turn no run ever answered took one"
	);
	assert_eq!(prompt["providerSessionId"], Value::Null);
}

#[test]
fn a_prompt_reaches_the_first_run_of_its_turn_and_never_a_later_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let first = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	a_streaming_reply(&window, &conversation, 2);
	let second = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 3))
		.expect("the run that replaces it opens");
	a_streaming_reply(&window, &conversation, 3);

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");

	assert_ne!(first["id"], second["id"], "the restart reused the replaced run's id");
	assert_eq!(
		prompt["runtimeSessionId"], first["id"],
		"the prompt reached a later run than the one that first answered its turn"
	);
}

#[test]
fn a_reference_to_a_message_outside_the_conversation_comes_back_empty() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");

	assert_eq!(
		call(&window, "conversation_message_reference", a_reference(&conversation, "missing")),
		Ok(Value::Null)
	);
	assert_eq!(
		call(&window, "conversation_message_reference", a_reference("elsewhere", "m1")),
		Ok(Value::Null)
	);
}

#[test]
fn a_long_message_crosses_as_an_excerpt_that_says_it_was_cut() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	let spoken = "é".repeat(400);
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, &spoken, 1),
	)
	.expect("the prompt is appended");

	let reference =
		call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
			.expect("the reference");
	let excerpt = reference["excerpt"].as_str().expect("an excerpt");

	assert_eq!(excerpt.chars().count(), 280, "the excerpt was not capped at 280 characters");
	assert!(excerpt.ends_with('…'), "the cut excerpt did not say it was cut: {excerpt}");
	assert!(spoken.starts_with(&excerpt[..excerpt.len() - '…'.len_utf8()]));
}

#[test]
fn the_page_carries_the_reply_and_the_run_of_every_message_it_holds() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	call(
		&window,
		"conversation_append_user_message",
		an_answer_to("m1", "m2", &conversation, "again", 2),
	)
	.expect("the answer is appended");
	let reply = a_streaming_reply(&window, &conversation, 3);

	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 50))
		.expect("the page");
	let held = page["messages"].as_array().expect("a list of messages");
	let of = |id: &str| {
		held.iter().find(|message| message["id"] == json!(id)).cloned().expect("the message")
	};

	assert_eq!(of("m1")["repliedToMessageId"], Value::Null);
	assert_eq!(of("m1")["runtimeSessionId"], Value::Null, "a prompt older than the run took it");
	assert_eq!(of("m2")["repliedToMessageId"], json!("m1"));
	assert_eq!(
		of("m2")["runtimeSessionId"],
		run["id"],
		"a prompt spoken into a live run forgot it"
	);
	assert_eq!(of(&reply)["repliedToMessageId"], Value::Null);
	assert_eq!(of(&reply)["runtimeSessionId"], run["id"]);
}
