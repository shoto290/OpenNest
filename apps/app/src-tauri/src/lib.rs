pub mod attachments;
pub mod avatars;
pub mod agent;
pub mod bundles;
pub mod commands;
pub mod conversations;
pub mod db;
pub mod notifications;
pub mod spaces;
pub mod user;
mod private_files;

use tauri::{Manager, RunEvent};

use agent::commands::terminate_session;
use agent::AgentState;
use commands::invoke_handler;

pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			if let Some(window) = app.get_webview_window("main") {
				let _ = window.unminimize();
				let _ = window.show();
				let _ = window.set_focus();
			}
		}))
		.plugin(
			tauri_plugin_window_state::Builder::default()
				.with_state_flags(
					tauri_plugin_window_state::StateFlags::SIZE
						| tauri_plugin_window_state::StateFlags::POSITION
						| tauri_plugin_window_state::StateFlags::MAXIMIZED,
				)
				.build(),
		)
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(tauri_plugin_os::init())
		.manage(AgentState::default())
		.setup(|app| {
			app.manage(db::bootstrap(app.handle()));
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				conversations::commands::list_bundles_at_launch(&handle).await;
			});
			Ok(())
		})
		.invoke_handler(invoke_handler())
		.build(tauri::generate_context!())
		.expect("error while building tauri application")
		.run(|app, event| {
			if matches!(event, RunEvent::Exit) {
				tauri::async_runtime::block_on(terminate_session(
					app.state::<AgentState>().inner(),
				));
			}
		})
}
