pub mod claude;

use tauri::{Manager, RunEvent};

use claude::commands::{invoke_handler, terminate_session};
use claude::ClaudeState;

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
		.manage(ClaudeState::default())
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
