import type {
	CompanionArrival,
	TranscriptCursor,
	TranscriptDraft,
	TranscriptMessage,
} from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"
import {
	initialTranscriptState,
	selectHasMore,
	selectHasNewer,
	selectMessages,
	selectNewestSeq,
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
	load: (conversationId: string) => Promise<void>
	reopen: (conversationId: string) => Promise<void>
	loadOlder: (conversationId: string) => Promise<void>
	loadNewer: (conversationId: string) => Promise<void>
	loadLatest: (conversationId: string) => Promise<void>
	askLanding: (
		conversationId: string,
		seq: number,
	) => () => Promise<TranscriptMessage[]>
	follow: (conversationId: string, isAtLiveEdge: boolean) => void
	leave: (conversationId: string) => void
	append: (draft: TranscriptDraft) => void
	announce: (arrival: CompanionArrival) => void
	stream: (delta: TranscriptDelta) => void
	settle: (settlement: TranscriptSettlement) => void
}

export const createTranscriptController = (
	port: TranscriptPort,
): TranscriptController => {
	let state = initialTranscriptState
	const listeners = new Set<() => void>()
	const liveEdges = new Map<string, boolean>()
	const openLandings = new Map<string, number>()
	let landingsAsked = 0

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

	const load = async (conversationId: string) => {
		if (
			openLandings.has(conversationId) ||
			selectHasNewer(state, conversationId)
		) {
			return
		}
		await readPage(conversationId, null)
	}

	const loadOlder = async (conversationId: string) => {
		const beforeSeq = selectOldestSeq(state, conversationId)
		if (beforeSeq === null || !selectHasMore(state, conversationId)) {
			return
		}
		await readPage(conversationId, { beforeSeq })
	}

	const loadNewer = async (conversationId: string) => {
		const seq = selectNewestSeq(state, conversationId)
		if (seq === null || !selectHasNewer(state, conversationId)) {
			return
		}
		const window = await port.loadWindow(conversationId, seq)
		dispatch({ type: "newerLoaded", window })
	}

	const loadLatest = async (conversationId: string) => {
		if (!selectHasNewer(state, conversationId)) {
			return
		}
		const page = await port.loadPage(conversationId, null)
		dispatch({ type: "latestLoaded", page })
	}

	const reopen = async (conversationId: string) => {
		if (selectMessages(state, conversationId).length > 0) {
			return
		}
		await load(conversationId)
	}

	const askLanding = (conversationId: string, seq: number) => {
		landingsAsked += 1
		const asked = landingsAsked
		openLandings.set(conversationId, asked)
		const closeLanding = () => {
			if (openLandings.get(conversationId) !== asked) {
				return false
			}
			openLandings.delete(conversationId)
			return true
		}

		return async () => {
			try {
				const window = await port.loadWindow(conversationId, seq)
				if (closeLanding()) {
					dispatch({ type: "windowLanded", window })
				}
				return window.messages
			} catch (reason) {
				if (closeLanding()) {
					await reopen(conversationId)
				}
				throw reason
			}
		}
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
		reopen,
		loadOlder,
		loadNewer,
		loadLatest,
		askLanding,
		follow: (conversationId, isAtLiveEdge) => {
			liveEdges.set(conversationId, isAtLiveEdge)
		},
		leave: (conversationId) => {
			openLandings.delete(conversationId)
			dispatch({ type: "threadLeft", conversationId })
		},
		append: (draft) =>
			dispatch({
				type: "messageAppended",
				draft,
				isAtLiveEdge: liveEdges.get(draft.conversationId) ?? true,
			}),
		announce: (arrival) => dispatch({ type: "arrivalAnnounced", arrival }),
		stream: (delta) => dispatch({ type: "messageStreamed", delta }),
		settle: (settlement) => dispatch({ type: "messageSettled", settlement }),
	}
}
