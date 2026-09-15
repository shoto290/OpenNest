use serde::{Deserialize, Serialize};

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
