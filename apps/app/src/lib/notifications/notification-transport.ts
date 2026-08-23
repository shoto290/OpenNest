import { sendNotification } from "@tauri-apps/plugin-notification"

import type { NotificationPort } from "./notification-port"

export const notificationTransport: NotificationPort = {
	/** Nothing is asked before sending. The platform grants in hard code — the
	 * plugin's desktop `permission_state` and `request_permission` both answer
	 * `Granted` without ever consulting the OS — so a notification the reader has
	 * refused in system settings is dropped silently and the app cannot know.
	 *
	 * The bot is not passed on: the desktop plugin shows the notification and keeps
	 * nothing, so there is no payload for a click to come back with. */
	send: async ({ title, body }) => {
		try {
			sendNotification({ title, body })
		} catch {
			// A platform that will not take a notification is a platform that shows
			// none. There was nothing else this call was going to do.
		}
	},

	/** The listener is dropped: nothing on the desktop host can fire it.
	 * `tauri-plugin-notification` shows through `notify-rust` and discards the
	 * handle without awaiting a response, and `onAction` rejects here — no
	 * `register_listener` command is registered outside mobile.
	 *
	 * Routing a click to its bot belongs here when that becomes possible. Bringing
	 * the window back does not: `src-tauri/src/lib.rs` already unminimizes, shows
	 * and focuses it for the single-instance handler, which is the layer that can. */
	onActivate: async () => () => undefined,
}
