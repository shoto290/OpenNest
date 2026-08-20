//! The one crossing attachments have: bytes in, absolute paths out.

use tauri::{AppHandle, Runtime, State};

use super::contract::{AttachmentStoreError, SubmittedAttachment};
use super::{dir, store};
use crate::db;

/// The database, or why the launch never got one — the same answer every
/// conversation command gives, in this feature's vocabulary.
fn ready(state: &db::DatabaseState) -> Result<&db::Database, AttachmentStoreError> {
	state.as_ref().map_err(|failure| AttachmentStoreError::Unavailable { failure: failure.into() })
}

/// The files a prompt is about to name, written down and answered as paths.
///
/// The conversation is matched against the record first, and that check is what
/// makes an id from a webview usable as a directory name: everything past it is a
/// string this host minted itself. Whatever the record does not hold is refused
/// before a directory is resolved, so a call for a conversation that is not there
/// leaves nothing on the disk to sweep.
///
/// The store is all-or-nothing — see [`super::store`] — so the answer is the path
/// of every submitted file or no file at all. The order is the submitted one: a
/// prompt appends these paths in the order the user attached them.
#[tauri::command]
pub async fn chat_store_attachments<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	attachments: Vec<SubmittedAttachment>,
) -> Result<Vec<String>, AttachmentStoreError> {
	let known = ready(&state)?.conversations().conversation_ids().await?;
	if !known.iter().any(|id| id == &conversation_id) {
		return Err(AttachmentStoreError::UnknownConversation { id: conversation_id });
	}
	let root = dir(&app).ok_or(AttachmentStoreError::Unwritable {
		detail: "there is no application data directory to store attachments in".to_owned(),
	})?;
	let stored = store(&root, &conversation_id, &attachments)?;
	// Lossy because a path is not text: every component of these is this host's own
	// directory name or its own UUID, so nothing here can arrive as bytes no
	// encoding survives.
	Ok(stored.iter().map(|path| path.to_string_lossy().into_owned()).collect())
}
