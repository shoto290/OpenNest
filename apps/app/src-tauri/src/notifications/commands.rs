//! Telling a reader a bot has answered, and hearing back when they click.
//!
//! One crossing, two platforms behind it. macOS goes through
//! `mac-notification-sys` because that is the only route on this host that keeps
//! anything about a notification it has shown: `tauri-plugin-notification` shows
//! through `notify-rust` and drops the response handle, and its `register_listener`
//! is `#[cfg(mobile)]`, so a click there reaches nothing. Everywhere else the
//! plugin still shows the notification and no click comes back.
//!
//! Nothing here fails: the platform owns whether a notification is shown at all —
//! permission may be refused, the reader may be looking at the window — and none of
//! those is an outcome the frontend can act on.

use tauri::{AppHandle, Runtime};

/// Where a click lands. The bot id the notification was sent with is the whole
/// payload: it is what lets the frontend open the conversation the notification
/// stood for rather than whatever was last on screen.
pub const ACTIVATED_EVENT: &str = "notification://activated";

/// Shows one notification and returns. The reader may take a minute to answer or
/// never answer at all, so the wait for that happens elsewhere and no caller is
/// held on it.
#[tauri::command]
pub async fn notification_show<R: Runtime>(
	app: AppHandle<R>,
	bot_id: String,
	title: String,
	body: String,
) {
	show(app, bot_id, title, body);
}

/// `send_notification` blocks until the reader answers or the notification goes
/// away by itself, so it is handed to a blocking thread and the command returns.
/// The crate is built for being called from one: the delegate callbacks still
/// arrive on the main thread, where it starts its own poll timer, and this thread
/// only waits on a condvar — the window keeps drawing while a notification sits on
/// screen.
///
/// What that costs: one held thread per notification still on screen. A banner
/// takes itself away after a few seconds and frees its thread with it, but a
/// notification the reader has set to Alert style stays until it is answered, and
/// so does the thread waiting on it. Nothing here caps that — a reader ignoring
/// notifications all day holds one thread each, and the number of notifications
/// this app sends is the number of times a bot answers while they were looking
/// elsewhere.
///
/// Only a click on the notification itself emits. A close and a timeout both answer
/// something other than [`NotificationResponse::Click`] and leave the frontend
/// untold, which is what keeps a reader who ignored the notification where they
/// were.
#[cfg(target_os = "macos")]
fn show<R: Runtime>(app: AppHandle<R>, bot_id: String, title: String, body: String) {
	use mac_notification_sys::{set_application, Notification, NotificationResponse};
	use tauri::Emitter;

	let identifier = app.config().identifier.clone();
	tauri::async_runtime::spawn_blocking(move || {
		// Otherwise the crate picks its own default and the notification arrives
		// wearing Finder's name. Guarded by a `Once` inside the crate, so every send
		// after the first is a no-op, and a host that will not take the identifier
		// leaves the process announcing itself as whatever it already was.
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

/// The plugin, unchanged. It shows the notification and keeps nothing, so the bot
/// has nowhere to go and no click is ever reported.
#[cfg(not(target_os = "macos"))]
fn show<R: Runtime>(app: AppHandle<R>, _bot_id: String, title: String, body: String) {
	use tauri_plugin_notification::NotificationExt;

	let _ = app.notification().builder().title(title).body(body).show();
}
