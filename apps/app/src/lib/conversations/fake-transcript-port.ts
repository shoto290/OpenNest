import {
	TRANSCRIPT_PAGE_SIZE,
	TRANSCRIPT_WINDOW_SIZE,
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

	const ownedBy = (conversationId: string) =>
		stored.filter((message) => message.conversationId === conversationId)

	return {
		loadPage: (conversationId, cursor) => {
			const owned = ownedBy(conversationId)
			const older = cursor
				? owned.filter((message) => message.seq < cursor.beforeSeq)
				: owned
			const messages = older.slice(-pageSize)
			return Promise.resolve({
				conversationId,
				messages,
				arrivals: [],
				hasMore: older.length > messages.length,
			})
		},

		loadWindow: (conversationId, seq) => {
			const owned = ownedBy(conversationId)
			const centre = owned.findIndex((message) => message.seq === seq)
			if (centre === -1) {
				return Promise.reject(
					new Error(`no message at seq ${seq} in ${conversationId}`),
				)
			}
			const budget = TRANSCRIPT_WINDOW_SIZE - 1
			const behind = Math.min(Math.floor(budget / 2), centre)
			const ahead = Math.min(budget - behind, owned.length - centre - 1)
			const start = Math.max(0, centre - (budget - ahead))
			const end = centre + ahead + 1
			return Promise.resolve({
				conversationId,
				messages: owned.slice(start, end),
				arrivals: [],
				hasOlder: start > 0,
				hasNewer: end < owned.length,
			})
		},
	}
}
