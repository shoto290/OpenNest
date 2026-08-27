import { i18n } from "@workspace/ui/lib/i18n"

import type { NotifiedEvent } from "./notification-policy"
import type { NotificationRequest } from "./notification-port"

const BODY_KEY = {
	question: "common:notification.question",
	permission: "common:notification.permission",
	finishedTurn: "common:notification.finishedTurn",
} as const satisfies Record<NotifiedEvent, string>

export type NotificationWordsInput = {
	name: string
	event: NotifiedEvent
}

export const notificationWordsFor = ({
	name,
	event,
}: NotificationWordsInput): Pick<NotificationRequest, "title" | "body"> => ({
	title: name,
	body: i18n.t(BODY_KEY[event]),
})
