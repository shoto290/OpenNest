import {
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptMessage,
} from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"

export type FakeTranscriptPortOptions = {
	messages: TranscriptMessage[]
	pageSize?: number
}

export const createFakeTranscriptPort = (
	options: FakeTranscriptPortOptions,
): TranscriptPort => {
	const pageSize = options.pageSize ?? TRANSCRIPT_PAGE_SIZE
	const stored = [...options.messages].sort(
		(left, right) => left.seq - right.seq,
	)

	return {
		loadPage: (conversationId, cursor) => {
			const owned = stored.filter(
				(message) => message.conversationId === conversationId,
			)
			const older = cursor
				? owned.filter((message) => message.seq < cursor.beforeSeq)
				: owned
			const messages = older.slice(-pageSize)
			return Promise.resolve({
				conversationId,
				messages,
				hasMore: older.length > messages.length,
			})
		},
	}
}
