export type TranscriptRole = "user" | "assistant"

/** The endings a message never comes back from. */
export type TerminalCompletion =
	| "complete"
	| "cancelled"
	| "failed"
	| "interrupted"

export type TranscriptCompletion = "pending" | "streaming" | TerminalCompletion

/** One stored row of `messages`, named as the reader meets it. `seq` is the only
 * order that counts: two rows written in the same millisecond still have to come
 * back in the order they were appended, so `createdAt` is for display alone. */
export type TranscriptMessage = {
	id: string
	conversationId: string
	turnId: string
	seq: number
	role: TranscriptRole
	content: string
	completion: TranscriptCompletion
	createdAt: number
}

/** A message the app appends before the store has given it a place. */
export type TranscriptDraft = Omit<TranscriptMessage, "seq">

export type TranscriptCursor = {
	beforeSeq: number
}

/** The size of one crossing: the fake port reads the same number, so a test
 * pages the way production does. */
export const TRANSCRIPT_PAGE_SIZE = 20

export type TranscriptPage = {
	conversationId: string
	messages: TranscriptMessage[]
	hasMore: boolean
}
