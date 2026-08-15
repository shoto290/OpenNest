use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
	Checking,
	Ready,
	Unavailable,
	Crashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnState {
	Idle,
	Submitting,
	Running,
	Stopping,
	Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
	User,
	Assistant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageCompletion {
	Streaming,
	Complete,
	Cancelled,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
	pub id: String,
	pub role: MessageRole,
	pub text: String,
	pub completion: MessageCompletion,
	pub timestamp: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityKind {
	Tool,
	Permission,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityStatus {
	Pending,
	Running,
	Succeeded,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
	pub id: String,
	pub title: String,
	pub kind: ActivityKind,
	pub status: ActivityStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
	pub id: String,
	pub tool_name: String,
	pub title: String,
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionDecision {
	AllowOnce,
	Deny,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnEnded {
	pub session_id: Option<String>,
	pub outcome: TurnOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnOutcome {
	Completed,
	Cancelled,
	Failed,
}

/// Every failure the frontend can act on. Never carries a credential, an
/// environment value, or a raw Claude Code frame.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransportError {
	#[serde(rename_all = "camelCase")]
	BinaryNotFound { searched: Vec<String> },
	NotAuthenticated,
	#[serde(rename_all = "camelCase")]
	AuthCheckFailed { detail: String },
	#[serde(rename_all = "camelCase")]
	SpawnFailed { detail: String },
	#[serde(rename_all = "camelCase")]
	StartupTimeout { timeout_ms: u64 },
	#[serde(rename_all = "camelCase")]
	Crashed { code: Option<i32>, detail: Option<String> },
	#[serde(rename_all = "camelCase")]
	InvalidFrame { detail: String },
	NotStarted,
	TurnAlreadyRunning,
	NoActiveTurn,
	#[serde(rename_all = "camelCase")]
	UnknownPermission { id: String },
	#[serde(rename_all = "camelCase")]
	WriteFailed { detail: String },
}

impl TransportError {
	pub fn is_fatal(&self) -> bool {
		matches!(
			self,
			TransportError::BinaryNotFound { .. }
				| TransportError::NotAuthenticated
				| TransportError::SpawnFailed { .. }
				| TransportError::StartupTimeout { .. }
				| TransportError::Crashed { .. }
		)
	}
}

impl std::fmt::Display for TransportError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			TransportError::BinaryNotFound { .. } => write!(f, "claude binary not found"),
			TransportError::NotAuthenticated => write!(f, "claude is not authenticated"),
			TransportError::AuthCheckFailed { detail } => write!(f, "auth check failed: {detail}"),
			TransportError::SpawnFailed { detail } => write!(f, "spawn failed: {detail}"),
			TransportError::StartupTimeout { timeout_ms } => {
				write!(f, "startup timed out after {timeout_ms}ms")
			}
			TransportError::Crashed { code, .. } => write!(f, "claude exited with {code:?}"),
			TransportError::InvalidFrame { detail } => write!(f, "invalid frame: {detail}"),
			TransportError::NotStarted => write!(f, "session not started"),
			TransportError::TurnAlreadyRunning => write!(f, "a turn is already running"),
			TransportError::NoActiveTurn => write!(f, "no active turn"),
			TransportError::UnknownPermission { id } => write!(f, "unknown permission {id}"),
			TransportError::WriteFailed { detail } => write!(f, "write failed: {detail}"),
		}
	}
}

impl std::error::Error for TransportError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
	pub connection: ConnectionState,
	pub binary_version: Option<String>,
	pub authenticated: bool,
	pub error: Option<TransportError>,
}

/// Deliberately carries no session id: the only trustworthy one arrives later
/// on [`ClaudeEvent::SessionReady`], straight from the child.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHandle {
	pub resumed: bool,
}

/// The single stream React consumes. One tagged union, no raw Claude payloads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClaudeEvent {
	#[serde(rename_all = "camelCase")]
	ConnectionChanged { state: ConnectionState },
	#[serde(rename_all = "camelCase")]
	TurnChanged { state: TurnState },
	#[serde(rename_all = "camelCase")]
	SessionReady { session_id: String, resumed: bool },
	#[serde(rename_all = "camelCase")]
	MessageStarted { message: ChatMessage },
	#[serde(rename_all = "camelCase")]
	MessageDelta { id: String, seq: u64, text: String },
	#[serde(rename_all = "camelCase")]
	MessageCompleted { message: ChatMessage },
	#[serde(rename_all = "camelCase")]
	Activity { activity: ActivityEvent },
	#[serde(rename_all = "camelCase")]
	PermissionRequested { request: PermissionRequest },
	#[serde(rename_all = "camelCase")]
	PermissionResolved { id: String, decision: PermissionDecision },
	#[serde(rename_all = "camelCase")]
	TurnEnded { ended: TurnEnded },
	#[serde(rename_all = "camelCase")]
	Failed { error: TransportError },
}
