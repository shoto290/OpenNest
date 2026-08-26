use serde::{Deserialize, Serialize};

use crate::conversations::contract::{AvatarBlot, StorageFailure};
use crate::db::repositories::spaces;
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
	pub id: String,
	pub name: String,
	pub colour: AvatarBlot,
	pub position: i64,
	pub created_at: i64,
}

impl From<spaces::Space> for Space {
	fn from(space: spaces::Space) -> Self {
		Self {
			id: space.id,
			name: space.name,
			colour: space.colour.into(),
			position: space.position,
			created_at: space.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SpaceError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	UnknownSpace {
		id: String,
	},
	IncompleteOrder,
	LastSpace,
}

impl From<DatabaseError> for SpaceError {
	fn from(error: DatabaseError) -> Self {
		SpaceError::Storage { failure: (&error).into() }
	}
}

impl From<spaces::SpaceError> for SpaceError {
	fn from(error: spaces::SpaceError) -> Self {
		match error {
			spaces::SpaceError::UnknownSpace { id } => SpaceError::UnknownSpace { id },
			spaces::SpaceError::IncompleteOrder => SpaceError::IncompleteOrder,
			spaces::SpaceError::LastSpace => SpaceError::LastSpace,
			spaces::SpaceError::Database(failure) => {
				SpaceError::Storage { failure: (&failure).into() }
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_space_crosses_to_the_front_under_the_names_it_reads() {
		assert_eq!(
			to_value(Space {
				id: "s1".to_owned(),
				name: "Vocca".to_owned(),
				colour: AvatarBlot::Cyan,
				position: 1,
				created_at: 3,
			})
			.expect("the space serializes"),
			json!({
				"id": "s1",
				"name": "Vocca",
				"colour": "cyan",
				"position": 1,
				"createdAt": 3
			})
		);
	}

	#[test]
	fn the_refusal_to_drop_the_last_space_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::LastSpace)).expect("the error"),
			json!({ "kind": "lastSpace" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::UnknownSpace { id: "s1".to_owned() }))
				.expect("the error"),
			json!({ "kind": "unknownSpace", "id": "s1" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::IncompleteOrder)).expect("the error"),
			json!({ "kind": "incompleteOrder" })
		);
	}
}
