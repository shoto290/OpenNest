//! The agent sidecar's wire vocabulary. Internal only: nothing in this module is
//! ever serialized towards the frontend.
//!
//! Every session's stream leaves the sidecar through one pipe, so each line is an
//! [`Envelope`] naming the session it belongs to. What the envelope carries is a
//! [`Frame`] — the SDK's own message types, plus the two the sidecar adds to say
//! that a session opened and that one is over.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

/// `#[serde(default)]` answers a key left out, never one set to null. A frame is
/// internally tagged, so a single null field costs the whole frame and everything
/// it carries: null is read as the empty value an absent key leaves.
fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
	D: Deserializer<'de>,
	T: Default + Deserialize<'de>,
{
	Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

/// The sidecar's first line: what it is, and what this build of it can do. Read
/// once, before any session exists.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
	pub provider: String,
	pub version: String,
	#[serde(default)]
	pub sdk_version: Option<String>,
	#[serde(default)]
	pub capabilities: Vec<String>,
}

/// One frame and the session it came from.
#[derive(Debug, Clone, Deserialize)]
pub struct Envelope {
	pub session: String,
	pub frame: Value,
}

/// What the host asks the sidecar to start a session as. Mirrors the SDK options
/// it is turned into on the other side, and names no flag: the sidecar decides
/// how its provider spells any of this.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
	pub cwd: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub resume: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub append_system_prompt: Option<String>,
	pub partial_messages: bool,
	#[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
	pub env: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Frame {
	/// The session is live and may be prompted.
	Opened,
	/// The session is over, whatever the host was expecting.
	Closed(ClosedFrame),
	System(SystemFrame),
	StreamEvent(StreamEventFrame),
	Assistant(MessageFrame),
	User(MessageFrame),
	Result(ResultFrame),
	ControlRequest(ControlRequestFrame),
	ControlResponse(ControlResponseFrame),
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClosedFrame {
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemFrame {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub session_id: Option<String>,
	/// Named on the `init` frame only. A build exposing none leaves the key out or
	/// sets it to null, and neither may cost the frame the id it also carries.
	#[serde(default)]
	pub slash_commands: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamEventFrame {
	#[serde(default)]
	pub event: Option<StreamEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
	MessageStart {
		#[serde(default)]
		message: Option<StreamMessageHeader>,
	},
	ContentBlockStart {
		#[serde(default)]
		content_block: Option<ContentBlock>,
	},
	ContentBlockDelta {
		#[serde(default)]
		delta: Option<ContentDelta>,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamMessageHeader {
	#[serde(default)]
	pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentDelta {
	TextDelta {
		#[serde(default, deserialize_with = "null_as_default")]
		text: String,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageFrame {
	#[serde(default)]
	pub message: Option<MessageBody>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageBody {
	#[serde(default)]
	pub id: Option<String>,
	#[serde(default, deserialize_with = "null_as_default")]
	pub content: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
	Text {
		#[serde(default, deserialize_with = "null_as_default")]
		text: String,
	},
	ToolUse {
		id: String,
		name: String,
		#[serde(default)]
		input: Value,
	},
	ToolResult {
		tool_use_id: String,
		#[serde(default, deserialize_with = "null_as_default")]
		is_error: bool,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResultFrame {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub session_id: Option<String>,
	#[serde(default, deserialize_with = "null_as_default")]
	pub is_error: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlRequestFrame {
	pub request_id: String,
	pub request: ControlRequestBody,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub enum ControlRequestBody {
	CanUseTool {
		tool_name: String,
		#[serde(default)]
		display_name: Option<String>,
		#[serde(default)]
		description: Option<String>,
		#[serde(default)]
		input: Value,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlResponseFrame {
	pub response: ControlResponseBody,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlResponseBody {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub request_id: Option<String>,
	#[serde(default)]
	pub error: Option<String>,
}

fn command(kind: &str, session: &str, body: Value) -> Value {
	let mut frame = serde_json::json!({ "type": kind, "session": session });
	if let (Some(frame), Some(body)) = (frame.as_object_mut(), body.as_object()) {
		frame.extend(body.clone());
	}
	frame
}

pub fn open_command(session: &str, request: &OpenRequest) -> Value {
	command(
		"open",
		session,
		serde_json::to_value(request).unwrap_or_else(|_| serde_json::json!({})),
	)
}

pub fn prompt_command(session: &str, text: &str) -> Value {
	command("prompt", session, serde_json::json!({ "text": text }))
}

pub fn interrupt_command(session: &str) -> Value {
	command("interrupt", session, Value::Null)
}

pub fn close_command(session: &str) -> Value {
	command("close", session, Value::Null)
}

pub fn allow_command(session: &str, request_id: &str, input: &Value) -> Value {
	command(
		"permission",
		session,
		serde_json::json!({
			"requestId": request_id,
			"decision": { "behavior": "allow", "updatedInput": input }
		}),
	)
}

pub fn deny_command(session: &str, request_id: &str, message: &str) -> Value {
	command(
		"permission",
		session,
		serde_json::json!({
			"requestId": request_id,
			"decision": { "behavior": "deny", "message": message }
		}),
	)
}

/// The two asks that are about the install rather than about a conversation. Neither
/// names a session, so neither answer arrives inside an [`Envelope`] — and each is
/// answered under the type it was asked, which is what lets one name stand for the
/// ask and its answer both.
pub const CHECK: &str = "check";
pub const MODELS: &str = "models";

pub fn ask_command(kind: &str) -> Value {
	serde_json::json!({ "type": kind })
}

/// The [`CHECK`] answer: the sign-in state of the provider's own credentials.
/// `detail` says the question could not be answered at all, which a reader is owed
/// apart from a plain refusal: a broken install is not an account that is signed out.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
	#[serde(default, deserialize_with = "null_as_default")]
	pub authenticated: bool,
	#[serde(default)]
	pub detail: Option<String>,
}

/// The [`MODELS`] answer: every label the provider offers, in the order it offers
/// them. Empty is an answer, not a failure.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
	#[serde(default, deserialize_with = "null_as_default")]
	pub models: Vec<String>,
}
