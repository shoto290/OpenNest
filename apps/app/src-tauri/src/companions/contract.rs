use serde::{Deserialize, Serialize};

use crate::conversations::contract::{StorageFailure, TranscriptStoreError};
use crate::db::DatabaseError;

pub const CREATED_EVENT: &str = "companion://created";

pub const FIRST_RUN_DONE_EVENT: &str = "user://first-run-done";

pub const SEED_REFUSED_EVENT: &str = "companion://seed-refused";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionCreated {
	pub id: String,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSeedRefused {
	pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CompanionError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	NamelessCompanion,
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace { conversation_id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
}

impl From<DatabaseError> for CompanionError {
	fn from(error: DatabaseError) -> Self {
		CompanionError::Storage { failure: (&error).into() }
	}
}

impl From<TranscriptStoreError> for CompanionError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => CompanionError::Unavailable { failure },
			TranscriptStoreError::Storage { failure } => CompanionError::Storage { failure },
			TranscriptStoreError::NamelessBot => CompanionError::NamelessCompanion,
			other => CompanionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}
