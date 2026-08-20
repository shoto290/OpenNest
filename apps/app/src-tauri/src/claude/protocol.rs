//! Claude Code stream-json wire frames. Internal only: nothing in this module
//! is ever serialized towards the frontend.

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

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Frame {
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

pub fn user_message(text: &str) -> Value {
	serde_json::json!({
		"type": "user",
		"message": { "role": "user", "content": [{ "type": "text", "text": text }] }
	})
}

pub fn initialize_request(request_id: &str) -> Value {
	serde_json::json!({
		"type": "control_request",
		"request_id": request_id,
		"request": { "subtype": "initialize", "hooks": {} }
	})
}

pub fn interrupt_request(request_id: &str) -> Value {
	serde_json::json!({
		"type": "control_request",
		"request_id": request_id,
		"request": { "subtype": "interrupt" }
	})
}

pub fn allow_response(request_id: &str, input: &Value) -> Value {
	serde_json::json!({
		"type": "control_response",
		"response": {
			"subtype": "success",
			"request_id": request_id,
			"response": { "behavior": "allow", "updatedInput": input }
		}
	})
}

pub fn deny_response(request_id: &str, message: &str) -> Value {
	serde_json::json!({
		"type": "control_response",
		"response": {
			"subtype": "success",
			"request_id": request_id,
			"response": { "behavior": "deny", "message": message }
		}
	})
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
	#[serde(rename = "loggedIn", default)]
	pub logged_in: bool,
}
