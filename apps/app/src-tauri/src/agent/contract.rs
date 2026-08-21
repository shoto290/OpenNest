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
/// environment value, or a raw provider frame.
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
	/// The stored id was refused and a fresh session took its place. The
	/// underlying failure is spent and nothing about it is actionable once the
	/// replacement session is up — but whether the host gave the id up is, since
	/// the frontend holds a copy of it that would otherwise be written back.
	#[serde(rename_all = "camelCase")]
	ResumeFailed {
		forgot_session_id: bool,
	},
	/// The bot names a working directory that is not there any more, so the run was
	/// started where one is started for a bot that names none. Not fatal and not a
	/// session to replace: the process is up and answering — somewhere else. The
	/// path is carried so the reader can be shown which one was refused.
	#[serde(rename_all = "camelCase")]
	WorkingDirectoryRefused {
		path: String,
	},
	#[serde(rename_all = "camelCase")]
	InvalidFrame {
		detail: String,
	},
	NotStarted,
	TurnAlreadyRunning,
	/// A lifecycle transition already owns the session. Transient: the caller is
	/// refused rather than queued, so it never launches a second child behind the
	/// first one's back.
	TransitionInProgress,
	NoActiveTurn,
	/// The call named a run the host is not the one holding any more. Transient in
	/// the same way [`TransportError::TransitionInProgress`] is, and refused for a
	/// stronger reason: the process the caller is talking about is gone, and the one
	/// that took its place is somebody else's turn to cancel, answer or shut down.
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

/// Which run a command is about, and which run an event came from. Every field is
/// a durable one: the participant is `conversation_participants`' own pair, the id
/// is the `runtime_sessions` row the frontend opened for this process, and the
/// epoch is that row's `seq` — the number the lineage already counts handovers
/// with. Nothing here is minted for the runtime alone, because a second identity
/// for one run is a second thing that can disagree.
///
/// Carried whole rather than as an id: the id says which row, and the participant
/// says whose, so a scope that names another bot's run is refused on what it says
/// rather than on what a lookup would have to go and find.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScope {
	pub conversation_id: String,
	pub bot_id: String,
	pub runtime_session_id: String,
	pub epoch: i64,
}

/// One event and the run it belongs to. The scope is an envelope rather than a
/// field on every variant: it says where the event came from, which is not part of
/// what any of them says.
///
/// `None` is what a caller holding no run gets its own answer under — a check
/// asks about the install, and the first one of a launch happens before there is a
/// lineage to name. The host never invents a scope for those: it echoes the
/// caller's, so a reader can compare what came back against what it holds without
/// a second rule for the one event that would otherwise have none.
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

/// Deliberately carries no session id: the only trustworthy one arrives later
/// on [`AgentEvent::SessionReady`], straight from the child.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHandle {
	pub resumed: bool,
}

/// What survives a restart: the visible transcript and the id needed to resume
/// it. Pending permissions and transport errors describe a moment, not a
/// conversation, so they are left out.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
	pub session_id: Option<String>,
	pub messages: Vec<ChatMessage>,
	pub activities: Vec<ActivityEvent>,
}

/// A slash command as the menu lists it. The description is what the child said
/// the command does, left out by one that says nothing.
///
/// A bare name reads as one too. That is the shape `bots.commands` was written in
/// before descriptions were asked for, and those rows outlive the build that wrote
/// them — see [`Self::deserialize`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommand {
	pub name: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub description: Option<String>,
}

impl AgentCommand {
	/// A command with nothing said about it.
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

/// The single stream React consumes. One tagged union, no raw provider payloads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
	#[serde(rename_all = "camelCase")]
	ConnectionChanged { state: ConnectionState },
	#[serde(rename_all = "camelCase")]
	TurnChanged { state: TurnState },
	#[serde(rename_all = "camelCase")]
	SessionReady { session_id: String, resumed: bool },
	/// The slash commands the child announced when it started, in the order it
	/// named them, and never empty: a child naming none announces nothing, which
	/// leaves the list the bot was already holding standing.
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
	PermissionResolved { id: String, decision: PermissionDecision },
	#[serde(rename_all = "camelCase")]
	TurnEnded { ended: TurnEnded },
	#[serde(rename_all = "camelCase")]
	Failed { error: TransportError },
}
