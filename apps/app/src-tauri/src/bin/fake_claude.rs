//! Deterministic stand-in for the Claude Code CLI.
//!
//! Speaks the same stream-json dialect the real binary was observed to use, so
//! the transport can be exercised without the network, a subscription, or a
//! wall clock. The scenario is picked with `FAKE_CLAUDE_SCENARIO`.

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;

use serde_json::{json, Value};

const DEFAULT_SESSION: &str = "fake-session-0001";
const VERSION_LINE: &str = "2.0.0-fake (OpenNest fake)";

fn emit_raw(line: &str) {
	let stdout = std::io::stdout();
	let mut handle = stdout.lock();
	let _ = writeln!(handle, "{line}");
	let _ = handle.flush();
}

fn emit(frame: Value) {
	emit_raw(&frame.to_string());
}

fn scenario() -> String {
	std::env::var("FAKE_CLAUDE_SCENARIO").unwrap_or_else(|_| "normal".into())
}

fn session_id() -> String {
	let args: Vec<String> = std::env::args().collect();
	args.iter()
		.position(|arg| arg == "--resume")
		.and_then(|index| args.get(index + 1))
		.cloned()
		.unwrap_or_else(|| DEFAULT_SESSION.into())
}

fn resumed() -> bool {
	std::env::args().any(|arg| arg == "--resume")
}

/// A child deaf to the EOF on its stdin, so only a signal can end it. Set apart
/// from the scenarios because it composes with any of them.
fn ignores_eof() -> bool {
	std::env::var("FAKE_CLAUDE_IGNORE_EOF").is_ok()
}

/// The preflight probes run through `Command::output()`, which hands the child a
/// null stdin: they have to answer before the reader thread meets EOF.
fn preflight_answer() -> Option<String> {
	let args: Vec<String> = std::env::args().skip(1).collect();
	match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
		["--version"] => Some(VERSION_LINE.into()),
		["auth", "status"] => Some(json!({ "loggedIn": true }).to_string()),
		_ => None,
	}
}

/// Unique per process and per turn: a restored transcript and a fresh turn
/// sharing an id would let the new deltas attach to the hydrated message.
fn next_message_id() -> String {
	static TURN: AtomicU64 = AtomicU64::new(0);
	format!("msg_fake_{}_{}", std::process::id(), TURN.fetch_add(1, Ordering::Relaxed))
}

enum Incoming {
	Prompt(String),
	Initialize(String),
	Interrupt(String),
	Permission { request_id: String, allowed: bool },
}

fn read_incoming(tx: mpsc::Sender<Incoming>) {
	let stdin = std::io::stdin();
	for line in stdin.lock().lines() {
		let Ok(line) = line else { break };
		let Ok(frame) = serde_json::from_str::<Value>(&line) else { continue };

		let message = match frame["type"].as_str() {
			Some("user") => frame["message"]["content"][0]["text"]
				.as_str()
				.map(|text| Incoming::Prompt(text.to_owned())),
			Some("control_request") => {
				let request_id = frame["request_id"].as_str().unwrap_or_default().to_owned();
				match frame["request"]["subtype"].as_str() {
					Some("initialize") => Some(Incoming::Initialize(request_id)),
					Some("interrupt") => Some(Incoming::Interrupt(request_id)),
					_ => None,
				}
			}
			Some("control_response") => {
				let response = &frame["response"];
				Some(Incoming::Permission {
					request_id: response["request_id"].as_str().unwrap_or_default().to_owned(),
					allowed: response["response"]["behavior"].as_str() == Some("allow"),
				})
			}
			_ => None,
		};

		if let Some(message) = message {
			if tx.send(message).is_err() {
				return;
			}
		}
	}

	// Holding `tx` past EOF keeps the main loop waiting, which is the whole
	// point: the process outlives its own stdin.
	while ignores_eof() {
		std::thread::park();
	}
}

fn emit_init() {
	emit(json!({
		"type": "system",
		"subtype": "init",
		"session_id": session_id(),
		"cwd": "/fake"
	}));
}

fn emit_text_turn(text: &str) {
	let message_id = next_message_id();
	emit(json!({
		"type": "stream_event",
		"event": { "type": "message_start", "message": { "id": message_id, "role": "assistant" } }
	}));
	emit(json!({
		"type": "stream_event",
		"event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text", "text": "" } }
	}));
	for chunk in text.split_inclusive(' ') {
		emit(json!({
			"type": "stream_event",
			"event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": chunk } }
		}));
	}
	emit(json!({
		"type": "assistant",
		"message": { "id": message_id, "role": "assistant", "content": [{ "type": "text", "text": text }] }
	}));
}

fn emit_tool_turn() {
	emit(json!({
		"type": "stream_event",
		"event": {
			"type": "content_block_start",
			"index": 0,
			"content_block": { "type": "tool_use", "id": "toolu_fake_1", "name": "Bash", "input": {} }
		}
	}));
	emit(json!({
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
	}));
	emit(json!({
		"type": "user",
		"message": {
			"role": "user",
			"content": [{ "type": "tool_result", "tool_use_id": "toolu_fake_1", "content": "FAKE", "is_error": false }]
		}
	}));
}

fn emit_result(subtype: &str, is_error: bool) {
	emit(json!({
		"type": "result",
		"subtype": subtype,
		"is_error": is_error,
		"session_id": session_id(),
		"num_turns": 1
	}));
}

fn ack(request_id: &str) {
	emit(json!({
		"type": "control_response",
		"response": { "subtype": "success", "request_id": request_id, "response": {} }
	}));
}

/// A grandchild that only a process-group kill can reach.
fn spawn_orphan() {
	let Ok(child) = std::process::Command::new("sleep").arg("60").spawn() else { return };
	if let Ok(path) = std::env::var("FAKE_CLAUDE_PID_FILE") {
		let _ = std::fs::write(path, child.id().to_string());
	}
}

fn main() {
	if let Some(answer) = preflight_answer() {
		emit_raw(&answer);
		return;
	}

	let scenario = scenario();
	let (tx, rx) = mpsc::channel();
	std::thread::spawn(move || read_incoming(tx));

	let mut announced = false;
	let mut pending_permission: Option<String> = None;

	while let Ok(incoming) = rx.recv() {
		match incoming {
			Incoming::Initialize(request_id) => {
				if scenario == "startup_timeout" {
					continue;
				}
				if scenario == "startup_crash" {
					std::process::exit(3);
				}
				if scenario == "resume_crash" && resumed() {
					std::process::exit(4);
				}
				ack(&request_id);
			}
			Incoming::Interrupt(request_id) => {
				ack(&request_id);
				emit_result("error_during_execution", false);
			}
			Incoming::Permission { request_id, allowed } => {
				if pending_permission.as_deref() != Some(request_id.as_str()) {
					continue;
				}
				pending_permission = None;
				emit(json!({
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
				}));
				emit_result("success", false);
			}
			Incoming::Prompt(text) => {
				if !announced {
					announced = true;
					emit_init();
				}
				match scenario.as_str() {
					"crash" => {
						emit_text_turn("partial");
						std::process::exit(9);
					}
					"invalid_frames" => {
						emit_raw("this is not json");
						emit_raw("{\"type\":");
						emit_text_turn("recovered");
						emit_result("success", false);
					}
					"tool" => {
						emit_tool_turn();
						emit_text_turn("done");
						emit_result("success", false);
					}
					"permission" => {
						let request_id = "perm_fake_1".to_owned();
						pending_permission = Some(request_id.clone());
						emit(json!({
							"type": "control_request",
							"request_id": request_id,
							"request": {
								"subtype": "can_use_tool",
								"tool_name": "Write",
								"display_name": "Write",
								"description": "notes.txt",
								"input": { "file_path": "/fake/notes.txt", "content": "hello" }
							}
						}));
					}
					"slow" | "orphan" => {
						if scenario == "orphan" {
							spawn_orphan();
						}
						emit(json!({
							"type": "stream_event",
							"event": { "type": "message_start", "message": { "id": next_message_id(), "role": "assistant" } }
						}));
					}
					_ => {
						let reply = if resumed() {
							format!("resumed {} :: {text}", session_id())
						} else {
							format!("echo :: {text}")
						};
						emit_text_turn(&reply);
						emit_result("success", false);
					}
				}
			}
		}
	}
}
