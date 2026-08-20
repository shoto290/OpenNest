//! Deterministic stand-in for the agent sidecar.
//!
//! Speaks the same envelope the real sidecar does — one process, many sessions,
//! every frame naming the session it belongs to — so the transport can be
//! exercised without the network, a subscription, or a wall clock. Each session
//! picks its behaviour from `FAKE_CLAUDE_SCENARIO`, taken from the open command
//! when it carries one and from the ambient environment otherwise.

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};

const DEFAULT_SESSION: &str = "fake-session-0001";

fn emit_raw(line: &str) {
	let stdout = std::io::stdout();
	let mut handle = stdout.lock();
	let _ = writeln!(handle, "{line}");
	let _ = handle.flush();
}

fn emit(session: &str, frame: Value) {
	emit_raw(&json!({ "session": session, "frame": frame }).to_string());
}

/// Unique per process and per turn: a restored transcript and a fresh turn
/// sharing an id would let the new deltas attach to the hydrated message.
fn next_message_id() -> String {
	static TURN: AtomicU64 = AtomicU64::new(0);
	format!("msg_fake_{}_{}", std::process::id(), TURN.fetch_add(1, Ordering::Relaxed))
}

/// A grandchild that only a process-group kill can reach. It gets pipes of its
/// own, the way the real agent hands them to a stdio MCP server: inheriting this
/// process's stdout would keep it open past this process's death, and the host
/// would never see the EOF that tells it the sidecar is gone.
fn spawn_orphan(pid_file: Option<&str>) {
	let Ok(child) = std::process::Command::new("sleep")
		.arg("60")
		.stdin(std::process::Stdio::null())
		.stdout(std::process::Stdio::null())
		.stderr(std::process::Stdio::null())
		.spawn()
	else {
		return;
	};
	if let Some(path) = pid_file {
		let _ = std::fs::write(path, child.id().to_string());
	}
}

/// Stops talking without stopping: the host reads EOF on stdout, which says
/// nothing about whether the process behind it is still alive.
#[cfg(unix)]
fn close_stdout() {
	unsafe { libc::close(1) };
}

#[cfg(not(unix))]
fn close_stdout() {}

/// A sidecar no group signal can reach, which is what every rung of the shutdown
/// ladder is aimed at. It rejoins the group it was forked out of — the one group
/// certain to exist in its own session — and the group the host put it in is left
/// empty.
#[cfg(unix)]
fn escape_group() {
	if std::env::var("FAKE_CLAUDE_ESCAPE_GROUP").is_err() {
		return;
	}
	unsafe {
		let parent_group = libc::getpgid(libc::getppid());
		libc::setpgid(0, parent_group);
	}
}

#[cfg(not(unix))]
fn escape_group() {}

/// What the open command said, and the sidecar's own environment behind it: a
/// session may be told something the process it runs in was not.
fn read_setting(settings: &HashMap<String, String>, key: &str) -> Option<String> {
	settings.get(key).cloned().or_else(|| std::env::var(key).ok())
}

/// The directory a process started there reports, symlinks resolved — what the
/// real agent's own `cwd` would say.
fn as_a_child_would_see_it(path: &str) -> String {
	std::fs::canonicalize(path).map_or_else(|_| path.to_owned(), |real| real.display().to_string())
}

/// The scenario a caller can change between two sessions of one process. The
/// sidecar's own environment is fixed at spawn, so a file is the only place a
/// later session can be told to behave differently from the one before it.
fn scenario_on_file(path: Option<&str>) -> Option<String> {
	let named = std::fs::read_to_string(path?).ok()?.trim().to_owned();
	(!named.is_empty()).then_some(named)
}

/// A sidecar deaf to the EOF on its stdin, so only a signal can end it.
fn ignores_eof() -> bool {
	std::env::var("FAKE_CLAUDE_IGNORE_EOF").is_ok()
}

/// What one open command asked for, and the behaviour it picked.
struct Run {
	settings: HashMap<String, String>,
	scenario: String,
	partial_messages: bool,
	resumed: bool,
	session_id: String,
	instructions: String,
	cwd: String,
	announced: bool,
	pending_permission: Option<String>,
}

impl Run {
	fn open(command: &Value) -> Self {
		let settings: HashMap<String, String> = command["env"]
			.as_object()
			.map(|named| {
				named
					.iter()
					.filter_map(|(key, value)| {
						value.as_str().map(|value| (key.clone(), value.to_owned()))
					})
					.collect()
			})
			.unwrap_or_default();
		let setting = |key: &str| read_setting(&settings, key);
		let resume = command["resume"].as_str().map(str::to_owned);
		let scenario = settings
			.get("FAKE_CLAUDE_SCENARIO")
			.cloned()
			.or_else(|| scenario_on_file(setting("FAKE_CLAUDE_SCENARIO_FILE").as_deref()))
			.or_else(|| std::env::var("FAKE_CLAUDE_SCENARIO").ok())
			.unwrap_or_else(|| "normal".into());
		if setting("FAKE_CLAUDE_ORPHAN_AT_STARTUP").is_some() {
			spawn_orphan(setting("FAKE_CLAUDE_PID_FILE").as_deref());
		}
		Self {
			scenario,
			partial_messages: command["partialMessages"].as_bool().unwrap_or(false),
			resumed: resume.is_some(),
			session_id: resume.unwrap_or_else(|| DEFAULT_SESSION.into()),
			instructions: command["appendSystemPrompt"].as_str().unwrap_or("none").to_owned(),
			cwd: as_a_child_would_see_it(command["cwd"].as_str().unwrap_or_default()),
			announced: false,
			pending_permission: None,
			settings,
		}
	}

	fn setting(&self, key: &str) -> Option<String> {
		read_setting(&self.settings, key)
	}

	/// What the host opened this session as, in the session's own words.
	fn identity(&self) -> String {
		format!("system<{}> cwd<{}>", self.instructions, self.cwd)
	}
}

fn emit_init(key: &str, run: &Run) {
	emit(
		key,
		json!({
			"type": "system",
			"subtype": "init",
			"session_id": run.session_id,
			"cwd": "/fake"
		}),
	);
}

/// Deltas only when the session was opened asking for them. A host whose sidecar
/// never announced `partialMessages` is answered the way one without the
/// capability answers: the whole message, once.
fn emit_text_turn(key: &str, run: &Run, text: &str) {
	let message_id = next_message_id();
	if run.partial_messages {
		emit(
			key,
			json!({
				"type": "stream_event",
				"event": { "type": "message_start", "message": { "id": message_id, "role": "assistant" } }
			}),
		);
		emit(
			key,
			json!({
				"type": "stream_event",
				"event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text", "text": "" } }
			}),
		);
		for chunk in text.split_inclusive(' ') {
			emit(
				key,
				json!({
					"type": "stream_event",
					"event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": chunk } }
				}),
			);
		}
	}
	emit(
		key,
		json!({
			"type": "assistant",
			"message": { "id": message_id, "role": "assistant", "content": [{ "type": "text", "text": text }] }
		}),
	);
}

fn emit_tool_turn(key: &str) {
	emit(
		key,
		json!({
			"type": "stream_event",
			"event": {
				"type": "content_block_start",
				"index": 0,
				"content_block": { "type": "tool_use", "id": "toolu_fake_1", "name": "Bash", "input": {} }
			}
		}),
	);
	emit(
		key,
		json!({
			"type": "assistant",
			"message": {
				"id": "msg_fake_2",
				"role": "assistant",
				"content": [{
					"type": "tool_use",
					"id": "toolu_fake_1",
					"name": "Bash",
					"input": { "command": "echo FAKE", "description": "Echo FAKE" }
				}]
			}
		}),
	);
	emit(
		key,
		json!({
			"type": "user",
			"message": {
				"role": "user",
				"content": [{ "type": "tool_result", "tool_use_id": "toolu_fake_1", "content": "FAKE", "is_error": false }]
			}
		}),
	);
}

fn emit_result(key: &str, run: &Run, subtype: &str, is_error: bool) {
	emit(
		key,
		json!({
			"type": "result",
			"subtype": subtype,
			"is_error": is_error,
			"session_id": run.session_id,
			"num_turns": 1
		}),
	);
}

fn emit_closed(key: &str, detail: &str) {
	emit(key, json!({ "type": "closed", "detail": detail }));
}

/// The open handshake, and every way a scenario refuses one. A session that is
/// never opened is never answered either: the host's own startup timeout is what
/// ends it.
fn on_open(key: &str, runs: &mut HashMap<String, Run>, command: &Value) {
	let mut run = Run::open(command);

	match run.scenario.as_str() {
		"startup_timeout" => return,
		"startup_crash" => return emit_closed(key, "the agent exited during startup"),
		"resume_crash" if run.resumed => {
			return emit_closed(key, "the agent exited during startup")
		}
		"resume_timeout" if run.resumed => return,
		"resume_timeout_then_crash" => {
			if run.resumed {
				return;
			}
			return emit_closed(key, "the agent exited during startup");
		}
		"slow_open" => {
			// Long enough for a quit to land inside the open it is racing.
			std::thread::sleep(std::time::Duration::from_millis(600));
		}
		"early_init" => {
			run.announced = true;
			emit_init(key, &run);
		}
		_ => {}
	}

	emit(key, json!({ "type": "opened" }));
	runs.insert(key.to_owned(), run);
}

fn on_prompt(key: &str, runs: &mut HashMap<String, Run>, text: &str) {
	let Some(run) = runs.get_mut(key) else { return };
	if !run.announced {
		run.announced = true;
		emit_init(key, run);
	}

	let mut dropped = false;
	match run.scenario.clone().as_str() {
		"crash" => {
			emit_text_turn(key, run, "partial");
			emit_closed(key, "the agent exited unexpectedly");
			dropped = true;
		}
		"stdout_eof" => close_stdout(),
		"sidecar_exit" => {
			emit_text_turn(key, run, "partial");
			std::process::exit(9);
		}
		"invalid_frames" => {
			emit(key, json!({ "no_type_at_all": true }));
			emit(key, json!({ "type": "control_request", "request": {} }));
			emit_text_turn(key, run, "recovered");
			emit_result(key, run, "success", false);
		}
		"identity" => {
			let spoken = run.identity();
			emit_text_turn(key, run, &spoken);
			emit_result(key, run, "success", false);
		}
		"tool" => {
			emit_tool_turn(key);
			emit_text_turn(key, run, "done");
			emit_result(key, run, "success", false);
		}
		"permission" => {
			let request_id = format!("perm_fake_{key}");
			run.pending_permission = Some(request_id.clone());
			emit(
				key,
				json!({
					"type": "control_request",
					"request_id": request_id,
					"request": {
						"subtype": "can_use_tool",
						"tool_name": "Write",
						"display_name": "Write",
						"description": "notes.txt",
						"input": { "file_path": "/fake/notes.txt", "content": "hello" }
					}
				}),
			);
		}
		"slow" | "orphan" => {
			if run.scenario == "orphan" {
				spawn_orphan(run.setting("FAKE_CLAUDE_PID_FILE").as_deref());
			}
			emit(
				key,
				json!({
					"type": "stream_event",
					"event": { "type": "message_start", "message": { "id": next_message_id(), "role": "assistant" } }
				}),
			);
		}
		_ => {
			let reply = if run.resumed {
				format!("resumed {} :: {text}", run.session_id)
			} else {
				format!("echo :: {text}")
			};
			emit_text_turn(key, run, &reply);
			emit_result(key, run, "success", false);
		}
	}
	if dropped {
		runs.remove(key);
	}
}

fn on_interrupt(key: &str, runs: &HashMap<String, Run>) {
	let Some(run) = runs.get(key) else { return };
	emit_result(key, run, "error_during_execution", false);
}

fn on_permission(key: &str, runs: &mut HashMap<String, Run>, command: &Value) {
	let Some(run) = runs.get_mut(key) else { return };
	let request_id = command["requestId"].as_str().unwrap_or_default();
	if run.pending_permission.as_deref() != Some(request_id) {
		return;
	}
	run.pending_permission = None;
	let allowed = command["decision"]["behavior"].as_str() == Some("allow");
	emit(
		key,
		json!({
			"type": "user",
			"message": {
				"role": "user",
				"content": [{
					"type": "tool_result",
					"tool_use_id": "toolu_fake_perm",
					"content": if allowed { "written" } else { "User denied this action." },
					"is_error": !allowed
				}]
			}
		}),
	);
	emit_result(key, run, "success", false);
}

fn serve() {
	emit_raw(
		&json!({
			"type": "ready",
			"provider": "fake",
			"version": "2.0.0-fake",
			"sdkVersion": "0.0.0-fake",
			"capabilities": capabilities()
		})
		.to_string(),
	);

	let mut runs: HashMap<String, Run> = HashMap::new();
	let stdin = std::io::stdin();
	for line in stdin.lock().lines() {
		let Ok(line) = line else { break };
		let Ok(command) = serde_json::from_str::<Value>(&line) else { continue };
		let Some(key) = command["session"].as_str().map(str::to_owned) else { continue };

		match command["type"].as_str() {
			Some("open") => on_open(&key, &mut runs, &command),
			Some("prompt") => on_prompt(&key, &mut runs, command["text"].as_str().unwrap_or("")),
			Some("interrupt") => on_interrupt(&key, &runs),
			Some("permission") => on_permission(&key, &mut runs, &command),
			Some("close") => {
				runs.remove(&key);
			}
			_ => {}
		}
	}

	// Holding past EOF is the whole point: the process outlives its own stdin.
	while ignores_eof() {
		std::thread::park();
	}
}

/// What this build announces it can do. Narrowed with `FAKE_CLAUDE_CAPABILITIES`
/// so a test can prove the host stops asking for what a sidecar never offered.
fn capabilities() -> Vec<String> {
	std::env::var("FAKE_CLAUDE_CAPABILITIES")
		.map(|named| {
			named.split(',').filter(|name| !name.is_empty()).map(str::to_owned).collect()
		})
		.unwrap_or_else(|_| {
			["partialMessages", "resume", "interactivePermissions", "modelCatalogue"]
				.iter()
				.map(|name| (*name).to_owned())
				.collect()
		})
}

fn main() {
	escape_group();

	if !std::env::args().any(|argument| argument == "--serve") {
		eprintln!("usage: fake_sidecar --serve");
		std::process::exit(64);
	}
	serve();
}
