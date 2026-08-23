import { type ChatState, isTurnBusy } from "../chat/chat-state"
import type { UserPreferences } from "../user/preferences-contract"

/** The three moments a reader looking elsewhere is worth interrupting for. A turn
 * that failed is deliberately not one of them: nothing was answered. */
export type NotifiedEvent = "question" | "permission" | "finishedTurn"

/** Which bot a notification is about, and what it happened for. The words are the
 * caller's business. */
export type NotifiedChange = {
	botId: string
	event: NotifiedEvent
}

export type NotificationSwitches = Pick<
	UserPreferences,
	"notifyOnQuestion" | "notifyOnPermission" | "notifyOnFinishedTurn"
>

/** Everything the decision needs, so nothing is read off the host, the window, the
 * clock or the record. Focus, not visibility: a window sitting behind another one is
 * still on the screen, and its reader is still elsewhere. */
export type NotificationPolicyInput = {
	botId: string
	before: ChatState
	after: ChatState
	switches: NotificationSwitches
	hasFocus: boolean
}

const SWITCH_OF: Record<NotifiedEvent, keyof NotificationSwitches> = {
	question: "notifyOnQuestion",
	permission: "notifyOnPermission",
	finishedTurn: "notifyOnFinishedTurn",
}

type Request = { id: string } | null

/** A request the reader has not been told about yet. Compared by id rather than by
 * presence: the same wait travels across every publish that follows it, and only a
 * request the state before did not hold is news. */
const isNewRequest = (before: Request, after: Request): boolean =>
	after !== null && before?.id !== after.id

/** A turn the reader was waiting on that answered on its own. A failure is not a
 * finish — the turn ended with nothing to come back to — and neither is a stop the
 * reader asked for: they already know, and nothing answered. */
const hasTurnFinished = (before: ChatState, after: ChatState): boolean =>
	isTurnBusy(before.turn) &&
	before.turn !== "stopping" &&
	!isTurnBusy(after.turn) &&
	after.turn !== "failed"

const eventsIn = (before: ChatState, after: ChatState): NotifiedEvent[] => {
	const events: NotifiedEvent[] = []
	if (isNewRequest(before.question, after.question)) {
		events.push("question")
	}
	if (isNewRequest(before.permission, after.permission)) {
		events.push("permission")
	}
	if (hasTurnFinished(before, after)) {
		events.push("finishedTurn")
	}
	return events
}

/** What one state change is worth telling the reader, if anything. Empty while the
 * window holds the focus — they are already looking at it — and empty for an event
 * whose switch is off. */
export const notificationsFor = ({
	botId,
	before,
	after,
	switches,
	hasFocus,
}: NotificationPolicyInput): NotifiedChange[] => {
	if (hasFocus) {
		return []
	}
	return eventsIn(before, after)
		.filter((event) => switches[SWITCH_OF[event]])
		.map((event) => ({ botId, event }))
}
