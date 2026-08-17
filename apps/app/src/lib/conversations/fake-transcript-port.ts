import type { TranscriptMessage } from "./contract"
import type { TranscriptPort } from "./transcript-port"

export type FakeTranscriptPortOptions = {
	messages: TranscriptMessage[]
	pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20

/** An in-memory stand-in for the stored conversation: the same rows in, the same
 * pages out, so a test reads what a query would have returned. */
export const createFakeTranscriptPort = (
	options: FakeTranscriptPortOptions,
): TranscriptPort => {
	const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
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
