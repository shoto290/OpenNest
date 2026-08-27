import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { NotificationPort, NotificationTarget } from "./notification-port"

const ACTIVATED_EVENT = "notification://activated"

export const notificationTransport: NotificationPort = {
	send: async ({ target, title, body }) => {
		try {
			await invoke("notification_show", { target, title, body })
		} catch (reason) {
			console.error("notification transport: notification_show failed", reason)
		}
	},

	onActivate: (listener) =>
		listen<NotificationTarget>(ACTIVATED_EVENT, (event) =>
			listener(event.payload),
		),
}
