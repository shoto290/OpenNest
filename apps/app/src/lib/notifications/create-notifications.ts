import type { NotificationPort } from "./notification-port"
import { notificationTransport } from "./notification-transport"

import { isDesktopHost } from "../host"

/** Only the Tauri host has a desktop to put a notification on. `bun dev:web` runs
 * in a tab that is already the window the reader is looking at, so there is nobody
 * to tell and nothing to click back to. */
export const createNotifications = (): NotificationPort =>
	isDesktopHost()
		? notificationTransport
		: {
				send: async () => undefined,
				onActivate: async () => () => undefined,
			}
