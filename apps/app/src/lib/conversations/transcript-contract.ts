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

export type TranscriptPage = {
	conversationId: string
	messages: TranscriptMessage[]
	hasMore: boolean
}
