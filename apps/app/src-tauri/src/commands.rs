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
		agent::commands::agent_check,
		agent::commands::agent_models,
		agent::commands::agent_tools,
		agent::commands::agent_start_or_resume_session,
		agent::commands::agent_submit_prompt,
		agent::commands::agent_cancel_turn,
		agent::commands::agent_respond_to_permission,
		agent::commands::agent_answer_question,
		agent::commands::agent_shutdown,
		agent::commands::agent_load_session,
		agent::commands::agent_save_session,
		conversations::commands::conversation_bots,
		conversations::commands::conversation_create_bot,
		conversations::commands::conversation_duplicate_bot,
		conversations::commands::conversation_update_bot,
		conversations::commands::conversation_delete_bot,
		conversations::commands::conversation_set_bot_avatar_image,
		conversations::commands::conversation_bot_skills,
		conversations::commands::conversation_create_bot_skill,
		conversations::commands::conversation_update_bot_skill,
		conversations::commands::conversation_set_bot_skill_preloaded,
		conversations::commands::conversation_delete_bot_skill,
		conversations::commands::conversation_bot_mcp_servers,
		conversations::commands::conversation_set_bot_mcp_server,
		conversations::commands::conversation_delete_bot_mcp_server,
		conversations::commands::conversation_bot_history,
		conversations::commands::conversation_bot_history_diff,
		conversations::commands::conversation_bot_revert,
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
