/** What the platform is asked to show, and which conversation it stands for. */
export type NotificationRequest = {
	/** Which bot the notification is about, so a click can land back in that
	 * conversation rather than wherever the app was left.
	 *
	 * Awaiting a route that can carry it: `tauri-plugin-notification` keeps nothing
	 * about a notification it has shown, so a macOS click is to be delivered
	 * through `mac-notification-sys` — already in the tree under `notify-rust` —
	 * whose `send_notification` answers with a `NotificationResponse`. The event
	 * that route emits carries this id, and `onActivate` in
	 * `notification-transport.ts` is what receives it. */
	botId: string
	title: string
	body: string
}

export type NotificationActivation = (botId: string) => void

export type NotificationUnsubscribe = () => void

/** Telling a reader who is looking elsewhere that a bot has answered.
 *
 * `send` never rejects and never reports what became of the notification: the
 * platform owns whether one is shown at all — permission may be refused, the
 * reader may be sitting in front of the window, the system may be presenting
 * nothing at that moment — and none of those is a failure this app can act on. */
export type NotificationPort = {
	send: (request: NotificationRequest) => Promise<void>
	onActivate: (
		listener: NotificationActivation,
	) => Promise<NotificationUnsubscribe>
}
