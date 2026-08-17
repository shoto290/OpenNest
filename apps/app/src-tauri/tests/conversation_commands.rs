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

/// A reply written the way the transport writes one: opened empty, streamed into,
/// and closed at its ending. `finished` is what a host dying under the stream takes
/// away — the row stays open, and only the next launch decides what it was.
fn a_reply(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	id: &str,
	content: &str,
	created_at: i64,
	finished: bool,
) {
	call(
		window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": id,
			"conversationId": conversation_id,
			"turnId": TURN,
			"authorBotId": "default",
			"repliedToMessageId": null,
			"createdAt": created_at
		}}),
	)
	.expect("the reply is opened");
	call(window, "conversation_append_text", json!({ "id": id, "delta": content }))
		.expect("the reply streams");
	if finished {
		call(
			window,
			"conversation_finalize_message",
			json!({ "id": id, "completion": "complete" }),
		)
		.expect("the reply ends");
	}
}

/// One message under an id the assertions can name, alternating speakers so a
/// rebuilt tail reads as a conversation rather than a monologue.
fn said(window: &WebviewWindow<MockRuntime>, conversation_id: &str, index: i64, finished: bool) {
	let id = format!("m{index}");
	let content = format!("message {index}");
	if index % 2 == 1 {
		call(
			window,
			"conversation_append_user_message",
			a_user_message(&id, conversation_id, &content, index),
		)
		.expect("the message is appended");
		return;
	}
	a_reply(window, conversation_id, &id, &content, index, finished);
}

/// The run the frontend opens against the durable lineage before it asks for a
/// process. No `reason`: it is the caller's word for the run this one replaces, and
/// nothing here has a policy to describe.
fn a_run(conversation_id: &str, bot: &Value, started_at: i64) -> Value {
	json!({ "conversationId": conversation_id, "botId": bot["id"], "startedAt": started_at })
}

/// The fold the app takes before a run depends on one. `null` comes back when
/// there was nothing new to fold, which is an answer rather than a failure.
fn checkpoint(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	created_at: i64,
) -> Value {
	call(
		window,
		"conversation_capture_checkpoint",
		json!({
			"conversationId": conversation_id,
			"botId": "default",
			"runtimeSessionId": null,
			"createdAt": created_at
		}),
	)
	.expect("the checkpoint is considered")
}

fn a_page(conversation_id: &str, before_seq: Option<i64>, limit: u32) -> Value {
	json!({ "conversationId": conversation_id, "beforeSeq": before_seq, "limit": limit })
}

fn occurrences(text: &str, needle: &str) -> usize {
	text.matches(needle).count()
}

/// Every message the reader can reach, oldest first, walked the way the frontend
/// walks it: the newest page, then the one above it named by the lowest `seq`
/// already held — and what the walk cost in crossings. A gap or a repeat here is a
/// message the user never sees or sees twice.
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

/// What the frontend scopes a Claude process with, over the boundary it really
/// crosses. The lineage rules are the repository's and are proven there; what can
/// only fail here is the crossing — the command registered, the participant named
/// under the two words the frontend spells, and a row coming back with the id and
/// the number a runtime scope is built out of.
///
/// The second open is the restart every scope test downstream depends on: it has to
/// answer with another id and the next number, or a replaced run and its
/// replacement would be indistinguishable to every reader of an event.
#[test]
fn opening_a_run_answers_with_the_row_a_runtime_scope_is_built_from() {
	let app = app("com.opennest.conversation-commands-5");
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

	cleanup(&app);
}

/// The same scope, across the crash that ended the run before it. A host that died
/// left its run `active` on the record, and the next launch has to step over that
/// row rather than start the lineage again — a `seq` back at 1 would give the run
/// answering now the very name a caller from before the crash is still holding, and
/// every refusal the scope buys would land on the wrong process.
#[test]
fn a_run_opened_after_a_crash_continues_the_lineage_instead_of_reusing_its_names() {
	const IDENTIFIER: &str = "com.opennest.conversation-commands-8";

	let crashed = {
		let app = app(IDENTIFIER);
		let window = window(&app);
		let (bot, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
			.expect("the run the host dies under opens")
	};

	let app = app(IDENTIFIER);
	let window = window(&app);
	let (bot, conversation) = a_bot_and_its_chat(&window);
	let recovered =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
			.expect("the run after the crash opens");

	assert_eq!(crashed["seq"], json!(1), "the lineage did not start at 1");
	assert_eq!(recovered["seq"], json!(2), "the launch after the crash restarted the lineage");
	assert_ne!(recovered["id"], crashed["id"], "the run after the crash took the crashed one's id");

	cleanup(&app);
}

/// A run cannot be opened for a bot the conversation does not hold, and the
/// refusal has to reach the frontend as the storage failure it is: a launch that
/// meets a string here has nothing to say about why it never got a scope.
#[test]
fn opening_a_run_for_a_bot_the_conversation_does_not_hold_is_refused_as_storage() {
	let app = app("com.opennest.conversation-commands-6");
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

/// The launch the app now boots on, at the boundary it really crosses. One host
/// writes a transcript longer than the snapshot the old store kept whole, and is
/// gone before the next one opens the file it left — nothing is carried over in
/// memory. What the reader can reach afterwards is every message of it, in the
/// crossings the frontend pages with, each exactly once.
#[test]
fn a_history_longer_than_the_old_snapshot_cap_reads_back_whole_after_a_relaunch() {
	const IDENTIFIER: &str = "com.opennest.conversation-commands-4";
	const HISTORY: i64 = 250;
	const PAGE: u32 = 20;

	{
		let app = app(IDENTIFIER);
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

	let app = app(IDENTIFIER);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	let (reached, crossings) = walked_back(&window, &conversation, PAGE);

	assert_eq!(
		reached,
		(1..=HISTORY).collect::<Vec<_>>(),
		"the walk back skipped, repeated or reordered a message the reader had seen"
	);
	assert_eq!(crossings, 13, "the reader paid for more crossings than the history needed");

	cleanup(&app);
}

/// The chat as it really gets long, at the boundary the frontend crosses: more
/// messages than one fold can reach, a host that died under the last reply, folds
/// taken over what it left, and a prompt answering something no tail still holds.
///
/// One claim throughout, and it is the whole point of a durable chat — nothing is
/// lost and nothing is said twice. Not by the sweep that closes out the dead host's
/// reply, not by the two folds, not by the pages the reader walks, and not by the
/// context the next run is told.
#[test]
fn a_chat_past_the_fold_bound_survives_a_dead_host_with_nothing_lost_or_doubled() {
	const IDENTIFIER: &str = "com.opennest.conversation-commands-7";
	/// Past what one checkpoint folds, so the first one cannot reach the beginning
	/// and has to say so where the summary is read.
	const HISTORY: i64 = 230;
	/// The count of messages a context carries word for word, mirrored from the host:
	/// it is what decides where every fold below stops.
	const TAIL: i64 = 20;
	const PAGE: u32 = 20;
	/// Answered by the prompt, and far enough back that neither the tail nor either
	/// fold still holds it.
	const ANSWERED: &str = "m3";
	const PROMPT: &str = "p1";
	const PROMPT_TEXT: &str = "so where does that leave the roof?";

	// The host that dies: it writes the whole history and goes without ever closing
	// the reply it was streaming.
	{
		let app = app(IDENTIFIER);
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_start_turn", a_turn(&conversation))
			.expect("the turn is started");
		for index in 1..=HISTORY {
			said(&window, &conversation, index, index != HISTORY);
		}
	}

	let app = app(IDENTIFIER);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	// What the dead host left is on the record as what it was: the words it had
	// reached, and an ending that says the stream stopped rather than one still
	// being written.
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
			"createdAt": HISTORY
		}),
		"the reply the dead host left came back as something else"
	);

	let folded = checkpoint(&window, &conversation, 1);
	assert_eq!(
		folded["lastMessageSeq"],
		json!(HISTORY - TAIL),
		"the first fold stopped somewhere other than the edge of the tail"
	);
	assert!(folded["tokenCount"].as_i64().is_some_and(|count| count > 0));

	// The prompt reaches the transcript first, and it answers a message the fold
	// could not even reach.
	call(
		&window,
		"conversation_append_user_message",
		json!({ "message": {
			"id": PROMPT,
			"conversationId": conversation,
			"turnId": TURN,
			"authorBotId": null,
			"repliedToMessageId": ANSWERED,
			"content": PROMPT_TEXT,
			"createdAt": HISTORY + 1
		}}),
	)
	.expect("the prompt is appended");

	// The second fold, the way the app takes one: before a run that was told nothing
	// is told everything, so that no stretch falls between the summary and the tail.
	let again = checkpoint(&window, &conversation, 2);
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
			"botId": "default",
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
		context.contains("The message this one replies to:\nuser: message 3"),
		"an answer to a message no fold still holds lost its target: {context}"
	);
	assert_eq!(occurrences(&context, "message 3\n"), 1, "the answered message was carried twice");
	assert_eq!(occurrences(&context, PROMPT_TEXT), 1, "the prompt was carried twice");
	assert!(context.ends_with(PROMPT_TEXT), "the prompt was not the last thing the run is told");

	// Nothing the folds read moved anything the reader can see: the transcript is
	// still every message that was ever written, once each, with the prompt at the end.
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

	cleanup(&app);
}
