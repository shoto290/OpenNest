
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use super::contract::AgentCommand;

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
	D: Deserializer<'de>,
	T: Default + Deserialize<'de>,
{
	Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

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

#[derive(Debug, Clone, Deserialize)]
pub struct Envelope {
	pub session: String,
	pub frame: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
	pub cwd: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub resume: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub system_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub user_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub space_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub agent: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub identity: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub output_style: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub settings_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub app_data_dir: Option<String>,
	pub partial_messages: bool,
	#[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
	pub env: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Frame {
	Opened,
	Closed(ClosedFrame),
	System(SystemFrame),
	StreamEvent(StreamEventFrame),
	Assistant(MessageFrame),
	User(MessageFrame),
	Result(ResultFrame),
	Commands(CommandsFrame),
	ControlRequest(ControlRequestFrame),
	ControlResponse(ControlResponseFrame),
	SettingsRejected(SettingsRejectedFrame),
	SecretUnresolved(SecretUnresolvedFrame),
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClosedFrame {
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretUnresolvedFrame {
	#[serde(default)]
	pub server: String,
	#[serde(default)]
	pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SettingsRejectedFrame {
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemFrame {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CommandsFrame {
	#[serde(default, deserialize_with = "null_as_default")]
	pub commands: Vec<AgentCommand>,
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

pub type SecretsByServer =
	std::collections::BTreeMap<String, std::collections::BTreeMap<String, String>>;

pub fn secrets_command(
	session: &str,
	secrets: &std::collections::BTreeMap<String, String>,
	by_server: &SecretsByServer,
) -> Value {
	command(
		"secrets",
		session,
		serde_json::json!({ "secrets": secrets, "serverSecrets": by_server }),
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

pub const CHECK: &str = "check";
pub const MODELS: &str = "models";
pub const TOOLS: &str = "tools";
pub const TITLE: &str = "title";

pub fn ask_command(kind: &str) -> Value {
	serde_json::json!({ "type": kind })
}

pub fn title_command(text: &str) -> Value {
	serde_json::json!({ "type": TITLE, "text": text })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
	#[serde(default, deserialize_with = "null_as_default")]
	pub authenticated: bool,
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
	#[serde(default, deserialize_with = "null_as_default")]
	pub models: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCatalogue {
	#[serde(default, deserialize_with = "null_as_default")]
	pub tools: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Titled {
	#[serde(default)]
	pub title: Option<String>,
}
