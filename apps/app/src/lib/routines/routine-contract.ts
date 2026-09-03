import type { Filter, TriggerSource } from "./trigger-contract"

export type RunOutcome = "ok" | "nothing" | "skipped" | "failed"

export type Routine = {
	id: string
	conversationId: string
	botId: string
	title: string
	instruction: string
	triggerSourceId: string
	filter: Filter
	triggerConfig: unknown
	isEnabled: boolean
	consecutiveFailures: number
	createdAt: number
}

export type RoutineDraft = {
	conversationId: string
	botId: string
	title: string
	instruction: string
	triggerSourceId: string
	filter: Filter
	triggerConfig: unknown
}

export type RoutineEdit = {
	title: string
	instruction: string
	filter: Filter
	triggerConfig: unknown
	isEnabled: boolean
}

export type RoutineKey = {
	key: string
	header?: string
	url?: string
}

export type RoutineRun = {
	id: string
	routineId: string
	startedAt: number
	endedAt: number | null
	outcome: RunOutcome | null
	reason: string | null
	costUsd: number | null
	modelUsage: unknown
}

export type RunClosing = {
	outcome: RunOutcome
	reason?: string
	costUsd?: number
	modelUsage?: unknown
	reportedTurnId?: string
}

export type ReportRefusal =
	| "unknownTurn"
	| "turnOfAnotherConversation"
	| "turnAlreadyReported"
	| "turnWithoutReport"

export type ReportedRun = {
	turnId: string
	routineTitle: string
	triggerSourceId: string
}

export type ReportedRunsByTurnId = ReadonlyMap<string, ReportedRun>

export type TriggerEvent = {
	routineId: string
	source: TriggerSource
	payload: unknown
}

export type RunCause = "trigger" | "runNow"

export type RunRequested = {
	cause: RunCause
	title: string
	instruction: string
	routineId: string
	runId: string
	botId: string
	conversationId: string
	triggerSourceId: string
	payload: unknown
}

export type SkipReason = "leaseHeld" | "hourlyCap" | "backingOff"

export type Refusal =
	| "disabled"
	| "filter"
	| "dedupeValueMissing"
	| "alreadySeen"

export type TriggerDecision =
	| { kind: "started"; runId: string }
	| { kind: "skipped"; runId: string; reason: SkipReason }
	| { kind: "refused"; by: Refusal }
