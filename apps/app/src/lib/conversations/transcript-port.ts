import type { TranscriptCursor, TranscriptPage } from "./transcript-contract"

export type TranscriptPort = {
	loadPage: (
		conversationId: string,
		cursor: TranscriptCursor | null,
	) => Promise<TranscriptPage>
}
