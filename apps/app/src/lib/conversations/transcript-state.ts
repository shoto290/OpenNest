import type {
	TerminalCompletion,
	TranscriptCompletion,
	TranscriptDraft,
	TranscriptMessage,
	TranscriptPage,
} from "./transcript-contract"

export type TranscriptDelta = {
	conversationId: string
	id: string
	text: string
}

export type TranscriptSettlement = {
	conversationId: string
	id: string
	completion: TerminalCompletion
}

export type TranscriptConversation = {
	messages: TranscriptMessage[]
	hasMore: boolean
}

/** Keyed by conversation and by nothing else: a runtime session is a detail of
 * how a message was produced, never of where it is read back. */
export type TranscriptState = {
	conversations: Record<string, TranscriptConversation>
}

export type TranscriptAction =
	| { type: "pageLoaded"; page: TranscriptPage }
	| { type: "messageAppended"; draft: TranscriptDraft }
	| { type: "messageStreamed"; delta: TranscriptDelta }
	| { type: "messageSettled"; settlement: TranscriptSettlement }

export const initialTranscriptState: TranscriptState = { conversations: {} }

const NO_MESSAGES: TranscriptMessage[] = []

const EMPTY_CONVERSATION: TranscriptConversation = {
	messages: NO_MESSAGES,
	hasMore: false,
}

const TERMINAL_RANK = 2

/** How far a message has travelled. */
const COMPLETION_RANK: Record<TranscriptCompletion, number> = {
	pending: 0,
	streaming: 1,
	complete: TERMINAL_RANK,
	cancelled: TERMINAL_RANK,
	failed: TERMINAL_RANK,
	interrupted: TERMINAL_RANK,
}

export const isTerminalCompletion = (
	completion: TranscriptCompletion,
): boolean => COMPLETION_RANK[completion] === TERMINAL_RANK

export const selectMessages = (
	state: TranscriptState,
	conversationId: string,
): TranscriptMessage[] =>
	state.conversations[conversationId]?.messages ?? NO_MESSAGES

export const selectHasMore = (
	state: TranscriptState,
	conversationId: string,
): boolean => state.conversations[conversationId]?.hasMore ?? false

/** Messages are held in ascending order, so the front of the list is as far back
 * as the transcript goes. */
const oldestSeq = (messages: TranscriptMessage[]): number | null =>
	messages[0]?.seq ?? null

/** Where the next page of older messages starts. Null while nothing is loaded. */
export const selectOldestSeq = (
	state: TranscriptState,
	conversationId: string,
): number | null => oldestSeq(selectMessages(state, conversationId))

const byPosition = (
	left: TranscriptMessage,
	right: TranscriptMessage,
): number => {
	if (left.seq !== right.seq) {
		return left.seq - right.seq
	}
	if (left.id === right.id) {
		return 0
	}
	return left.id < right.id ? -1 : 1
}

/** Nothing on disk can resume a stream, so a row still streaming when it is read
 * back belongs to a process that died under it. Only a message nothing here has
 * ever seen: the same row for one already streaming means the write is behind the
 * live stream, not that anything died. */
const recoveredFromPort = (message: TranscriptMessage): TranscriptMessage =>
	message.completion === "streaming"
		? { ...message, completion: "interrupted" }
		: message

/** Two nonterminal sides are the same message caught at two moments of the same
 * stream, and the longer text is the later one. */
const longerContent = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): string =>
	local.content.length >= durable.content.length
		? local.content
		: durable.content

/** The first ending is the one that happened: a page carrying another one is a
 * disagreement about the past, and the transcript keeps what it settled on. Only
 * the very same ending brings text back, and then the stored row is the full one —
 * a locally settled message holds no more than its deltas produced. */
const reconciledFromEnding = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage => ({
	...durable,
	completion: local.completion,
	content:
		durable.completion === local.completion ? durable.content : local.content,
})

/** An unfinished message follows the durable row as soon as that row has travelled
 * as far, which an ending always has. Behind a live stream it wins nothing: the
 * write is late, not authoritative. */
const reconciledFromUnfinished = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage => {
	if (isTerminalCompletion(durable.completion)) {
		return durable
	}
	const durableWins =
		COMPLETION_RANK[durable.completion] >= COMPLETION_RANK[local.completion]
	return {
		...durable,
		completion: durableWins ? durable.completion : local.completion,
		content: longerContent(local, durable),
	}
}

/** Structure comes from the durable row in every case — it owns identity and
 * order, so an optimistic `seq` always gives way. Only the outcome is contested. */
const reconciled = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage =>
	isTerminalCompletion(local.completion)
		? reconciledFromEnding(local, durable)
		: reconciledFromUnfinished(local, durable)

const mergePage = (
	current: TranscriptMessage[],
	incoming: TranscriptMessage[],
): TranscriptMessage[] => {
	const byId = new Map(current.map((message) => [message.id, message]))
	for (const durable of incoming) {
		const local = byId.get(durable.id)
		byId.set(
			durable.id,
			local ? reconciled(local, durable) : recoveredFromPort(durable),
		)
	}
	return [...byId.values()].sort(byPosition)
}

/** Only a page that reaches further back than what is loaded can say whether more
 * history exists: re-reading the tail after the beginning was reached would
 * otherwise reopen a history the reader has already seen in full. */
const nextHasMore = (
	current: TranscriptConversation,
	page: TranscriptPage,
	merged: TranscriptMessage[],
): boolean => {
	if (page.messages.length === 0) {
		return page.hasMore
	}
	const loadedOldest = oldestSeq(current.messages)
	const mergedOldest = oldestSeq(merged)
	if (loadedOldest === null || mergedOldest === null) {
		return page.hasMore
	}
	return mergedOldest < loadedOldest ? page.hasMore : current.hasMore
}

const withConversation = (
	state: TranscriptState,
	conversationId: string,
	conversation: TranscriptConversation,
): TranscriptState => ({
	conversations: { ...state.conversations, [conversationId]: conversation },
})

const applyPageLoaded = (
	state: TranscriptState,
	page: TranscriptPage,
): TranscriptState => {
	const current = state.conversations[page.conversationId] ?? EMPTY_CONVERSATION
	if (page.messages.length === 0 && page.hasMore === current.hasMore) {
		return state
	}
	const messages = mergePage(current.messages, page.messages)
	return withConversation(state, page.conversationId, {
		messages,
		hasMore: nextHasMore(current, page, messages),
	})
}

/** The optimistic place: the durable row keeps its own `seq` the moment it lands. */
const applyMessageAppended = (
	state: TranscriptState,
	draft: TranscriptDraft,
): TranscriptState => {
	const current =
		state.conversations[draft.conversationId] ?? EMPTY_CONVERSATION
	if (current.messages.some((message) => message.id === draft.id)) {
		return state
	}
	const seq = (current.messages.at(-1)?.seq ?? 0) + 1
	return withConversation(state, draft.conversationId, {
		...current,
		messages: [...current.messages, { ...draft, seq }],
	})
}

const applyMessageStreamed = (
	state: TranscriptState,
	delta: TranscriptDelta,
): TranscriptState => {
	const current = state.conversations[delta.conversationId]
	if (!current) {
		return state
	}
	const index = current.messages.findIndex((message) => message.id === delta.id)
	if (index === -1) {
		return state
	}
	const target = current.messages[index]
	if (target.completion !== "streaming") {
		return state
	}
	return withConversation(state, delta.conversationId, {
		...current,
		messages: current.messages.with(index, {
			...target,
			content: target.content + delta.text,
		}),
	})
}

/** An ending is final and only an ending settles: the state check stands even
 * though the type says so too, because what reaches a reducer at runtime comes
 * from a transport no type ever checked. */
const applyMessageSettled = (
	state: TranscriptState,
	settlement: TranscriptSettlement,
): TranscriptState => {
	if (!isTerminalCompletion(settlement.completion)) {
		return state
	}
	const current = state.conversations[settlement.conversationId]
	if (!current) {
		return state
	}
	const index = current.messages.findIndex(
		(message) => message.id === settlement.id,
	)
	if (index === -1) {
		return state
	}
	const target = current.messages[index]
	if (isTerminalCompletion(target.completion)) {
		return state
	}
	return withConversation(state, settlement.conversationId, {
		...current,
		messages: current.messages.with(index, {
			...target,
			completion: settlement.completion,
		}),
	})
}

export const transcriptReducer = (
	state: TranscriptState,
	action: TranscriptAction,
): TranscriptState => {
	switch (action.type) {
		case "pageLoaded":
			return applyPageLoaded(state, action.page)
		case "messageAppended":
			return applyMessageAppended(state, action.draft)
		case "messageStreamed":
			return applyMessageStreamed(state, action.delta)
		case "messageSettled":
			return applyMessageSettled(state, action.settlement)
	}
}
