//! The durable transcript as the frontend reaches it.
//!
//! Every command here is one crossing and nothing else: it resolves the database,
//! hands the call to the repository that owns the rule, and answers in the
//! vocabulary of [`super::contract`]. No rule is restated at this layer — replays,
//! endings and identity are decided inside the transaction that writes them, and a
//! second copy of any of those checks up here would be a second answer for a
//! caller to have to reconcile.
//!
//! A host whose file never opened still runs, so nothing may assume there is a
//! database: every command reads the managed [`db::DatabaseState`] first and
//! answers [`TranscriptStoreError::Unavailable`] when there is none. The frontend
//! is told the transcript is not being written, and why, instead of being handed a
//! silent success it would go on appending to.

use tauri::State;

use super::contract::{
	Bot, Chat, NewAssistantMessage, NewTurn, NewUserMessage, TerminalCompletion, TranscriptPage,
	TranscriptStoreError,
};
use crate::db;
use crate::db::repositories::messages::MessagePageQuery;

/// The database, or why the launch never got one. Borrowed rather than cloned:
/// [`db::DatabaseState`] owns the outcome for the whole run.
fn ready(state: &db::DatabaseState) -> Result<&db::Database, TranscriptStoreError> {
	state.as_ref().map_err(|failure| TranscriptStoreError::Unavailable { failure: failure.into() })
}

#[tauri::command]
pub async fn conversation_default_bot(
	state: State<'_, db::DatabaseState>,
) -> Result<Bot, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().ensure_default_bot().await?.into())
}

#[tauri::command]
pub async fn conversation_main_chat(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Chat, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().ensure_chat(bot_id).await?.into())
}

/// `before_seq` is exclusive, and `None` asks for the newest page: that is the end
/// a conversation is opened at, and the only one a reader can name before it holds
/// a single message.
#[tauri::command]
pub async fn conversation_message_page(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
) -> Result<TranscriptPage, TranscriptStoreError> {
	let query = MessagePageQuery { conversation_id: conversation_id.clone(), before_seq, limit };
	let page = ready(&state)?.messages().page_messages(query).await?;
	Ok(TranscriptPage::of(conversation_id, page))
}

#[tauri::command]
pub async fn conversation_start_turn(
	state: State<'_, db::DatabaseState>,
	turn: NewTurn,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().start_turn(turn.into()).await?)
}

#[tauri::command]
pub async fn conversation_complete_turn(
	state: State<'_, db::DatabaseState>,
	id: String,
	completed_at: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().complete_turn(id, completed_at).await?)
}

#[tauri::command]
pub async fn conversation_append_user_message(
	state: State<'_, db::DatabaseState>,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().append_user_message(message.into()).await?)
}

#[tauri::command]
pub async fn conversation_open_assistant_message(
	state: State<'_, db::DatabaseState>,
	message: NewAssistantMessage,
) -> Result<i64, TranscriptStoreError> {
	Ok(ready(&state)?.messages().open_assistant_message(message.into()).await?)
}

#[tauri::command]
pub async fn conversation_append_text(
	state: State<'_, db::DatabaseState>,
	id: String,
	delta: String,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().append_text(id, delta).await?)
}

#[tauri::command]
pub async fn conversation_finalize_message(
	state: State<'_, db::DatabaseState>,
	id: String,
	completion: TerminalCompletion,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().finalize_message(id, completion.into()).await?)
}
