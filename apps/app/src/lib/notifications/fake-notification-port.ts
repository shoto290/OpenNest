import type {
	NotificationActivation,
	NotificationPort,
	NotificationRequest,
} from "./notification-port"

export type FakeNotificationPort = NotificationPort & {
	sent: NotificationRequest[]
	activate: (botId: string) => void
}

export const createFakeNotificationPort = (): FakeNotificationPort => {
	const sent: NotificationRequest[] = []
	const listeners = new Set<NotificationActivation>()

	return {
		sent,

		send: async (request) => {
			sent.push(request)
		},

		onActivate: async (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		activate: (botId) => {
			for (const listener of [...listeners]) {
				listener(botId)
			}
		},
	}
}
