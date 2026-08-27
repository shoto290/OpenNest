import type {
	NotificationActivation,
	NotificationPort,
	NotificationRequest,
	NotificationTarget,
} from "./notification-port"

export type FakeNotificationPort = NotificationPort & {
	sent: NotificationRequest[]
	activate: (target: NotificationTarget) => void
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

		activate: (target) => {
			for (const listener of [...listeners]) {
				listener(target)
			}
		},
	}
}
