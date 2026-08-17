import type { TranscriptCursor, TranscriptPage } from "./transcript-contract"

/** Reads one page of a conversation, newest first: a `null` cursor asks for the
 * tail, a cursor asks for what precedes it. `hasMore` is the page's own answer
 * about older messages, because only the source knows what it did not send. */
export type TranscriptPort = {
	loadPage: (
		conversationId: string,
		cursor: TranscriptCursor | null,
	) => Promise<TranscriptPage>
}
