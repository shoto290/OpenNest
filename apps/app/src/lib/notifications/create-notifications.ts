import type { NotificationPort } from "./notification-port"
import { notificationTransport } from "./notification-transport"

import { isDesktopHost } from "../host"

export const createNotifications = (): NotificationPort =>
	isDesktopHost()
		? notificationTransport
		: {
				send: async () => undefined,
				onActivate: async () => () => undefined,
			}
