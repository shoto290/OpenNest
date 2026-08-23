import type {
	NotificationActivation,
	NotificationPort,
	NotificationRequest,
} from "./notification-port"

/** The port with the platform taken out of it: every send is kept where a test can
 * read it, and the click nobody can perform in a test is performed by calling
 * `activate`. */
export type FakeNotificationPort = NotificationPort & {
	sent: NotificationRequest[]
	/** The reader clicking the notification that was sent for this bot. */
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
