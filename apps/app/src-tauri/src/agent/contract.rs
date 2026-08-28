use serde::{Deserialize, Deserializer, Serialize};

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
	pub label: String,
	pub description: Option<String>,
	pub preview: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskedQuestion {
	pub header: String,
	pub question: String,
	pub options: Vec<QuestionOption>,
	pub multi_select: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRequest {
	pub id: String,
	pub questions: Vec<AskedQuestion>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionDecision {
	AllowOnce,
	Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EvolvedBundle {
	Bot,
	User,
	Space,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransportError {
	#[serde(rename_all = "camelCase")]
	BinaryNotFound {
		searched: Vec<String>,
	},
	NotAuthenticated,
	#[serde(rename_all = "camelCase")]
	AuthCheckFailed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	SpawnFailed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	StartupTimeout {
		timeout_ms: u64,
	},
	#[serde(rename_all = "camelCase")]
	Crashed {
		code: Option<i32>,
		detail: Option<String>,
	},
	#[serde(rename_all = "camelCase")]
	ResumeFailed {
		forgot_session_id: bool,
	},
	#[serde(rename_all = "camelCase")]
	WorkingDirectoryRefused {
		path: String,
	},
	#[serde(rename_all = "camelCase")]
	InvalidFrame {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	SettingsRejected {
		detail: String,
	},
	NotStarted,
	TurnAlreadyRunning,
	TransitionInProgress,
	NoActiveTurn,
	#[serde(rename_all = "camelCase")]
	StaleRuntimeSession {
		runtime_session_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownPermission {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	WriteFailed {
		detail: String,
	},
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
			TransportError::BinaryNotFound { .. } => write!(f, "the agent sidecar was not found"),
			TransportError::NotAuthenticated => write!(f, "the agent is not signed in"),
			TransportError::AuthCheckFailed { detail } => write!(f, "auth check failed: {detail}"),
			TransportError::SpawnFailed { detail } => write!(f, "spawn failed: {detail}"),
			TransportError::StartupTimeout { timeout_ms } => {
				write!(f, "startup timed out after {timeout_ms}ms")
			}
			TransportError::Crashed { code, .. } => write!(f, "the agent exited with {code:?}"),
			TransportError::ResumeFailed { .. } => {
				write!(f, "the stored session could not be resumed")
			}
			TransportError::WorkingDirectoryRefused { path } => {
				write!(f, "the working directory {path} is not there")
			}
			TransportError::InvalidFrame { detail } => write!(f, "invalid frame: {detail}"),
			TransportError::SettingsRejected { detail } => {
				write!(f, "the bot's settings were rejected: {detail}")
			}
			TransportError::NotStarted => write!(f, "session not started"),
			TransportError::TurnAlreadyRunning => write!(f, "a turn is already running"),
			TransportError::TransitionInProgress => {
				write!(f, "a session transition is already in progress")
			}
			TransportError::NoActiveTurn => write!(f, "no active turn"),
			TransportError::StaleRuntimeSession { runtime_session_id } => {
				write!(f, "runtime session {runtime_session_id} is no longer the live one")
			}
			TransportError::UnknownPermission { id } => write!(f, "unknown permission {id}"),
			TransportError::WriteFailed { detail } => write!(f, "write failed: {detail}"),
		}
	}
}

impl std::error::Error for TransportError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScope {
	pub conversation_id: String,
	pub bot_id: String,
	pub runtime_session_id: String,
	pub epoch: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedEvent {
	pub scope: Option<RuntimeScope>,
	pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
	pub connection: ConnectionState,
	pub binary_version: Option<String>,
	pub authenticated: bool,
	pub error: Option<TransportError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHandle {
	pub resumed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
	pub session_id: Option<String>,
	pub messages: Vec<ChatMessage>,
	pub activities: Vec<ActivityEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommand {
	pub name: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub description: Option<String>,
}

impl AgentCommand {
	pub(crate) fn named(name: impl Into<String>) -> Self {
		Self { name: name.into(), description: None }
	}
}

impl<'de> Deserialize<'de> for AgentCommand {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		#[derive(Deserialize)]
		#[serde(untagged)]
		enum Announced {
			Named(String),
			Described {
				name: String,
				#[serde(default)]
				description: Option<String>,
			},
		}

		Ok(match Announced::deserialize(deserializer)? {
			Announced::Named(name) => Self::named(name),
			Announced::Described { name, description } => Self { name, description },
		})
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
	#[serde(rename_all = "camelCase")]
	ConnectionChanged { state: ConnectionState },
	#[serde(rename_all = "camelCase")]
	TurnChanged { state: TurnState },
	#[serde(rename_all = "camelCase")]
	SessionReady { session_id: String, resumed: bool },
	#[serde(rename_all = "camelCase")]
	CommandsListed { commands: Vec<AgentCommand> },
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
	QuestionRequested { request: QuestionRequest },
	#[serde(rename_all = "camelCase")]
	PermissionResolved { id: String, decision: PermissionDecision },
	#[serde(rename_all = "camelCase")]
	TurnEnded { ended: TurnEnded },
	#[serde(rename_all = "camelCase")]
	BotEvolved { bundle: EvolvedBundle, commit_id: String, title: String },
	#[serde(rename_all = "camelCase")]
	Failed { error: TransportError },
}
