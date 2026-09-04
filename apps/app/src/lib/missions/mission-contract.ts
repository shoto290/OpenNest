import type { Bot, StorageFailure } from "@/lib/conversations/store-contract"

export type MissionEventKind =
	| "opened"
	| "note"
	| "agent_asked"
	| "answered"
	| "escalated"
	| "ready"
	| "failed"
	| "closed"

export type MissionState =
	| "working"
	| "waiting_bot"
	| "waiting_human"
	| "ready_to_merge"
	| "failed"
	| "done"

export type Ticket = {
	platform: string
	externalId: string
	url: string
	title: string
}

export type MissionDraft = {
	originConversationId: string
	botId: string
	objective: string
	ticket: Ticket
	tools: string[]
	source: string
}

export type MissionNote = {
	source: string
	payload: unknown
}

export type MissionEntry = {
	kind: MissionEventKind
	source: string
	payload: unknown
}

export type Mission = {
	id: string
	originConversationId: string
	botId: string
	threadConversationId: string
	objective: string
	ticket: Ticket
	tools: string[]
	state: MissionState
	openedAt: number
	closedAt: number | null
}

export type MissionEvent = {
	id: string
	missionId: string
	kind: MissionEventKind
	source: string
	payload: unknown
	createdAt: number
}

export type MissionDetail = {
	mission: Mission
	events: MissionEvent[]
}

export type ConversationMissions = {
	open: Mission[]
	done: Mission[]
}

export type MissionOnBoard = {
	mission: Mission
	bot: Bot
}

export type MissionError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "unknownMission"; id: string }
	| { kind: "unknownConversation"; id: string }
	| { kind: "missionAlreadyClosed"; id: string }
	| { kind: "unknownBot"; id: string }
	| { kind: "unknownParticipant"; conversationId: string; botId: string }
	| { kind: "blankField"; field: string }
	| { kind: "undeliverable"; detail: string }
	| { kind: "unexpected"; detail: string }

export type MissionChanged = {
	missionId: string
	state: MissionState
}
