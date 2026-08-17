import type { TranscriptCursor, TranscriptDraft } from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"
import {
	initialTranscriptState,
	selectHasMore,
	selectOldestSeq,
	type TranscriptAction,
	type TranscriptDelta,
	type TranscriptSettlement,
	type TranscriptState,
	transcriptReducer,
} from "./transcript-state"

export type TranscriptController = {
	getState: () => TranscriptState
	subscribe: (listener: () => void) => () => void
	/** Reads the tail of a conversation. Re-reading it merges, it never replaces. */
	load: (conversationId: string) => Promise<void>
	loadOlder: (conversationId: string) => Promise<void>
	append: (draft: TranscriptDraft) => void
	stream: (delta: TranscriptDelta) => void
	settle: (settlement: TranscriptSettlement) => void
}

export const createTranscriptController = (
	port: TranscriptPort,
): TranscriptController => {
	let state = initialTranscriptState
	const listeners = new Set<() => void>()

	const dispatch = (action: TranscriptAction) => {
		const next = transcriptReducer(state, action)
		if (next === state) {
			return
		}
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	const readPage = async (
		conversationId: string,
		cursor: TranscriptCursor | null,
	) => {
		const page = await port.loadPage(conversationId, cursor)
		dispatch({ type: "pageLoaded", page })
	}

	const load = (conversationId: string) => readPage(conversationId, null)

	const loadOlder = async (conversationId: string) => {
		const beforeSeq = selectOldestSeq(state, conversationId)
		if (beforeSeq === null || !selectHasMore(state, conversationId)) {
			return
		}
		await readPage(conversationId, { beforeSeq })
	}

	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		load,
		loadOlder,
		append: (draft) => dispatch({ type: "messageAppended", draft }),
		stream: (delta) => dispatch({ type: "messageStreamed", delta }),
		settle: (settlement) => dispatch({ type: "messageSettled", settlement }),
	}
}
