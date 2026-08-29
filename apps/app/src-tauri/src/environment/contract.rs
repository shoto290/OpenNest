use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvOwner {
	#[serde(rename_all = "camelCase")]
	Space { id: String },
	#[serde(rename_all = "camelCase")]
	Bot { id: String, space_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvScope {
	#[serde(rename_all = "camelCase")]
	Space { id: String },
	#[serde(rename_all = "camelCase")]
	Bot { id: String, space_id: String },
	#[serde(rename_all = "camelCase")]
	Server { name: String, owner: EnvOwner },
}

impl From<&EnvOwner> for EnvScope {
	fn from(owner: &EnvOwner) -> Self {
		match owner {
			EnvOwner::Space { id } => EnvScope::Space { id: id.clone() },
			EnvOwner::Bot { id, space_id } => {
				EnvScope::Bot { id: id.clone(), space_id: space_id.clone() }
			}
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvEntry {
	pub name: String,
	pub defined_in: EnvScope,
	pub served_from: EnvScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvError {
	#[serde(rename_all = "camelCase")]
	InvalidName { name: String },
	#[serde(rename_all = "camelCase")]
	InvalidScope { detail: String },
	#[serde(rename_all = "camelCase")]
	Unreadable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json, to_value};

	use super::*;

	#[test]
	fn a_server_scope_crosses_to_the_front_carrying_its_owner() {
		assert_eq!(
			to_value(EnvScope::Server {
				name: "clock".to_owned(),
				owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
			})
			.expect("the scope serializes"),
			json!({
				"kind": "server",
				"name": "clock",
				"owner": { "kind": "bot", "id": "b1", "spaceId": "s1" }
			})
		);
	}

	#[test]
	fn a_scope_crosses_back_from_the_front_under_the_names_it_reads() {
		assert_eq!(
			from_value::<EnvScope>(json!({ "kind": "bot", "id": "b1", "spaceId": "s1" }))
				.expect("the scope deserializes"),
			EnvScope::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
		);
		assert_eq!(
			from_value::<EnvScope>(json!({ "kind": "space", "id": "s1" }))
				.expect("the scope deserializes"),
			EnvScope::Space { id: "s1".to_owned() }
		);
	}

	#[test]
	fn a_refused_name_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(EnvError::InvalidName { name: "lower".to_owned() }).expect("the error"),
			json!({ "kind": "invalidName", "name": "lower" })
		);
	}

	#[test]
	fn an_entry_names_where_it_is_defined_and_what_serves_it() {
		assert_eq!(
			to_value(EnvEntry {
				name: "TOKEN".to_owned(),
				defined_in: EnvScope::Space { id: "s1".to_owned() },
				served_from: EnvScope::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
			})
			.expect("the entry serializes"),
			json!({
				"name": "TOKEN",
				"definedIn": { "kind": "space", "id": "s1" },
				"servedFrom": { "kind": "bot", "id": "b1", "spaceId": "s1" }
			})
		);
	}
}
