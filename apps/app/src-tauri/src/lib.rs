pub mod claude;

use tauri::{Manager, RunEvent};

use claude::commands::{invoke_handler, shutdown_blocking};
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
		// Both events, because the platform that skips one still has to reap the
		// child: taking the session out makes the second call a no-op.
		.run(|app, event| {
			if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
				shutdown_blocking(app);
			}
		})
}
