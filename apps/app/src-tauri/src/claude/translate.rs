//! Turns Claude Code wire frames into the stable OpenNest contract.
//!
//! This is the only place aware of both vocabularies. Everything crossing to
//! React is rebuilt here: no raw frame, no raw tool input, no usage or cost
//! payload leaves this module.

use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use super::redact;
use super::contract::{
	ActivityEvent, ActivityKind, ActivityStatus, ChatMessage, ClaudeEvent, MessageCompletion,
	MessageRole, PermissionRequest, TurnEnded, TurnOutcome,
};
use super::protocol::{
	ContentBlock, ContentDelta, ControlRequestBody, Frame, StreamEvent,
};

fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|elapsed| elapsed.as_millis() as i64)
		.unwrap_or_default()
}

fn string_field(input: &Value, key: &str) -> Option<String> {
	input.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn path_label(input: &Value) -> Option<String> {
	let raw = string_field(input, "file_path").or_else(|| string_field(input, "path"))?;
	let path = Path::new(&raw);
	Some(
		path.file_name()
			.map_or_else(|| redact::path(path), |name| name.to_string_lossy().into_owned()),
	)
}

fn tool_title(name: &str, input: &Value) -> String {
	let detail = string_field(input, "description")
		.or_else(|| path_label(input))
		.or_else(|| string_field(input, "pattern"))
		.or_else(|| string_field(input, "query"));

	match detail {
		Some(detail) if !detail.is_empty() => format!("{name} · {detail}"),
		_ => name.to_owned(),
	}
}

/// Every branch goes through the redaction rule, including the shell command —
/// which mentions the user's home directory as often as a path does.
fn permission_detail(name: &str, input: &Value) -> Option<String> {
	let raw = match name {
		"Bash" => string_field(input, "command")?,
		_ => string_field(input, "file_path").or_else(|| string_field(input, "path"))?,
	};
	Some(redact::text(&raw))
}

#[derive(Debug, Default)]
pub struct Translator {
	session_id: Option<String>,
	resumed: bool,
	streaming_message: Option<String>,
	cancelling: bool,
	pending_permissions: HashMap<String, Value>,
	activity_titles: HashMap<String, String>,
}

impl Translator {
	pub fn new(resumed: bool) -> Self {
		Self { resumed, ..Self::default() }
	}

	pub fn session_id(&self) -> Option<&str> {
		self.session_id.as_deref()
	}

	pub fn mark_cancelling(&mut self) {
		self.cancelling = true;
	}

	/// The raw tool input Claude asked about, kept so an approval can echo it
	/// back verbatim. Removed from the map once answered.
	pub fn take_permission_input(&mut self, request_id: &str) -> Option<Value> {
		self.pending_permissions.remove(request_id)
	}

	pub fn ingest(&mut self, frame: Frame) -> Vec<ClaudeEvent> {
		match frame {
			Frame::System(system) => self.on_system(system.subtype.as_deref(), system.session_id),
			Frame::StreamEvent(frame) => frame.event.map(|event| self.on_stream(event)).unwrap_or_default(),
			Frame::Assistant(frame) => {
				frame.message.map(|body| self.on_assistant(body.content)).unwrap_or_default()
			}
			Frame::User(frame) => {
				frame.message.map(|body| self.on_user(body.content)).unwrap_or_default()
			}
			Frame::Result(result) => {
				if let Some(id) = result.session_id.clone() {
					self.session_id.get_or_insert(id);
				}
				self.on_result(result.subtype.as_deref(), result.is_error)
			}
			Frame::ControlRequest(request) => self.on_control_request(request.request_id, request.request),
			Frame::ControlResponse(_) | Frame::Ignored => Vec::new(),
		}
	}

	fn on_system(&mut self, subtype: Option<&str>, session_id: Option<String>) -> Vec<ClaudeEvent> {
		let Some(session_id) = session_id else {
			return Vec::new();
		};
		if subtype != Some("init") || self.session_id.is_some() {
			return Vec::new();
		}
		self.session_id = Some(session_id.clone());
		vec![ClaudeEvent::SessionReady { session_id, resumed: self.resumed }]
	}

	fn on_stream(&mut self, event: StreamEvent) -> Vec<ClaudeEvent> {
		match event {
			StreamEvent::MessageStart { message } => {
				let id = message.and_then(|header| header.id).unwrap_or_else(new_id);
				self.streaming_message = Some(id.clone());
				vec![ClaudeEvent::MessageStarted {
					message: ChatMessage {
						id,
						role: MessageRole::Assistant,
						text: String::new(),
						completion: MessageCompletion::Streaming,
						timestamp: now_ms(),
					},
				}]
			}
			StreamEvent::ContentBlockDelta { delta: Some(ContentDelta::TextDelta { text }) } => self
				.streaming_message
				.clone()
				.map(|id| vec![ClaudeEvent::MessageDelta { id, text }])
				.unwrap_or_default(),
			StreamEvent::ContentBlockStart { content_block: Some(ContentBlock::ToolUse { id, name, input }) } => {
				vec![self.tool_started(id, &name, &input)]
			}
			_ => Vec::new(),
		}
	}

	fn tool_started(&mut self, id: String, name: &str, input: &Value) -> ClaudeEvent {
		let title = tool_title(name, input);
		self.activity_titles.insert(id.clone(), title.clone());
		ClaudeEvent::Activity {
			activity: ActivityEvent { id, title, kind: ActivityKind::Tool, status: ActivityStatus::Running },
		}
	}

	fn on_user(&mut self, content: Vec<ContentBlock>) -> Vec<ClaudeEvent> {
		content
			.into_iter()
			.filter_map(|block| match block {
				ContentBlock::ToolResult { tool_use_id, is_error } => Some(ClaudeEvent::Activity {
					activity: ActivityEvent {
						title: self.activity_titles.remove(&tool_use_id).unwrap_or_default(),
						id: tool_use_id,
						kind: ActivityKind::Tool,
						status: if is_error { ActivityStatus::Failed } else { ActivityStatus::Succeeded },
					},
				}),
				_ => None,
			})
			.collect()
	}

	fn on_assistant(&mut self, content: Vec<ContentBlock>) -> Vec<ClaudeEvent> {
		let mut events = Vec::new();
		let mut text = String::new();

		for block in content {
			match block {
				ContentBlock::Text { text: chunk } => text.push_str(&chunk),
				ContentBlock::ToolUse { id, name, input } => {
					events.push(self.tool_started(id, &name, &input))
				}
				_ => {}
			}
		}

		if !text.is_empty() {
			let id = self.streaming_message.take().unwrap_or_else(new_id);
			events.push(ClaudeEvent::MessageCompleted {
				message: ChatMessage {
					id,
					role: MessageRole::Assistant,
					text,
					completion: MessageCompletion::Complete,
					timestamp: now_ms(),
				},
			});
		}

		events
	}

	fn on_result(&mut self, subtype: Option<&str>, is_error: bool) -> Vec<ClaudeEvent> {
		let outcome = if self.cancelling {
			TurnOutcome::Cancelled
		} else if is_error || subtype.is_some_and(|subtype| subtype != "success") {
			TurnOutcome::Failed
		} else {
			TurnOutcome::Completed
		};

		let mut events = Vec::new();
		if let Some(id) = self.streaming_message.take() {
			events.push(ClaudeEvent::MessageCompleted {
				message: ChatMessage {
					id,
					role: MessageRole::Assistant,
					text: String::new(),
					completion: match outcome {
						TurnOutcome::Cancelled => MessageCompletion::Cancelled,
						TurnOutcome::Failed => MessageCompletion::Failed,
						TurnOutcome::Completed => MessageCompletion::Complete,
					},
					timestamp: now_ms(),
				},
			});
		}

		// A turn that ends mid-tool or mid-prompt leaves entries behind, and an
		// unanswered permission holds the whole tool input — file contents
		// included. The client drops both on turn end, so this does too.
		self.cancelling = false;
		self.activity_titles.clear();
		self.pending_permissions.clear();

		events.push(ClaudeEvent::TurnEnded {
			ended: TurnEnded { session_id: self.session_id.clone(), outcome },
		});
		events
	}

	fn on_control_request(&mut self, request_id: String, body: ControlRequestBody) -> Vec<ClaudeEvent> {
		let ControlRequestBody::CanUseTool { tool_name, display_name, description, input } = body else {
			return Vec::new();
		};

		let label = display_name.unwrap_or_else(|| tool_name.clone());
		let title = match description.as_deref() {
			Some(detail) if !detail.is_empty() => format!("{label} · {detail}"),
			_ => label,
		};
		let detail = permission_detail(&tool_name, &input);
		self.pending_permissions.insert(request_id.clone(), input);

		vec![
			ClaudeEvent::Activity {
				activity: ActivityEvent {
					id: request_id.clone(),
					title: title.clone(),
					kind: ActivityKind::Permission,
					status: ActivityStatus::Pending,
				},
			},
			ClaudeEvent::PermissionRequested {
				request: PermissionRequest { id: request_id, tool_name, title, detail },
			},
		]
	}
}

fn new_id() -> String {
	uuid::Uuid::new_v4().to_string()
}
