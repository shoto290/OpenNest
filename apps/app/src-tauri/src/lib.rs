pub mod attachments;
pub mod avatars;
pub mod agent;
pub mod bundles;
pub mod commands;
pub mod conversations;
pub mod db;
pub mod environment;
pub mod notifications;
pub mod routines;
pub mod sections;
pub mod spaces;
pub mod user;
mod private_files;
mod window_controls;

use tauri::{Manager, RunEvent};

use agent::commands::terminate_session;
use agent::AgentState;
use commands::invoke_handler;

pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			window_controls::raise_main(app);
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
			if let Some(window) = app.get_webview_window("main") {
				window_controls::center_in_header(&window);
			}
			app.manage(routines::sentinel::spawn(app.handle().clone()));
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
				if let Some(sentinel) = app.try_state::<routines::sentinel::Sentinel>() {
					sentinel.stop();
				}
				tauri::async_runtime::block_on(terminate_session(
					app.state::<AgentState>().inner(),
				));
			}
		})
}
