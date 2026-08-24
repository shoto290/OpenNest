import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { NotificationPort } from "./notification-port"

const ACTIVATED_EVENT = "notification://activated"

export const notificationTransport: NotificationPort = {
	send: async ({ botId, title, body }) => {
		try {
			await invoke("notification_show", { botId, title, body })
		} catch (reason) {
			console.error("notification transport: notification_show failed", reason)
		}
	},

	onActivate: (listener) =>
		listen<string>(ACTIVATED_EVENT, (event) => listener(event.payload)),
}
