import type { NotifiedMissionState } from "./notification-words"

import { type ChatState, isTurnBusy } from "../chat/chat-state"
import type { ConversationState } from "../conversations/conversation-controller"
import type { UserPreferences } from "../user/preferences-contract"

export type NotifiedEvent = "question" | "permission" | "finishedTurn"

export type NotifiedChange = {
	botId: string
	event: NotifiedEvent
}

export type NotificationSwitches = Pick<
	UserPreferences,
	"notifyOnQuestion" | "notifyOnPermission" | "notifyOnFinishedTurn"
>

export type ConversationRound = Pick<
	ConversationState,
	"speakers" | "waitingBotIds"
>

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

const isNewRequest = (before: Request, after: Request): boolean =>
	after !== null && before?.id !== after.id

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

export type ConversationPolicyInput = {
	before: ConversationRound
	after: ConversationRound
	switches: NotificationSwitches
	hasFocus: boolean
}

const isRoundBusy = ({ speakers, waitingBotIds }: ConversationRound) =>
	speakers.length > 0 || waitingBotIds.length > 0

export const notifiesFinishedRound = ({
	before,
	after,
	switches,
	hasFocus,
}: ConversationPolicyInput): boolean =>
	!hasFocus &&
	switches.notifyOnFinishedTurn &&
	isRoundBusy(before) &&
	!isRoundBusy(after)

export type MissionPolicyInput = {
	state: NotifiedMissionState
	switches: NotificationSwitches
	hasFocus: boolean
}

const MISSION_SWITCH_OF = {
	waiting_human: "notifyOnQuestion",
	ready_to_merge: "notifyOnFinishedTurn",
} as const satisfies Record<NotifiedMissionState, keyof NotificationSwitches>

export const notifiesMission = ({
	state,
	switches,
	hasFocus,
}: MissionPolicyInput): boolean =>
	!hasFocus && switches[MISSION_SWITCH_OF[state]]
