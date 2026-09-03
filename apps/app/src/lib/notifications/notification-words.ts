import { i18n } from "@workspace/ui/lib/i18n"

import type { NotifiedEvent } from "./notification-policy"
import type { NotificationRequest } from "./notification-port"

const BODY_KEY = {
	question: "common:notification.question",
	permission: "common:notification.permission",
	finishedTurn: "common:notification.finishedTurn",
} as const satisfies Record<NotifiedEvent, string>

export type NotificationFailure = "clicks" | "focus" | "reveal" | "send"

const FAILURE_TITLE_KEY = {
	clicks: "common:notification.failure.clicks",
	focus: "common:notification.failure.focus",
	reveal: "common:notification.failure.reveal",
	send: "common:notification.failure.send",
} as const satisfies Record<NotificationFailure, string>

export const notificationFailureTitleFor = (
	failure: NotificationFailure,
): string => i18n.t(FAILURE_TITLE_KEY[failure])

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
