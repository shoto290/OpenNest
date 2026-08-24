
use tauri::{AppHandle, Runtime};

pub const ACTIVATED_EVENT: &str = "notification://activated";

#[tauri::command]
pub async fn notification_show<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
	title: String,
	body: String,
) {
	show(app, bot_id, title, body);
}

#[cfg(target_os = "macos")]
fn show<R: Runtime>(app: AppHandle<R>, bot_id: String, title: String, body: String) {
	use mac_notification_sys::{set_application, Notification, NotificationResponse};
	use tauri::Emitter;

	let identifier = app.config().identifier.clone();
	tauri::async_runtime::spawn_blocking(move || {
		let _ = set_application(&identifier);
		let response = Notification::new()
			.title(&title)
			.message(&body)
			.wait_for_click(true)
			.send();
		if let Ok(NotificationResponse::Click) = response {
			let _ = app.emit(ACTIVATED_EVENT, bot_id);
		}
	});
}

#[cfg(not(target_os = "macos"))]
fn show<R: Runtime>(app: AppHandle<R>, _bot_id: String, title: String, body: String) {
	use tauri_plugin_notification::NotificationExt;

	let _ = app.notification().builder().title(title).body(body).show();
}
