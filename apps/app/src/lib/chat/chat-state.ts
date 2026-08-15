import type {
	ActivityEvent,
	ActivityStatus,
	ChatMessage,
	ClaudeEvent,
	ConnectionState,
	MessageCompletion,
	PermissionDecision,
	PermissionRequest,
	TransportError,
	TurnEnded,
	TurnOutcome,
	TurnState,
} from "../claude/contract"

export type ChatError = {
	id: string
	error: TransportError
}

export type ChatState = {
	epoch: number
	connection: ConnectionState
	turn: TurnState
	/** The host holds a live child process. Set when the session opens, not when
	 * Claude first reports its id — `sessionReady` only lands after a prompt. */
	sessionOpen: boolean
	sessionId: string | null
	binaryVersion: string | null
	messages: ChatMessage[]
	activities: ActivityEvent[]
	permission: PermissionRequest | null
	errors: ChatError[]
	errorCount: number
	deltaSeqs: Record<string, number>
}

export type ChatAction =
	| { type: "driverEvent"; epoch: number; event: ClaudeEvent }
	/** A session died or was replaced. Clears what belonged to that process and
	 * keeps the transcript the reader can still see. */
	| { type: "sessionReset"; epoch: number }
	/** Drops the transcript itself. Only a deliberate "new conversation" does this. */
	| { type: "conversationCleared" }
	| { type: "sessionOpened" }
	| { type: "promptSubmitted"; message: ChatMessage }
	| { type: "promptRejected"; id: string; error: TransportError }
	| { type: "promptRetried"; id: string }
	| { type: "stopRejected"; error: TransportError }
	| { type: "binaryVersion"; version: string | null }

export const initialChatState: ChatState = {
	epoch: 0,
	connection: "checking",
	turn: "idle",
	sessionOpen: false,
	sessionId: null,
	binaryVersion: null,
	messages: [],
	activities: [],
	permission: null,
	errors: [],
	errorCount: 0,
	deltaSeqs: {},
}

const MAX_ERRORS = 20

const TURN_TRANSITIONS: Record<TurnState, TurnState[]> = {
	idle: ["submitting"],
	submitting: ["running", "stopping", "idle", "failed"],
	running: ["stopping", "idle", "failed"],
	stopping: ["idle", "failed"],
	failed: ["submitting", "idle"],
}

const ACTIVITY_RANK: Record<ActivityStatus, number> = {
	pending: 0,
	running: 1,
	succeeded: 2,
	failed: 2,
}

/** A turn Claude is still working on. Nothing else may be submitted. */
export function isTurnBusy(turn: TurnState): boolean {
	return turn === "submitting" || turn === "running" || turn === "stopping"
}

/** A busy turn that has not been asked to stop yet. */
export function canStopTurn(turn: TurnState): boolean {
	return turn === "submitting" || turn === "running"
}

/** A live session able to take a prompt. The id Claude reports arrives later. */
export function isSessionReady(state: ChatState): boolean {
	return state.connection === "ready" && state.sessionOpen
}

export function completionForOutcome(outcome: TurnOutcome): MessageCompletion {
	switch (outcome) {
		case "completed":
			return "complete"
		case "cancelled":
			return "cancelled"
		case "failed":
			return "failed"
	}
}

export function turnForOutcome(outcome: TurnOutcome): TurnState {
	return outcome === "failed" ? "failed" : "idle"
}

function setTurn(state: ChatState, next: TurnState): ChatState {
	if (state.turn === next) {
		return state
	}
	if (!TURN_TRANSITIONS[state.turn].includes(next)) {
		return state
	}
	return { ...state, turn: next }
}

function pushError(state: ChatState, error: TransportError): ChatState {
	const entry = { id: `${error.kind}-${state.errorCount}`, error }
	return {
		...state,
		errorCount: state.errorCount + 1,
		errors: [...state.errors, entry].slice(-MAX_ERRORS),
	}
}

function finalizeStreaming(
	messages: ChatMessage[],
	completion: MessageCompletion,
): ChatMessage[] {
	if (!messages.some((message) => message.completion === "streaming")) {
		return messages
	}
	return messages.map((message) =>
		message.completion === "streaming" ? { ...message, completion } : message,
	)
}

function applyMessageDelta(
	state: ChatState,
	event: { id: string; seq: number; text: string },
): ChatState {
	const index = state.messages.findIndex((message) => message.id === event.id)
	if (index === -1) {
		return state
	}
	const target = state.messages[index]
	if (target.completion !== "streaming") {
		return state
	}
	const lastSeq = state.deltaSeqs[event.id]
	if (lastSeq !== undefined && event.seq <= lastSeq) {
		return state
	}
	return {
		...state,
		messages: state.messages.with(index, {
			...target,
			text: target.text + event.text,
		}),
		deltaSeqs: { ...state.deltaSeqs, [event.id]: event.seq },
	}
}

function applyMessageStarted(
	state: ChatState,
	message: ChatMessage,
): ChatState {
	if (state.messages.some((entry) => entry.id === message.id)) {
		return state
	}
	return { ...state, messages: [...state.messages, message] }
}

function applyMessageCompleted(
	state: ChatState,
	message: ChatMessage,
): ChatState {
	const index = state.messages.findIndex((entry) => entry.id === message.id)
	if (index === -1) {
		return { ...state, messages: [...state.messages, message] }
	}
	const previous = state.messages[index]
	const text = message.text || previous.text
	return {
		...state,
		messages: state.messages.with(index, { ...message, text }),
	}
}

function applyActivity(state: ChatState, activity: ActivityEvent): ChatState {
	const index = state.activities.findIndex((entry) => entry.id === activity.id)
	if (index === -1) {
		return { ...state, activities: [...state.activities, activity] }
	}
	if (
		ACTIVITY_RANK[activity.status] <
		ACTIVITY_RANK[state.activities[index].status]
	) {
		return state
	}
	return { ...state, activities: state.activities.with(index, activity) }
}

function applyPermissionRequested(
	state: ChatState,
	request: PermissionRequest,
): ChatState {
	if (state.turn !== "submitting" && state.turn !== "running") {
		return state
	}
	if (state.permission && state.permission.id !== request.id) {
		return state
	}
	return { ...state, permission: request }
}

/** The answer settles the request's own activity row on the spot. Nothing else
 * reports it: an allowed tool runs under its own tool-use id, and a denied one
 * never runs at all, so waiting for a transport event leaves the row pending. */
function applyPermissionResolved(
	state: ChatState,
	id: string,
	decision: PermissionDecision,
): ChatState {
	const cleared =
		state.permission?.id === id ? { ...state, permission: null } : state
	const index = cleared.activities.findIndex((activity) => activity.id === id)
	if (index === -1) {
		return cleared
	}
	const target = cleared.activities[index]
	if (target.status !== "pending") {
		return cleared
	}
	return {
		...cleared,
		activities: cleared.activities.with(index, {
			...target,
			status: decision === "allowOnce" ? "succeeded" : "failed",
		}),
	}
}

function applyTurnEnded(state: ChatState, ended: TurnEnded): ChatState {
	if (state.turn === "idle" || state.turn === "failed") {
		return state
	}
	const next = setTurn(state, turnForOutcome(ended.outcome))
	return {
		...next,
		sessionId: ended.sessionId ?? state.sessionId,
		permission: null,
		messages: finalizeStreaming(
			next.messages,
			completionForOutcome(ended.outcome),
		),
	}
}

function applyEvent(state: ChatState, event: ClaudeEvent): ChatState {
	switch (event.type) {
		case "connectionChanged":
			return state.connection === event.state
				? state
				: { ...state, connection: event.state }
		case "turnChanged":
			return setTurn(state, event.state)
		case "sessionReady":
			return { ...state, sessionId: event.sessionId }
		case "messageStarted":
			return applyMessageStarted(state, event.message)
		case "messageDelta":
			return applyMessageDelta(state, event)
		case "messageCompleted":
			return applyMessageCompleted(state, event.message)
		case "activity":
			return applyActivity(state, event.activity)
		case "permissionRequested":
			return applyPermissionRequested(state, event.request)
		case "permissionResolved":
			return applyPermissionResolved(state, event.id, event.decision)
		case "turnEnded":
			return applyTurnEnded(state, event.ended)
		case "failed":
			return pushError(state, event.error)
	}
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "driverEvent":
			return action.epoch === state.epoch
				? applyEvent(state, action.event)
				: state
		case "sessionOpened":
			return state.sessionOpen ? state : { ...state, sessionOpen: true }
		case "sessionReset":
			return {
				...state,
				epoch: action.epoch,
				turn: "idle",
				sessionOpen: false,
				sessionId: null,
				permission: null,
				deltaSeqs: {},
				messages: finalizeStreaming(state.messages, "failed"),
			}
		case "conversationCleared":
			return {
				...initialChatState,
				epoch: state.epoch,
				connection: state.connection,
				sessionOpen: state.sessionOpen,
				sessionId: state.sessionId,
				binaryVersion: state.binaryVersion,
				errorCount: state.errorCount,
			}
		case "promptSubmitted":
			return setTurn(
				{ ...state, messages: [...state.messages, action.message] },
				"submitting",
			)
		case "promptRejected": {
			const next = pushError(state, action.error)
			const index = next.messages.findIndex(
				(message) => message.id === action.id,
			)
			const messages =
				index === -1
					? next.messages
					: next.messages.with(index, {
							...next.messages[index],
							completion: "failed",
						})
			return {
				...next,
				messages,
				turn: next.turn === "submitting" ? "failed" : next.turn,
			}
		}
		case "promptRetried": {
			const index = state.messages.findIndex(
				(message) => message.id === action.id,
			)
			if (index === -1) {
				return state
			}
			return setTurn(
				{
					...state,
					messages: state.messages.with(index, {
						...state.messages[index],
						completion: "complete",
					}),
				},
				"submitting",
			)
		}
		case "stopRejected": {
			const next = pushError(state, action.error)
			return next.turn === "stopping" ? { ...next, turn: "failed" } : next
		}
		case "binaryVersion":
			return { ...state, binaryVersion: action.version }
	}
}
