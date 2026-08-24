export type NotificationRequest = {
	botId: string
	title: string
	body: string
}

export type NotificationActivation = (botId: string) => void

export type NotificationUnsubscribe = () => void

export type NotificationPort = {
	send: (request: NotificationRequest) => Promise<void>
	onActivate: (
		listener: NotificationActivation,
	) => Promise<NotificationUnsubscribe>
}
