//! The vocabulary attachments cross to the frontend in.
//!
//! Two crossings and nothing else: what the frontend hands over, and why nothing
//! was stored. The answer is a list of absolute paths, which needs no type of its
//! own — a path is what an attachment *is* on the way to Claude.
//!
//! The storage failures borrow [`StorageFailure`] rather than restating it: the
//! file that refuses a transcript write is the same file, and a second spelling of
//! the same outcome would be a second thing for the frontend to branch on. Nothing
//! here carries a path — where this host keeps its files is its own business, and
//! an error on its way to the webview is the last place it may leak into.

use serde::{Deserialize, Serialize};

use super::Rejection;
use crate::conversations::contract::StorageFailure;
use crate::db::DatabaseError;

/// One file as the frontend hands it over: what the user's file was called, and
/// its bytes. The name is a label and never a location — see
/// [`super::minted_name`] for what survives of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmittedAttachment {
	pub name: String,
	pub bytes: Vec<u8>,
}

/// Why nothing was stored. Every variant means the same thing about the disk —
/// none of the submitted files landed — and they are told apart so the UI can say
/// which file a user has to swap, and a bug report can name the rest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AttachmentStoreError {
	/// The database never opened, so no conversation could be recognised.
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	/// The file is there, this call did not get an answer out of it.
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	/// A conversation the record does not hold. The one refusal a caller can act
	/// on: what it is holding is behind the file, and reloading is what puts them
	/// back together.
	#[serde(rename_all = "camelCase")]
	UnknownConversation { id: String },
	/// More files than one prompt may carry.
	#[serde(rename_all = "camelCase")]
	TooMany { count: usize, limit: usize },
	/// Carries the limit as well as the file, so the UI can say the number without
	/// holding a copy of it.
	#[serde(rename_all = "camelCase")]
	TooLarge { name: String, bytes: u64, limit: u64 },
	/// No file to name: each one is acceptable and the call is not.
	#[serde(rename_all = "camelCase")]
	TooLargeTogether { bytes: u64, limit: u64 },
	/// The disk refused, or there was nowhere to write. Not the user's to fix, but
	/// it is still why the prompt has no files, so it answers on the same channel.
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}

impl From<Rejection> for AttachmentStoreError {
	fn from(rejection: Rejection) -> Self {
		match rejection {
			Rejection::TooMany { count, limit } => AttachmentStoreError::TooMany { count, limit },
			Rejection::TooLarge { name, bytes, limit } => {
				AttachmentStoreError::TooLarge { name, bytes, limit }
			}
			Rejection::TooLargeTogether { bytes, limit } => {
				AttachmentStoreError::TooLargeTogether { bytes, limit }
			}
			Rejection::Unwritable { detail } => AttachmentStoreError::Unwritable { detail },
		}
	}
}

impl From<DatabaseError> for AttachmentStoreError {
	fn from(error: DatabaseError) -> Self {
		AttachmentStoreError::Storage { failure: (&error).into() }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};

	use super::*;

	fn crosses_as(error: AttachmentStoreError) -> Value {
		serde_json::to_value(&error).expect("the refusal serializes")
	}

	/// The wire shape is asserted literally rather than round-tripped: a rename
	/// would survive a round trip and break every reader on the other side.
	#[test]
	fn a_refusal_crosses_under_the_names_the_frontend_reads() {
		assert_eq!(
			crosses_as(AttachmentStoreError::UnknownConversation { id: "c1".to_owned() }),
			json!({ "kind": "unknownConversation", "id": "c1" })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooLarge {
				name: "huge.bin".to_owned(),
				bytes: 21,
				limit: 20
			}),
			json!({ "kind": "tooLarge", "name": "huge.bin", "bytes": 21, "limit": 20 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooMany { count: 21, limit: 20 }),
			json!({ "kind": "tooMany", "count": 21, "limit": 20 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooLargeTogether { bytes: 101, limit: 100 }),
			json!({ "kind": "tooLargeTogether", "bytes": 101, "limit": 100 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::Unwritable { detail: "no space".to_owned() }),
			json!({ "kind": "unwritable", "detail": "no space" })
		);
	}

	/// A submission is JSON a frontend builds by hand, so it is parsed rather than
	/// round-tripped: `Uint8Array` reaches the host as an array of numbers.
	#[test]
	fn a_submitted_file_is_read_from_the_shape_the_frontend_sends() {
		let submitted: SubmittedAttachment =
			serde_json::from_value(json!({ "name": "notes.md", "bytes": [1, 2, 3] }))
				.expect("the submission parses");

		assert_eq!(
			submitted,
			SubmittedAttachment { name: "notes.md".to_owned(), bytes: vec![1, 2, 3] }
		);
	}
}
