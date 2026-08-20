//! The one invoke handler the host installs.
//!
//! A Tauri app takes a single handler, and `generate_handler!` builds it from a
//! closed list, so the list cannot live inside a feature's module without that
//! module having to name every other feature's commands. It sits at the root
//! instead: a feature owns its commands, this file owns which of them the frontend
//! can reach, and adding one is a single line neither module has to know about.

use tauri::Runtime;

use crate::{agent, attachments, conversations, user};

/// The commands are named by their module rather than imported: the attribute on
/// each one leaves a macro beside it that `generate_handler!` reaches through the
/// same path, and a `use` of the function alone would not bring it along.
pub fn invoke_handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static
{
	tauri::generate_handler![
		attachments::commands::chat_store_attachments,
		agent::commands::claude_check,
		agent::commands::claude_models,
		agent::commands::claude_start_or_resume_session,
		agent::commands::claude_submit_prompt,
		agent::commands::claude_cancel_turn,
		agent::commands::claude_respond_to_permission,
		agent::commands::claude_shutdown,
		agent::commands::claude_load_session,
		agent::commands::claude_save_session,
		conversations::commands::conversation_bots,
		conversations::commands::conversation_create_bot,
		conversations::commands::conversation_update_bot,
		conversations::commands::conversation_delete_bot,
		conversations::commands::conversation_set_bot_avatar_image,
		conversations::commands::conversation_record_bot_commands,
		conversations::commands::conversation_bot_commands,
		conversations::commands::conversation_main_chat,
		conversations::commands::conversation_open_runtime_session,
		conversations::commands::conversation_record_provider_session,
		conversations::commands::conversation_bounded_context,
		conversations::commands::conversation_capture_checkpoint,
		conversations::commands::conversation_message_page,
		conversations::commands::conversation_start_turn,
		conversations::commands::conversation_complete_turn,
		conversations::commands::conversation_append_user_message,
		conversations::commands::conversation_open_assistant_message,
		conversations::commands::conversation_append_text,
		conversations::commands::conversation_finalize_message,
		user::commands::user_preferences,
		user::commands::user_set_preferences,
		user::commands::user_set_profile_picture,
	]
}
