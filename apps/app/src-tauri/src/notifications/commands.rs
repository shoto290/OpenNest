use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

pub const ACTIVATED_EVENT: &str = "notification://activated";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct NotificationTarget {
	pub kind: String,
	pub id: String,
}

#[tauri::command]
pub async fn notification_show<R: Runtime>(
	app: AppHandle<R>,
	target: NotificationTarget,
	title: String,
	body: String,
) {
	show(app, target, title, body);
}

#[cfg(target_os = "macos")]
fn show<R: Runtime>(app: AppHandle<R>, target: NotificationTarget, title: String, body: String) {
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
			let _ = app.emit(ACTIVATED_EVENT, target);
		}
	});
}

#[cfg(not(target_os = "macos"))]
fn show<R: Runtime>(app: AppHandle<R>, _target: NotificationTarget, title: String, body: String) {
	use tauri_plugin_notification::NotificationExt;

	let _ = app.notification().builder().title(title).body(body).show();
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json, to_value};

	use super::*;

	#[test]
	fn a_notification_reads_the_kind_it_stands_for_beside_its_id() {
		let target: NotificationTarget =
			from_value(json!({ "kind": "conversation", "id": "c-1" }))
				.expect("the target reads");

		assert_eq!(target.kind, "conversation");
		assert_eq!(target.id, "c-1");
	}

	#[test]
	fn a_clicked_notification_carries_its_kind_and_its_id_back() {
		assert_eq!(
			to_value(NotificationTarget {
				kind: "bot".to_owned(),
				id: "b-1".to_owned(),
			})
			.expect("the target serializes"),
			json!({ "kind": "bot", "id": "b-1" })
		);
	}
}
