export type TranscriptRole = "user" | "assistant"

export type TerminalCompletion =
	| "complete"
	| "cancelled"
	| "failed"
	| "interrupted"

export type TranscriptCompletion = "pending" | "streaming" | TerminalCompletion

export type TranscriptMessage = {
	id: string
	conversationId: string
	turnId: string
	seq: number
	role: TranscriptRole
	content: string
	completion: TranscriptCompletion
	createdAt: number
	authorBotId: string | null
	repliedToMessageId: string | null
	runtimeSessionId: string | null
}

export type TranscriptDraft = Omit<TranscriptMessage, "seq">

export type TranscriptCursor = {
	beforeSeq: number
}

export const TRANSCRIPT_PAGE_SIZE = 20

export const TRANSCRIPT_WINDOW_SIZE = 60

export const COMPANION_ARRIVED_EVENT = "conversation://companion-arrived"

export type CompanionArrival = {
	id: string
	conversationId: string
	botId: string
	invitedByBotId: string | null
	lastMessageSeq: number
	createdAt: number
}

export type TranscriptPage = {
	conversationId: string
	messages: TranscriptMessage[]
	arrivals: CompanionArrival[]
	hasMore: boolean
}

export type TranscriptWindow = {
	conversationId: string
	messages: TranscriptMessage[]
	arrivals: CompanionArrival[]
	hasOlder: boolean
	hasNewer: boolean
}
