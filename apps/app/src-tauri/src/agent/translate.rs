//! Turns the sidecar's wire frames into the stable OpenNest contract.
//!
//! This is the only place aware of both vocabularies. Everything crossing to
//! React is rebuilt here: no raw frame, no raw tool input, no usage or cost
//! payload leaves this module.

use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use super::contract::{
	ActivityEvent, ActivityKind, ActivityStatus, AgentEvent, ChatMessage, MessageCompletion,
	MessageRole, PermissionRequest, TurnEnded, TurnOutcome,
};
use super::protocol::{
	CommandsFrame, ContentBlock, ContentDelta, ControlRequestBody, Frame, StreamEvent, SystemFrame,
};
use super::redact;

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

/// The assistant message the stream is in the middle of, and whether it has said
/// a word yet. A message carrying nothing but tool calls says none: it is over the
/// moment the next one starts, and there is no answer in it to finish.
#[derive(Debug)]
struct StreamingMessage {
	id: String,
	spoke: bool,
}

/// The ending a message the stream never closed reaches. A turn that ended well
/// leaves nothing of one that never spoke — reporting it as complete would put a
/// finished reply with no words on the record. Any other ending is the reader's to
/// see, empty or not: the reply was cut off.
fn ending_for(outcome: TurnOutcome, spoke: bool) -> Option<MessageCompletion> {
	match outcome {
		TurnOutcome::Cancelled => Some(MessageCompletion::Cancelled),
		TurnOutcome::Failed => Some(MessageCompletion::Failed),
		TurnOutcome::Completed => spoke.then_some(MessageCompletion::Complete),
	}
}

#[derive(Debug, Default)]
pub struct Translator {
	session_id: Option<String>,
	resumed: bool,
	streaming_message: Option<StreamingMessage>,
	delta_seq: u64,
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

	/// The raw tool input the agent asked about, kept so an approval can echo it
	/// back verbatim. Removed from the map once answered.
	pub fn take_permission_input(&mut self, request_id: &str) -> Option<Value> {
		self.pending_permissions.remove(request_id)
	}

	pub fn ingest(&mut self, frame: Frame) -> Vec<AgentEvent> {
		match frame {
			Frame::System(system) => self.on_system(system),
			Frame::StreamEvent(frame) => {
				frame.event.map(|event| self.on_stream(event)).unwrap_or_default()
			}
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
			Frame::Commands(frame) => Self::on_commands(frame),
			Frame::ControlRequest(request) => {
				self.on_control_request(request.request_id, request.request)
			}
			Frame::Opened | Frame::Closed(_) | Frame::ControlResponse(_) | Frame::Ignored => {
				Vec::new()
			}
		}
	}

	/// The id is announced once, off the init frame it rides on.
	fn on_system(&mut self, frame: SystemFrame) -> Vec<AgentEvent> {
		if frame.subtype.as_deref() != Some("init") {
			return Vec::new();
		}
		let Some(session_id) = frame.session_id.filter(|_| self.session_id.is_none()) else {
			return Vec::new();
		};
		self.session_id = Some(session_id.clone());
		vec![AgentEvent::SessionReady { session_id, resumed: self.resumed }]
	}

	/// The command list belongs to the child that just spoke, so every frame naming
	/// one republishes it. An empty list says nothing rather than saying "none".
	fn on_commands(frame: CommandsFrame) -> Vec<AgentEvent> {
		if frame.commands.is_empty() {
			return Vec::new();
		}
		vec![AgentEvent::CommandsListed { commands: frame.commands }]
	}

	fn on_stream(&mut self, event: StreamEvent) -> Vec<AgentEvent> {
		match event {
			StreamEvent::MessageStart { message } => {
				let id = message.and_then(|header| header.id).unwrap_or_else(new_id);
				self.streaming_message = Some(StreamingMessage { id: id.clone(), spoke: false });
				vec![AgentEvent::MessageStarted {
					message: ChatMessage {
						id,
						role: MessageRole::Assistant,
						text: String::new(),
						completion: MessageCompletion::Streaming,
						timestamp: now_ms(),
					},
				}]
			}
			StreamEvent::ContentBlockDelta { delta: Some(ContentDelta::TextDelta { text }) } => {
				let Some(message) = self.streaming_message.as_mut() else {
					return Vec::new();
				};
				message.spoke = true;
				let id = message.id.clone();
				self.delta_seq += 1;
				vec![AgentEvent::MessageDelta { id, seq: self.delta_seq, text }]
			}
			StreamEvent::ContentBlockStart {
				content_block: Some(ContentBlock::ToolUse { id, name, input }),
			} => {
				vec![self.tool_started(id, &name, &input)]
			}
			_ => Vec::new(),
		}
	}

	fn tool_started(&mut self, id: String, name: &str, input: &Value) -> AgentEvent {
		let title = tool_title(name, input);
		self.activity_titles.insert(id.clone(), title.clone());
		AgentEvent::Activity {
			activity: ActivityEvent {
				id,
				title,
				kind: ActivityKind::Tool,
				status: ActivityStatus::Running,
			},
		}
	}

	fn on_user(&mut self, content: Vec<ContentBlock>) -> Vec<AgentEvent> {
		content
			.into_iter()
			.filter_map(|block| match block {
				ContentBlock::ToolResult { tool_use_id, is_error } => Some(AgentEvent::Activity {
					activity: ActivityEvent {
						title: self.activity_titles.remove(&tool_use_id).unwrap_or_default(),
						id: tool_use_id,
						kind: ActivityKind::Tool,
						status: if is_error {
							ActivityStatus::Failed
						} else {
							ActivityStatus::Succeeded
						},
					},
				}),
				_ => None,
			})
			.collect()
	}

	fn on_assistant(&mut self, content: Vec<ContentBlock>) -> Vec<AgentEvent> {
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
			let id = self.streaming_message.take().map(|message| message.id).unwrap_or_else(new_id);
			events.push(AgentEvent::MessageCompleted {
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

	fn on_result(&mut self, subtype: Option<&str>, is_error: bool) -> Vec<AgentEvent> {
		let outcome = if self.cancelling {
			TurnOutcome::Cancelled
		} else if is_error || subtype.is_some_and(|subtype| subtype != "success") {
			TurnOutcome::Failed
		} else {
			TurnOutcome::Completed
		};

		let mut events = Vec::new();
		if let Some(message) = self.streaming_message.take() {
			if let Some(completion) = ending_for(outcome, message.spoke) {
				events.push(AgentEvent::MessageCompleted {
					message: ChatMessage {
						id: message.id,
						role: MessageRole::Assistant,
						text: String::new(),
						completion,
						timestamp: now_ms(),
					},
				});
			}
		}

		// A turn that ends mid-tool or mid-prompt leaves entries behind, and an
		// unanswered permission holds the whole tool input — file contents
		// included. The client drops both on turn end, so this does too.
		self.cancelling = false;
		self.activity_titles.clear();
		self.pending_permissions.clear();

		events.push(AgentEvent::TurnEnded {
			ended: TurnEnded { session_id: self.session_id.clone(), outcome },
		});
		events
	}

	fn on_control_request(
		&mut self,
		request_id: String,
		body: ControlRequestBody,
	) -> Vec<AgentEvent> {
		let ControlRequestBody::CanUseTool { tool_name, display_name, description, input } = body
		else {
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
			AgentEvent::Activity {
				activity: ActivityEvent {
					id: request_id.clone(),
					title: title.clone(),
					kind: ActivityKind::Permission,
					status: ActivityStatus::Pending,
				},
			},
			AgentEvent::PermissionRequested {
				request: PermissionRequest { id: request_id, tool_name, title, detail },
			},
		]
	}
}

fn new_id() -> String {
	uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::contract::AgentCommand;
	use super::*;

	const ANSWER: &str = "Both files are in place.";

	fn ingest(translator: &mut Translator, frames: Vec<Value>) -> Vec<AgentEvent> {
		frames
			.into_iter()
			.flat_map(|frame| {
				let frame = serde_json::from_value(frame).expect("a frame the transport parses");
				translator.ingest(frame)
			})
			.collect()
	}

	/// One tool call in the four frames the CLI spends on it: the assistant message
	/// it opens, the block, the message itself carrying nothing but the call, and the
	/// result coming back as a user frame.
	fn tool_round(round: usize) -> Vec<Value> {
		let message_id = format!("msg_tool_{round}");
		let tool_id = format!("toolu_{round}");
		let call = json!({
			"type": "tool_use", "id": tool_id, "name": "Read",
			"input": { "file_path": "/tmp/notes.txt" }
		});
		vec![
			json!({
				"type": "stream_event",
				"event": { "type": "message_start", "message": { "id": message_id } }
			}),
			json!({
				"type": "stream_event",
				"event": { "type": "content_block_start", "index": 0, "content_block": call }
			}),
			json!({
				"type": "assistant",
				"message": { "id": message_id, "role": "assistant", "content": [call] }
			}),
			json!({
				"type": "user",
				"message": {
					"role": "user",
					"content": [{ "type": "tool_result", "tool_use_id": tool_id, "is_error": false }]
				}
			}),
		]
	}

	fn spoken_answer(text: &str) -> Vec<Value> {
		let mut frames = vec![json!({
			"type": "stream_event",
			"event": { "type": "message_start", "message": { "id": "msg_answer" } }
		})];
		for chunk in text.split_inclusive(' ') {
			frames.push(json!({
				"type": "stream_event",
				"event": {
					"type": "content_block_delta", "index": 0,
					"delta": { "type": "text_delta", "text": chunk }
				}
			}));
		}
		frames.push(json!({
			"type": "assistant",
			"message": {
				"id": "msg_answer", "role": "assistant",
				"content": [{ "type": "text", "text": text }]
			}
		}));
		frames
	}

	fn result(subtype: &str, is_error: bool) -> Value {
		json!({ "type": "result", "subtype": subtype, "is_error": is_error, "session_id": "s-1" })
	}

	fn completed(events: &[AgentEvent]) -> Vec<&ChatMessage> {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::MessageCompleted { message } => Some(message),
				_ => None,
			})
			.collect()
	}

	fn streamed(events: &[AgentEvent]) -> String {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::MessageDelta { text, .. } => Some(text.as_str()),
				_ => None,
			})
			.collect()
	}

	fn statuses(events: &[AgentEvent]) -> Vec<ActivityStatus> {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::Activity { activity } => Some(activity.status),
				_ => None,
			})
			.collect()
	}

	/// A key a build named, or one it left out entirely: `None` is the absent key,
	/// `Some(Value::Null)` the one set to null.
	fn with_field(mut object: Value, key: &str, value: Option<Value>) -> Value {
		if let Some(value) = value {
			object[key] = value;
		}
		object
	}

	fn init(session_id: &str) -> Value {
		json!({ "type": "system", "subtype": "init", "session_id": session_id })
	}

	fn commands(listed: Option<Value>) -> Value {
		with_field(json!({ "type": "commands" }), "commands", listed)
	}

	fn message(kind: &str, content: Option<Value>) -> Value {
		let body = json!({ "id": "msg_null", "role": kind });
		json!({ "type": kind, "message": with_field(body, "content", content) })
	}

	fn outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
		events.iter().find_map(|event| match event {
			AgentEvent::TurnEnded { ended } => Some(ended.outcome),
			_ => None,
		})
	}

	/// The shape one live prompt was measured to have: fourteen assistant messages
	/// that only ever called a tool, and the answer in the message after them. Every
	/// tool round is an activity, and the only message the turn finished is the one
	/// that said something.
	#[test]
	fn tools_are_activities_and_the_answer_is_the_only_message_that_ends() {
		let mut translator = Translator::new(false);
		let mut frames: Vec<Value> = (1..=14).flat_map(tool_round).collect();
		frames.extend(spoken_answer(ANSWER));
		frames.push(result("success", false));

		let events = ingest(&mut translator, frames);

		assert_eq!(streamed(&events), ANSWER);
		assert_eq!(
			completed(&events)
				.iter()
				.map(|message| (message.text.as_str(), message.completion))
				.collect::<Vec<_>>(),
			vec![(ANSWER, MessageCompletion::Complete)]
		);
		// The block and the message both announce the call, under the one tool id the
		// reader's activity log keys on.
		assert_eq!(
			statuses(&events),
			[ActivityStatus::Running, ActivityStatus::Running, ActivityStatus::Succeeded]
				.repeat(14)
		);
		assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	}

	/// A turn that ends well straight after a tool call has no answer in it. The
	/// message the stream opened for that call said nothing, so nothing is reported
	/// as finished — a message with no text and a completed ending is a row the
	/// transcript would keep forever for a turn that only ran a tool.
	#[test]
	fn a_turn_that_ends_well_after_a_tool_finishes_no_message() {
		let mut translator = Translator::new(false);
		let mut frames = tool_round(1);
		frames.push(result("success", false));

		let events = ingest(&mut translator, frames);

		assert_eq!(completed(&events), Vec::<&ChatMessage>::new());
		assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	}

	/// The other half of the same rule: a turn cut off before a word still owes the
	/// reader the ending it reached. Nothing was said, and that is exactly what the
	/// reply has to be shown as.
	#[test]
	fn a_turn_cut_off_before_a_word_still_finishes_its_message() {
		for (subtype, is_error, cancelling, expected) in [
			("error_during_execution", false, true, MessageCompletion::Cancelled),
			("error_during_execution", true, false, MessageCompletion::Failed),
		] {
			let mut translator = Translator::new(false);
			let mut events = ingest(&mut translator, tool_round(1));
			if cancelling {
				translator.mark_cancelling();
			}
			events.extend(ingest(&mut translator, vec![result(subtype, is_error)]));

			assert_eq!(
				completed(&events)
					.iter()
					.map(|message| (message.text.as_str(), message.completion))
					.collect::<Vec<_>>(),
				vec![("", expected)]
			);
		}
	}

	/// The id is announced once, whether the child is a fresh one or the one a
	/// resume reached: whichever was reached is the one the reader is talking to.
	#[test]
	fn an_init_frame_announces_the_session_it_carries() {
		for (resumed, session_id) in [(false, "s-1"), (true, "carried-over")] {
			let mut translator = Translator::new(resumed);

			let events = ingest(&mut translator, vec![init(session_id)]);

			assert_eq!(
				events,
				vec![AgentEvent::SessionReady { session_id: session_id.to_owned(), resumed }]
			);
		}
	}

	/// The commands reach the reader in the order the child named them, each with
	/// what the child said it does — and a command the child says nothing about is
	/// carried just as far as one it describes.
	#[test]
	fn a_commands_frame_lists_what_it_carries() {
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![commands(Some(json!([
				{ "name": "review", "description": "Review the pending changes" },
				{ "name": "plan" },
			])))],
		);

		assert_eq!(
			events,
			vec![AgentEvent::CommandsListed {
				commands: vec![
					AgentCommand {
						name: "review".to_owned(),
						description: Some("Review the pending changes".to_owned()),
					},
					AgentCommand::named("plan"),
				],
			}]
		);
	}

	/// A child naming none — key left out, set to null, or an empty list — lists
	/// nothing at all. What a bot answers to is held against it between launches, so
	/// a frame that names none is a frame with nothing to say about it rather than
	/// one taking the last list away.
	#[test]
	fn a_frame_carrying_no_commands_lists_nothing() {
		for listed in [None, Some(Value::Null), Some(json!([]))] {
			let mut translator = Translator::new(false);

			assert!(ingest(&mut translator, vec![commands(listed)]).is_empty());
		}
	}

	/// `#[serde(default)]` answers a key left out, never one set to null, and `Frame`
	/// is internally tagged: one null field would cost the whole frame, and the reader
	/// would be handed an unreadable-frame failure in place of everything that frame
	/// carried. Content set to null is content there is none of — what a frame leaving
	/// the key out already says.
	#[test]
	fn a_frame_whose_content_is_null_carries_none() {
		for kind in ["assistant", "user"] {
			for content in [None, Some(Value::Null)] {
				let mut translator = Translator::new(false);

				let events = ingest(&mut translator, vec![message(kind, content)]);

				assert!(events.is_empty(), "a {kind} frame carrying no content said something");
			}
		}
	}

	/// Text set to null is text never said, in the block as in the delta: nothing is
	/// streamed and no message is finished, exactly as when the key is left out. The
	/// frame is still read — the assistant frame it rides on may carry a tool call the
	/// activity log is owed.
	#[test]
	fn a_null_text_reads_as_an_empty_one() {
		for text in [None, Some(Value::Null)] {
			let mut translator = Translator::new(false);
			let block = with_field(json!({ "type": "text" }), "text", text.clone());
			let delta = with_field(json!({ "type": "text_delta" }), "text", text);

			let events = ingest(
				&mut translator,
				vec![
					json!({
						"type": "stream_event",
						"event": { "type": "message_start", "message": { "id": "msg_null" } }
					}),
					json!({
						"type": "stream_event",
						"event": { "type": "content_block_delta", "index": 0, "delta": delta }
					}),
					message("assistant", Some(json!([block]))),
				],
			);

			assert_eq!(streamed(&events), "");
			assert_eq!(completed(&events), Vec::<&ChatMessage>::new());
		}
	}

	/// An error flag set to null is a call that worked and a turn that ended well —
	/// the reading a frame leaving the key out already gets. Both frames carry more
	/// than the flag: the activity the tool result closes, and the ending the turn
	/// reached.
	#[test]
	fn a_null_error_flag_reads_as_one_that_worked() {
		for is_error in [None, Some(Value::Null)] {
			let mut translator = Translator::new(false);
			let tool_result = with_field(
				json!({ "type": "tool_result", "tool_use_id": "toolu_1" }),
				"is_error",
				is_error.clone(),
			);
			let ended = with_field(
				json!({ "type": "result", "subtype": "success", "session_id": "s-1" }),
				"is_error",
				is_error,
			);
			let mut frames = tool_round(1);
			frames.pop();
			frames.push(message("user", Some(json!([tool_result]))));
			frames.push(ended);

			let events = ingest(&mut translator, frames);

			assert_eq!(
				statuses(&events),
				[ActivityStatus::Running, ActivityStatus::Running, ActivityStatus::Succeeded]
			);
			assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
		}
	}
}
