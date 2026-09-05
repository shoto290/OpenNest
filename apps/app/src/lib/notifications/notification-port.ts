export type NotificationTarget = {
	kind: "bot" | "conversation" | "mission"
	id: string
}

export type NotificationRequest = {
	target: NotificationTarget
	title: string
	body: string
}

export type NotificationActivation = (target: NotificationTarget) => void

export type NotificationUnsubscribe = () => void

export type NotificationPort = {
	send: (request: NotificationRequest) => Promise<void>
	onActivate: (
		listener: NotificationActivation,
	) => Promise<NotificationUnsubscribe>
}
