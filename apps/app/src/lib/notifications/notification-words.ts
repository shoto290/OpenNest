import { i18n } from "@workspace/ui/lib/i18n"

import type { NotifiedEvent } from "./notification-policy"
import type { NotificationRequest } from "./notification-port"

/** What each event is called in the catalogues. Read off the runtime rather than
 * through a hook: a notification is sent from a controller subscription, where there
 * is no render to read a translation in. */
const BODY_KEY = {
	question: "common:notification.question",
	permission: "common:notification.permission",
	finishedTurn: "common:notification.finishedTurn",
} as const satisfies Record<NotifiedEvent, string>

export type NotificationWordsInput = {
	botName: string
	event: NotifiedEvent
}

/** The two lines a notification carries: who answered, and what they did. Never a
 * message, a question, a permission or a description — macOS keeps what it is given
 * in its notification centre until the reader clears it, and a conversation is not
 * something to leave lying there. */
export const notificationWordsFor = ({
	botName,
	event,
}: NotificationWordsInput): Pick<NotificationRequest, "title" | "body"> => ({
	title: botName,
	body: i18n.t(BODY_KEY[event]),
})
