use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::conversations::contract::{Bot, StorageFailure, TranscriptStoreError};
use crate::db::repositories::conversations::ConversationError;
use crate::db::DatabaseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionEventKind {
	Opened,
	Note,
	AgentAsked,
	Answered,
	Escalated,
	Ready,
	Failed,
	Closed,
}

impl MissionEventKind {
	pub const ALL: [MissionEventKind; 8] = [
		MissionEventKind::Opened,
		MissionEventKind::Note,
		MissionEventKind::AgentAsked,
		MissionEventKind::Answered,
		MissionEventKind::Escalated,
		MissionEventKind::Ready,
		MissionEventKind::Failed,
		MissionEventKind::Closed,
	];

	pub fn state(self) -> Option<MissionState> {
		match self {
			MissionEventKind::Opened | MissionEventKind::Answered => Some(MissionState::Working),
			MissionEventKind::AgentAsked => Some(MissionState::WaitingBot),
			MissionEventKind::Escalated => Some(MissionState::WaitingHuman),
			MissionEventKind::Ready => Some(MissionState::ReadyToMerge),
			MissionEventKind::Failed => Some(MissionState::Failed),
			MissionEventKind::Closed => Some(MissionState::Done),
			MissionEventKind::Note => None,
		}
	}

	pub fn closes(self) -> bool {
		matches!(self, MissionEventKind::Closed)
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionState {
	Working,
	WaitingBot,
	WaitingHuman,
	ReadyToMerge,
	Failed,
	Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ticket {
	pub platform: String,
	pub external_id: String,
	pub url: String,
	pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionDraft {
	pub origin_conversation_id: String,
	pub bot_id: String,
	pub objective: String,
	pub ticket: Ticket,
	pub tools: Vec<String>,
	pub source: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionNote {
	pub source: String,
	pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionEntry {
	pub kind: MissionEventKind,
	pub source: String,
	pub payload: Value,
}

impl MissionEntry {
	pub fn of(kind: MissionEventKind, note: MissionNote) -> Self {
		Self { kind, source: note.source, payload: note.payload }
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
	pub id: String,
	pub origin_conversation_id: String,
	pub bot_id: String,
	pub thread_conversation_id: String,
	pub objective: String,
	pub ticket: Ticket,
	pub tools: Vec<String>,
	pub state: MissionState,
	pub opened_at: i64,
	pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionEvent {
	pub id: String,
	pub mission_id: String,
	pub kind: MissionEventKind,
	pub source: String,
	pub payload: Value,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionDetail {
	pub mission: Mission,
	pub events: Vec<MissionEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMissions {
	pub open: Vec<Mission>,
	pub done: Vec<Mission>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionOnBoard {
	pub mission: Mission,
	pub bot: Bot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MissionError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownMission { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownConversation { id: String },
	#[serde(rename_all = "camelCase")]
	MissionAlreadyClosed { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownParticipant { conversation_id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	BlankField { field: String },
	#[serde(rename_all = "camelCase")]
	MissionOfAnotherConversation { id: String, conversation_id: String },
	#[serde(rename_all = "camelCase")]
	MissionOfAnotherBot { id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
}

impl From<DatabaseError> for MissionError {
	fn from(error: DatabaseError) -> Self {
		MissionError::Storage { failure: (&error).into() }
	}
}

impl From<rusqlite::Error> for MissionError {
	fn from(error: rusqlite::Error) -> Self {
		MissionError::from(DatabaseError::Sqlite(error))
	}
}

impl From<ConversationError> for MissionError {
	fn from(error: ConversationError) -> Self {
		match error {
			ConversationError::Database(failure) => MissionError::from(failure),
			ConversationError::UnknownBot { id } => MissionError::UnknownBot { id },
			ConversationError::UnknownConversation { id } => {
				MissionError::UnknownConversation { id }
			}
			ConversationError::UnknownParticipant { conversation_id, bot_id } => {
				MissionError::UnknownParticipant { conversation_id, bot_id }
			}
			other => MissionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<TranscriptStoreError> for MissionError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => MissionError::Unavailable { failure },
			TranscriptStoreError::UnknownBot { id } => MissionError::UnknownBot { id },
			TranscriptStoreError::Storage { failure } => MissionError::Storage { failure },
			other => MissionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}
