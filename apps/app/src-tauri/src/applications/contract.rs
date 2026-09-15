use serde::{Deserialize, Serialize};

use crate::conversations::contract::TranscriptStoreError;
use crate::db::DatabaseError;
use crate::environment::contract::EnvError;
use crate::mcp_oauth::status::ConnectorStatus;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Application {
	pub name: String,
	pub title: String,
	pub description: String,
	pub config: serde_json::Value,
	pub tools: Vec<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub logo: Option<String>,
	pub install: Install,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Install {
	Nothing,
	#[serde(rename_all = "camelCase")]
	Key {
		name: String,
		secret: String,
		#[serde(default, skip_serializing_if = "Option::is_none")]
		description: Option<String>,
	},
	Oauth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ApplicationsError {
	#[serde(rename_all = "camelCase")]
	CatalogueUnreadable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RegistryUnreached {
		detail: String,
	},
	RegistryTimedOut,
	#[serde(rename_all = "camelCase")]
	RegistryRefused {
		status: u16,
	},
	#[serde(rename_all = "camelCase")]
	RegistryUnreadable {
		detail: String,
	},
}

pub const INSTALLED_EVENT: &str = "application://installed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Destination {
	Companion,
	Space,
	User,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallDraft {
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	pub logo: Option<String>,
	pub scope: Destination,
	pub destination_id: Option<String>,
	pub install: InstallCase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInstall {
	pub id: String,
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub logo: Option<String>,
	pub scope: Destination,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub destination_id: Option<String>,
	pub install: InstallCase,
	pub last_message_seq: i64,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInstalled {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub id: Option<String>,
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub logo: Option<String>,
	pub scope: Destination,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub destination_id: Option<String>,
	pub install: InstallCase,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub last_message_seq: Option<i64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub created_at: Option<i64>,
}

impl From<ApplicationInstall> for ApplicationInstalled {
	fn from(record: ApplicationInstall) -> Self {
		Self {
			id: Some(record.id),
			conversation_id: record.conversation_id,
			application: record.application,
			title: record.title,
			logo: record.logo,
			scope: record.scope,
			destination_id: record.destination_id,
			install: record.install,
			last_message_seq: Some(record.last_message_seq),
			created_at: Some(record.created_at),
		}
	}
}

impl From<InstallDraft> for ApplicationInstalled {
	fn from(draft: InstallDraft) -> Self {
		Self {
			id: None,
			conversation_id: draft.conversation_id,
			application: draft.application,
			title: draft.title,
			logo: draft.logo,
			scope: draft.scope,
			destination_id: draft.destination_id,
			install: draft.install,
			last_message_seq: None,
			created_at: None,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorSearch {
	pub applications: Vec<Application>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub registry_failure: Option<ApplicationsError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InstallCase {
	Nothing,
	#[serde(rename_all = "camelCase")]
	Key {
		secret: String,
	},
	Oauth,
}

impl From<Install> for InstallCase {
	fn from(install: Install) -> Self {
		match install {
			Install::Nothing => InstallCase::Nothing,
			Install::Key { secret, .. } => InstallCase::Key { secret },
			Install::Oauth => InstallCase::Oauth,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum ConnectorInstall {
	#[serde(rename_all = "camelCase")]
	Installed { application: String, scope: Destination, install: InstallCase },
	#[serde(rename_all = "camelCase")]
	AlreadyInstalled { application: String, scope: Destination },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ConnectorState {
	NotInstalled,
	Connected,
	NeedsAuthorization,
	Connecting,
	Failed {
		#[serde(skip_serializing_if = "Option::is_none")]
		reason: Option<String>,
	},
	Unknown,
}

impl From<ConnectorStatus> for ConnectorState {
	fn from(status: ConnectorStatus) -> Self {
		match status {
			ConnectorStatus::Connected => ConnectorState::Connected,
			ConnectorStatus::NeedsAuthorization => ConnectorState::NeedsAuthorization,
			ConnectorStatus::Connecting => ConnectorState::Connecting,
			ConnectorStatus::Failed { reason } => ConnectorState::Failed { reason },
			ConnectorStatus::Unknown => ConnectorState::Unknown,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConnectorError {
	#[serde(rename_all = "camelCase")]
	UnknownScope { scope: String },
	#[serde(rename_all = "camelCase")]
	UnknownApplication { application: String },
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace { conversation_id: String },
	#[serde(rename_all = "camelCase")]
	Unsearchable { failure: ApplicationsError },
	#[serde(rename_all = "camelCase")]
	Store { failure: TranscriptStoreError },
	#[serde(rename_all = "camelCase")]
	Environment { failure: EnvError },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
}

impl From<ApplicationsError> for ConnectorError {
	fn from(failure: ApplicationsError) -> Self {
		ConnectorError::Unsearchable { failure }
	}
}

impl From<TranscriptStoreError> for ConnectorError {
	fn from(failure: TranscriptStoreError) -> Self {
		ConnectorError::Store { failure }
	}
}

impl From<DatabaseError> for ConnectorError {
	fn from(error: DatabaseError) -> Self {
		ConnectorError::Store { failure: error.into() }
	}
}

impl From<EnvError> for ConnectorError {
	fn from(failure: EnvError) -> Self {
		ConnectorError::Environment { failure }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn an_application_crosses_to_the_front_under_the_names_it_reads() {
		let application = Application {
			name: "superset".to_owned(),
			title: "Superset".to_owned(),
			description: "Run workspaces.".to_owned(),
			config: json!({ "type": "http", "url": "https://superset.test/mcp" }),
			tools: vec!["tasks_list".to_owned()],
			logo: None,
			install: Install::Key {
				name: "Authorization".to_owned(),
				secret: "SUPERSET_API_KEY".to_owned(),
				description: None,
			},
		};

		assert_eq!(
			to_value(application).expect("it serialises"),
			json!({
				"name": "superset",
				"title": "Superset",
				"description": "Run workspaces.",
				"config": { "type": "http", "url": "https://superset.test/mcp" },
				"tools": ["tasks_list"],
				"install": { "kind": "key", "name": "Authorization", "secret": "SUPERSET_API_KEY" },
			})
		);
	}

	#[test]
	fn every_error_names_its_kind() {
		assert_eq!(
			to_value(ApplicationsError::RegistryRefused { status: 503 }).expect("it serialises"),
			json!({ "kind": "registryRefused", "status": 503 })
		);
		assert_eq!(
			to_value(ApplicationsError::RegistryTimedOut).expect("it serialises"),
			json!({ "kind": "registryTimedOut" })
		);
	}
}
