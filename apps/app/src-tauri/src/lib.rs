pub mod avatars;
pub mod claude;
pub mod commands;
pub mod conversations;
pub mod db;
pub mod user;

use tauri::{Manager, RunEvent};

use claude::commands::terminate_session;
use claude::ClaudeState;
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
		// What finishes an update: the installed build only replaces the running one
		// once the app is started again.
		.plugin(tauri_plugin_process::init())
		// A link followed in the conversation goes to the system browser: the
		// webview has nowhere to open it but over the app itself.
		.plugin(tauri_plugin_opener::init())
		.manage(ClaudeState::default())
		// The database is opened once, here, because `app_data_dir()` needs the
		// resolved identifier only the built app carries. A failure is managed like
		// any other outcome: the window still opens, and the state says why there is
		// no database.
		.setup(|app| {
			app.manage(db::bootstrap(app.handle()));
			Ok(())
		})
		.invoke_handler(invoke_handler())
		.build(tauri::generate_context!())
		.expect("error while building tauri application")
		// Tauri quits through `std::process::exit`, so no destructor runs and
		// `kill_on_drop` never fires. `Exit` is the last, uncancellable event
		// before that call — unlike `ExitRequested`, which a listener may veto.
		.run(|app, event| {
			if matches!(event, RunEvent::Exit) {
				tauri::async_runtime::block_on(terminate_session(
					app.state::<ClaudeState>().inner(),
				));
			}
		})
}
