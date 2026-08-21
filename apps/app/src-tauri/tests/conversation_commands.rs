//! The conversation commands as the frontend meets them: over IPC, in JSON.
//!
//! What the repository tests around the database cannot see is exactly what fails
//! here — a command left out of the registry, an argument the frontend spells
//! another way, a field renamed on the way out, a refusal flattened into a string.
//! Every call below goes through `get_ipc_response`, so what is asserted is the
//! JSON itself and not a Rust value that happens to serialize.
//!
//! The database is the real one, opened through `db::bootstrap` the way the launch
//! opens it. The identifier decides the app data directory, so every test takes a
//! `Home` of its own rather than writing where a real install would — or where its
//! neighbour is reading — and gets it back off the disk however it ends.

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
/// The one bot whose id this side knows before it is written: the host seats it
/// itself, under a fixed id, so a message can name its author as a constant.
const BOT: &str = "default";

/// One test's application data directory: an identifier no run and no neighbour
/// claims twice, and the directory it resolves to taken away when the test ends —
/// returned from or panicked out of, since `Drop` runs either way. Where the
/// identifier lands is read from the resolver the commands read it from, rather
/// than rebuilt from platform rules. The test holds it rather than a host, so every
/// relaunch below comes back to the same directory.
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

	/// The host as it launches: the same `bootstrap`, resolved from the same app
	/// handle, and the outcome managed whole. `lib.rs` runs it from the setup hook
	/// because only a built app carries the identifier the data directory comes from —
	/// and the hook fires with the event loop, which `MockRuntime` never starts, so
	/// here it runs immediately after the build instead.
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

/// Built and no further: it carries the identifier every path below is resolved
/// from, and without a database under it nothing has touched the disk yet.
fn host(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds")
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

/// The bot and the id of the one chat it holds. Nothing is seeded at launch any
/// more, so the seat comes from asking for the chat of the one bot whose id the host
/// writes itself — the path the legacy import takes on an install that predates the
/// roster — and the roster is read back for the row that left. A fixed id is what
/// lets every message below name its author without threading one through.
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

/// The same message, pointed at the one it answers. `repliedToMessageId` is the
/// only field a prompt adds to a plain one, and the shape stays spelled once.
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

/// A reply as the transport writes one before it ends: opened empty and streamed
/// into. Left exactly there is what a host dying under a stream leaves behind, so
/// the ending belongs to the caller and not here. Answers the id it wrote under.
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

/// One message under an id the assertions can name, alternating speakers so a
/// rebuilt tail reads as a conversation rather than a monologue.
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

/// The run the frontend opens against the durable lineage before it asks for a
/// process. No `reason`: it is the caller's word for the run this one replaces, and
/// nothing here has a policy to describe.
fn a_run(conversation_id: &str, bot: &Value, started_at: i64) -> Value {
	json!({ "conversationId": conversation_id, "botId": bot["id"], "startedAt": started_at })
}

/// The name the provider gave the process answering in a run, addressed to that
/// run and to the participant holding it. Claude's id travels here and nowhere
/// else: the run keeps its own id, which no caller may name it by out there.
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

/// The fold the app takes before a run depends on one. `null` comes back when
/// there was nothing new to fold, which is an answer rather than a failure.
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
		call(&window, "conversation_main_chat", json!({ "botId": BOT })),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

/// A whole turn written the way the frontend will write one, then read back as the
/// page it displays: both roles, a streamed reply closed at its ending, oldest
/// first, and every field under the name the reader expects.
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

/// The id the child announces, over the boundary the frontend really crosses. The
/// lineage rules are the repository's and are proven there; what can only fail here
/// is the crossing — the command registered, the four words the frontend spells its
/// arguments with, and a refusal reaching the reader as the storage failure it is.
///
/// The whole callback is walked because each answer means something different to
/// the caller: the live run takes the id, the same callback again is the one write
/// it already was, a second different id is refused, and a run that has been
/// replaced takes nothing — least of all onto the run that replaced it, which is
/// still free to record its own. A run named under another bot is refused for the
/// same reason: an id landing there would file a process under a participant that
/// never ran it.
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

/// The same scope, across the crash that ended the run before it. A host that died
/// left its run `active` on the record, and the next launch has to step over that
/// row rather than start the lineage again — a `seq` back at 1 would give the run
/// answering now the very name a caller from before the crash is still holding, and
/// every refusal the scope buys would land on the wrong process.
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

/// A run cannot be opened for a bot the conversation does not hold, and the
/// refusal has to reach the frontend as the storage failure it is: a launch that
/// meets a string here has nothing to say about why it never got a scope.
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

/// The read a long chat is opened with, over the boundary the cursor crosses:
/// the newest page first, then the one before it, named by the lowest `seq` the
/// reader already holds. A gap or a repeat here is a message the user never sees
/// or sees twice.
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

/// The two rules the repositories hold, seen from the other side of the boundary.
/// Both carry what disagreed, because a caller that may have replayed an event has
/// no other way to tell its own duplicate from two events claiming one place.
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

/// The launch the app now boots on, at the boundary it really crosses. One host
/// writes a transcript longer than the snapshot the old store kept whole, and is
/// gone before the next one opens the file it left — nothing is carried over in
/// memory. What the reader can reach afterwards is every message of it, in the
/// crossings the frontend pages with, each exactly once.
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

	let home = Home::new();

	// The host that dies: it writes the whole history and goes under the last reply,
	// which is left open exactly as it was being streamed.
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

	let folded = checkpoint(&window, &conversation, &bot, 1);
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
		an_answer_to(ANSWERED, PROMPT, &conversation, PROMPT_TEXT, HISTORY + 1),
	)
	.expect("the prompt is appended");

	// The second fold, the way the app takes one: before a run that was told nothing
	// is told everything, so that no stretch falls between the summary and the tail.
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
}

/// An identity as the frontend submits one. Spelled here in JSON rather than
/// built from a Rust type, because what is under test is exactly the crossing: a
/// field the host reads under another name is a bot created with half a face.
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
		"changesNothing": false
	})
}

/// The whole of a bot's life over IPC: created with a chat of its own, listed,
/// described again, and deleted with everything said in it. The chat is what
/// makes a created bot immediately a thread the frontend can open, so it is
/// asked for rather than assumed.
#[test]
fn a_bot_created_over_ipc_is_listed_described_and_deleted_with_its_chat() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "owl", json!("coral")) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["name"], json!("Nyx"));
	assert_eq!(created["title"], json!("Reviewer"));
	assert_eq!(created["model"], json!("sonnet"));
	assert_eq!(created["avatarAnimal"], json!("owl"));
	assert_eq!(created["avatarBlot"], json!("coral"));
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

/// The boundary is where a closed vocabulary is checked, not the file: a word
/// outside one fails to parse, so the command is never entered and no bot is
/// written. What the caller gets back is Tauri's own account of the argument it
/// could not read — the point being that nothing landed, in either of the two.
///
/// The face is closed and the model is not, which is the whole distinction: the
/// engine draws eight animals and the palette holds eight colours, and a ninth of
/// either is a bot the UI could not show, while what a model may be called belongs
/// to Claude Code and nothing here can list it.
#[test]
fn a_face_outside_the_closed_vocabulary_is_refused_before_it_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let animal = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", "dragon", json!("coral")) }),
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

/// A model label this build has never heard of, stored and read back as it was
/// given. There is no listing to check it against — no `claude models`, and the
/// init frame only names the model already answering — so a label the host refused
/// would be a bot the provider could run and this app could not describe. An alias
/// the product does not offer yet and a versioned name a user pasted are the same
/// case, and both survive the round trip.
#[test]
fn a_model_label_outside_the_offered_aliases_is_stored_and_read_back_whole() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "claude-opus-4-1-20250805", "owl", json!("coral")) }),
	)
	.expect("a bot on a label the host does not know");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["model"], json!("claude-opus-4-1-20250805"));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["model"].clone()),
		Ok(json!("claude-opus-4-1-20250805")),
		"a label the file holds came back changed"
	);

	// And it is still a field a caller replaces whole, alias or not.
	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({ "id": id, "identity": an_identity("Nyx", "fable", "owl", json!("coral")) })
		)
		.map(|bot| bot["model"].clone()),
		Ok(json!("fable"))
	);
}

/// A bot set to change nothing, over IPC and back: the setting is submitted with
/// the rest of the identity, it is read back from the agent file the session is
/// promoted onto, and turning it off leaves no denial behind. The file is the
/// answer, not the row — a caller that saw "on" over a file naming no denial would
/// be telling a reader the bot is held back while it is not.
#[test]
fn a_bot_set_to_change_nothing_is_denied_in_its_agent_file_and_read_back_from_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut held_back = an_identity("Nyx", "sonnet", "owl", json!("coral"));
	held_back["changesNothing"] = json!(true);

	let created = call(&window, "conversation_create_bot", json!({ "identity": held_back }))
		.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["changesNothing"], json!(true));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["changesNothing"].clone()),
		Ok(json!(true)),
		"the file the session is promoted onto denies nothing"
	);

	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({
				"id": id,
				"identity": an_identity("Nyx", "sonnet", "owl", json!("coral"))
			})
		)
		.map(|bot| bot["changesNothing"].clone()),
		Ok(json!(false)),
		"a denial outlived the setting that asked for it"
	);
}

/// The one refusal a caller can act on: the list it is holding is behind the
/// file. Both writes have to say it, and the second delete is the honest case —
/// the bot really is gone, and saying so is not the same as saying it worked.
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

/// The avatar directory as the host resolves it, from the same app handle the
/// commands resolve it from: an assertion built on any other path would prove
/// something about this test rather than about where pictures go.
fn avatar_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("avatars")
}

/// What is in that directory, sorted. Absent counts as empty: nothing has stored a
/// picture yet, which is the same fact as nothing being left behind.
fn stored_avatars(app: &App<MockRuntime>) -> Vec<String> {
	let Ok(entries) = std::fs::read_dir(avatar_dir(app)) else {
		return Vec::new();
	};
	let mut names: Vec<String> =
		entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
	names.sort();
	names
}

/// Built rather than checked in, so the bytes and the decoder that has to read them
/// cannot drift apart. Deliberately not square and not 512: what is asserted on the
/// far side is that the host squared and resized it, not that it copied a file.
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

/// The upload as the frontend sends it: `Uint8Array` reaches the host as a JSON
/// array of numbers, so the crossing is spelled that way here too.
fn an_upload(id: &str, bytes: &[u8]) -> Value {
	json!({ "id": id, "bytes": bytes })
}

fn a_bot(window: &WebviewWindow<MockRuntime>, name: &str) -> String {
	call(
		window,
		"conversation_create_bot",
		json!({ "identity": an_identity(name, "sonnet", "owl", json!("coral")) }),
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

/// The whole point of the feature, over IPC: bytes in, one normalised file beside
/// the database, and a path the webview can be pointed at. The stored file is
/// decoded rather than measured, because "512×512 png" is what the UI is allowed to
/// assume and a copy of the upload would have satisfied every other assertion here.
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

/// A jpeg goes in and a png comes out, which is the whole of what "every avatar
/// renders identically" costs the UI: it never learns what was uploaded.
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

/// The acceptance the whole ordering exists for: nothing this host refuses may leave
/// a file in that directory or a path on the bot. Three refusals, three reasons, and
/// the same nothing behind each of them.
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

/// The limit, on the path a user actually crosses. Asserted here and not only in
/// the unit around `normalised` because the number is part of the contract: the UI
/// tells the user what it is by reading it off this refusal.
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

/// Exactly one file, not two. The new picture is written before the old one is
/// swept, so this also proves the sweep took the right one — a sweep reading the
/// table a moment too early would have taken the new one.
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

/// A bot is thrown away with everything it wore. The other bot's picture is in the
/// same directory on purpose: a sweep that answered "delete everything" would pass
/// the first assertion and fail this one.
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

/// Putting an animal back on is an identity write with no path, and the file goes
/// with it. Echoing the path back is the other half of the same rule and the one a
/// frontend does on every unrelated edit — it must keep the picture, not re-upload it.
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

	let mut echoed = an_identity("Nyx", "sonnet", "owl", json!("coral"));
	echoed["avatarImagePath"] = json!(worn);
	let unchanged =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": echoed }))
			.expect("the bot is updated");

	assert_eq!(unchanged["avatarImagePath"], json!(worn), "an unrelated edit dropped the picture");
	assert!(Path::new(&worn).exists(), "an unrelated edit swept the picture");

	let bare = call(
		&window,
		"conversation_update_bot",
		json!({ "id": id, "identity": an_identity("Nyx", "sonnet", "owl", json!("coral")) }),
	)
	.expect("the bot is updated");

	assert_eq!(bare["avatarImagePath"], json!(null));
	assert_eq!(stored_avatars(&app), Vec::<String>::new(), "the picture taken off stayed on disk");
}

/// A path is a column until something says it names a file in the one directory the
/// host serves from. The file outside is left exactly as it was — the point is that
/// it is refused rather than read, and rather than swept.
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
		let mut identity = an_identity("Nyx", "sonnet", "owl", json!("coral"));
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

/// What an install whose data directory moved leaves behind: a row naming a file
/// that is not there. The bot comes back with no picture, which is the animal, and
/// nothing about the read fails.
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

/// A picture is written for a bot that exists or for nobody. The column write is
/// what refuses, and it runs before the bytes do — so an upload naming a bot that is
/// gone leaves the directory as empty as it found it.
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

/// A host with no database refuses an upload the way it refuses every other write,
/// and refuses it before it has anywhere to write: the picture is normalised in
/// memory, so nothing is on the disk to take back.
#[test]
fn a_host_without_a_database_refuses_an_upload_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(BOT, &a_png(20, 20))),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

/// The launch as it now opens: it reads the roster and seeds nothing. A fresh
/// install answers with no bots, a bot created is the only reason there is one, and
/// deleting the last one leaves a host that comes back up empty — which is the whole
/// of the empty state being real. A launch that insisted on a bot would write the
/// shipped one back here, and a user would find the bot they deleted alive again.
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

/// The attachments directory as the host resolves it, from the same app handle the
/// command resolves it from — see [`avatar_dir`] for why it is not spelled out.
fn attachment_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("attachments")
}

/// A bot created here and the id of the one chat it holds, which is the
/// conversation attachments hang off. Its sibling [`a_bot_and_its_chat`] answers
/// for the one bot the host writes itself; this one is for the bots a test creates,
/// and it hands back both ids because deleting a bot is asserted on what happens to
/// its conversation.
fn a_new_bot_and_its_chat(window: &WebviewWindow<MockRuntime>, name: &str) -> (String, String) {
	let id = a_bot(window, name);
	let conversation_id = call(window, "conversation_main_chat", json!({ "botId": id }))
		.expect("the chat")["id"]
		.as_str()
		.expect("the chat holds an id")
		.to_owned();
	(id, conversation_id)
}

/// The submission as the frontend sends it: `Uint8Array` reaches the host as a
/// JSON array of numbers, so the crossing is spelled that way here too.
fn an_attachment(name: &str, bytes: &[u8]) -> Value {
	json!({ "name": name, "bytes": bytes })
}

/// One file stored for a conversation, answered as the path it took — the shape
/// every assertion about what a deletion sweeps is built on.
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

/// The whole point of the feature, over IPC: bytes in, files under the
/// conversation, and absolute paths back — which is the only form an attachment
/// reaches Claude in. The name a user's file carried is submitted as a path on
/// purpose: what comes back must be inside the conversation's directory anyway.
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

/// A conversation the file does not hold is refused before anything reaches the
/// disk, which is what keeps files from accumulating under an id nothing will ever
/// sweep — the directory is not even made. A real conversation is seated beside it
/// so what is refused is the id rather than an empty table.
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

/// A bot is thrown away with everything attached to what was said to it. The other
/// bot's conversation is in the same directory on purpose: a sweep that answered
/// "delete everything" would pass the first assertion and fail the second.
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

/// What a session announced, kept where the next launch finds it. The commands only
/// ever reach this side once a session is up and a session is only started by a
/// prompt, so what crosses here is what the composer offers a bot nobody has spoken
/// to yet: the last list named, replaced whole by the next one, and nothing at all
/// for a bot no session has ever answered for.
///
/// The first list is written as bare names, which is what a list stored before
/// descriptions were asked for holds: it still reads, as commands nothing is said
/// about.
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

/// A bot's skills as the frontend meets them: written, listed, marked, unmarked and
/// taken away over IPC, in the words a panel will spell. Nothing about a skill is in
/// the database — the bundle on the disk is the whole record — so this is also the
/// only place the surface can be seen answering at all.
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

	let listed =
		call(&window, "conversation_bot_skills", json!({ "botId": BOT })).expect("the skills");
	assert_eq!(listed, json!([created]));

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
			"draft": { "name": "Baking", "description": "Bread.", "body": "Bake at 240 degrees." },
		}),
	)
	.expect("the skill is rewritten");
	assert_eq!(updated["name"], json!("Baking"));
	assert_eq!(updated["body"], json!("Bake at 240 degrees."));
	assert_eq!(updated["isPreloaded"], json!(true), "an edit dropped the mark");

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

	assert_eq!(
		call(&window, "conversation_bot_skills", json!({ "botId": BOT })).expect("the skills"),
		json!([])
	);
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

/// Where the bot's bundle sits, resolved the way the host resolves it rather than
/// spelled again here.
fn bundle_of(app: &App<MockRuntime>) -> PathBuf {
	let root = bundles::root(app.handle()).expect("the bundle root");
	bundles::dir(&root, BOT)
}

/// A JSON file off the disk, or `null` for one that is not there — which is how the
/// absence of the server file is asserted beside its contents.
fn json_at(path: &Path) -> Value {
	std::fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or(Value::Null)
}

/// A bot's MCP servers as the frontend meets them: written, listed, replaced and
/// taken away over IPC. Nothing about a server is in the database — the bundle on
/// the disk is the whole record — so the file itself is read alongside every call,
/// since it is what the agent will really be started on.
#[test]
fn a_bots_mcp_servers_are_written_listed_replaced_and_taken_away() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_bot_and_its_chat(&window);
	let bundle = bundle_of(&app);
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

	// The manifest points at the file, which is what has the agent load it with the
	// bundle at all.
	assert_eq!(json_at(&manifest)["mcpServers"], json!("./.mcp.json"));

	// A reader put a key of their own in the file. It is not this app's to carry away
	// on the next write, and neither is the server it is not about.
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

	// A configuration that is not a map is refused before anything is written, and
	// the refusal says what shape was wrong without carrying what was offered — a
	// configuration is a command to run and an environment that often holds a token.
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

	call(
		&window,
		"conversation_delete_bot_mcp_server",
		json!({ "botId": BOT, "name": "atlas" }),
	)
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

	// The last one going leaves the reader's own key behind and nothing of this
	// module's — not an empty map, and not a manifest pointing at a map that is gone.
	call(
		&window,
		"conversation_delete_bot_mcp_server",
		json!({ "botId": BOT, "name": "ledger" }),
	)
	.expect("the last server is taken away");
	let bare = json_at(&servers);
	assert_eq!(bare["mcpServers"], Value::Null);
	assert_eq!(bare["opennestIsNotToTouchThis"], json!(true));

	// And with the reader's key taken out by hand too, the file itself goes rather
	// than sitting there declaring nothing.
	std::fs::write(&servers, json!({ "mcpServers": { "atlas": atlas } }).to_string())
		.expect("a file with nothing but servers in it");
	call(
		&window,
		"conversation_delete_bot_mcp_server",
		json!({ "botId": BOT, "name": "atlas" }),
	)
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
