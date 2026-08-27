import {
	type TerminalCompletion,
	TRANSCRIPT_WINDOW_SIZE,
	type TranscriptCompletion,
	type TranscriptDraft,
	type TranscriptMessage,
	type TranscriptPage,
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
	settledText?: string
}

export type TranscriptConversation = {
	messages: TranscriptMessage[]
	hasMore: boolean
}

export type TranscriptState = {
	conversations: Record<string, TranscriptConversation>
}

export type TranscriptAction =
	| { type: "pageLoaded"; page: TranscriptPage }
	| {
			type: "messageAppended"
			draft: TranscriptDraft
			isAtLiveEdge: boolean
	  }
	| { type: "messageStreamed"; delta: TranscriptDelta }
	| { type: "messageSettled"; settlement: TranscriptSettlement }

export const initialTranscriptState: TranscriptState = { conversations: {} }

const NO_MESSAGES: TranscriptMessage[] = []

const EMPTY_CONVERSATION: TranscriptConversation = {
	messages: NO_MESSAGES,
	hasMore: false,
}

const TERMINAL_RANK = 2

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

export type LastWord = {
	text?: string
	at: number
	authorBotId?: string
}

export type ConversationPreviews = Record<string, LastWord | undefined>

export const lastWordIn = (
	messages: TranscriptMessage[],
): LastWord | undefined => {
	const settled = messages.findLast((message) =>
		isTerminalCompletion(message.completion),
	)
	if (!settled) {
		return undefined
	}
	return {
		text: settled.content.trim() || undefined,
		at: settled.createdAt,
		authorBotId: settled.authorBotId ?? undefined,
	}
}

const oldestSeq = (messages: TranscriptMessage[]): number | null =>
	messages[0]?.seq ?? null

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

const recoveredFromPort = (message: TranscriptMessage): TranscriptMessage =>
	message.completion === "streaming"
		? { ...message, completion: "interrupted" }
		: message

const longerContent = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): string =>
	local.content.length >= durable.content.length
		? local.content
		: durable.content

const reconciledFromEnding = (
	local: TranscriptMessage,
	durable: TranscriptMessage,
): TranscriptMessage => ({
	...durable,
	completion: local.completion,
	content:
		durable.completion === local.completion ? durable.content : local.content,
})

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

const droppedCount = (
	messages: TranscriptMessage[],
	runningTurnId: string,
): number => {
	const overflow = messages.length - TRANSCRIPT_WINDOW_SIZE
	if (overflow <= 0) {
		return 0
	}
	const held = messages.findIndex(
		(message) =>
			message.turnId === runningTurnId ||
			!isTerminalCompletion(message.completion),
	)
	return Math.min(overflow, held)
}

const applyMessageAppended = (
	state: TranscriptState,
	draft: TranscriptDraft,
	isAtLiveEdge: boolean,
): TranscriptState => {
	const current =
		state.conversations[draft.conversationId] ?? EMPTY_CONVERSATION
	if (current.messages.some((message) => message.id === draft.id)) {
		return state
	}
	const seq = (current.messages.at(-1)?.seq ?? 0) + 1
	const grown = [...current.messages, { ...draft, seq }]
	const dropped = isAtLiveEdge ? droppedCount(grown, draft.turnId) : 0
	return withConversation(state, draft.conversationId, {
		messages: grown.slice(dropped),
		hasMore: current.hasMore || dropped > 0,
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
			content: settlement.settledText ?? target.content,
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
			return applyMessageAppended(state, action.draft, action.isAtLiveEdge)
		case "messageStreamed":
			return applyMessageStreamed(state, action.delta)
		case "messageSettled":
			return applyMessageSettled(state, action.settlement)
	}
}
