import type {
	ActivityEvent,
	ActivityStatus,
	AgentCommand,
	AgentEvent,
	ConnectionState,
	MessageCompletion,
	PermissionDecision,
	PermissionRequest,
	RuntimeScope,
	TransportError,
	TurnEnded,
	TurnOutcome,
	TurnState,
} from "../agent/contract"
import type { TranscriptMessage } from "../conversations/transcript-contract"

export type ChatError = {
	id: string
	error: TransportError
}

/** A prompt the reader sent before the session could take it. The text is the one
 * that will be submitted, paths and all — the composer names its stored files in
 * it before it is sent, and nothing here rewrites what was typed. The id is the
 * entry's own: the transcript row is only written when it is submitted, so until
 * then this is the only name it has. */
export type OutboxEntry = {
	id: string
	text: string
	repliedToMessageId: string | null
}

/** What the screen needs that a restart may not survive, plus a mirror of the
 * durable transcript. Everything here but `messages`, `hasOlder` and
 * `conversationId` belongs to the running process: a connection, a turn, a
 * permission and the provider's own session id are facts about this launch, and
 * none of them is written down. What was said is the transcript's business, and
 * the transcript is SQLite's. */
export type ChatState = {
	/** The run this state is about, opened against the durable lineage before the
	 * process was asked for. Null before the first one: a launch that has not
	 * opened a run yet is one nothing may be attributed to. */
	runtime: RuntimeScope | null
	connection: ConnectionState
	turn: TurnState
	/** The host holds a live child process. Set when the session opens, not when
	 * Claude first reports its id — `sessionReady` only lands after a prompt. */
	sessionOpen: boolean
	sessionId: string | null
	/** The slash commands last announced for this bot, as the session named them:
	 * without a leading slash. A session only announces them once it is up, and it
	 * is only started by a prompt — so what a session named outlives it, both
	 * across a reset and across a launch, and the next announcement replaces it
	 * whole. Empty is a bot no session has ever announced anything for. */
	commands: AgentCommand[]
	binaryVersion: string | null
	/** The one visible chat, resolved from the store before anything is written. */
	conversationId: string | null
	messages: TranscriptMessage[]
	/** History still sits above what is loaded. */
	hasOlder: boolean
	loadingOlder: boolean
	/** The prompt Claude refused to take. It is on the record either way — the
	 * store took it before the submission was attempted — so the failure lives
	 * here rather than on the durable row, which no submission can change. */
	rejectedPromptId: string | null
	/** The prompts sent while nothing could take them, in the order they were sent.
	 * Kept across a reset: the session going away is why they are waiting. A stop
	 * empties it onto the record — nothing here is held back, only waiting. */
	outbox: OutboxEntry[]
	activities: ActivityEvent[]
	permission: PermissionRequest | null
	errors: ChatError[]
	errorCount: number
}

export type ChatAction =
	/** An event and the run the host says it came from. Anything but the run this
	 * state is about is dropped: a replaced session is still alive for as long as
	 * its child takes to die, and every frame it emits meanwhile describes a
	 * process the reader has already been handed a replacement for. */
	| { type: "driverEvent"; scope: RuntimeScope | null; event: AgentEvent }
	/** A session died or was replaced. Clears what belonged to that process — its
	 * steps included, because a step is a thing a running provider was doing and
	 * nothing is running any more — and keeps the transcript, which was never that
	 * process's to begin with. `sessionId` is the id the new session resumes: the
	 * child only re-announces it on the first prompt, so dropping it here would
	 * write `null` over a session that is very much alive. The commands are kept for
	 * the same reason: the next child re-announces its own, and until
	 * then the last list named is the only one there is. */
	| { type: "sessionReset"; runtime: RuntimeScope; sessionId: string | null }
	| { type: "sessionOpened" }
	/** The commands the store was holding for this bot, read when it was opened.
	 * They stand until a session of its own announces its own, which is what the
	 * composer offers before any process has been started. */
	| { type: "commandsRecalled"; commands: AgentCommand[] }
	| { type: "conversationOpened"; conversationId: string }
	/** The durable transcript moved. The controller hands the whole selection
	 * rather than a patch: the transcript reducer owns order and identity. */
	| {
			type: "transcriptChanged"
			messages: TranscriptMessage[]
			hasOlder: boolean
	  }
	| { type: "olderLoading"; loading: boolean }
	| { type: "promptSubmitted" }
	/** A prompt nothing could take yet, put at the back of the bot's outbox. */
	| { type: "promptHeld"; entry: OutboxEntry }
	/** An entry taken for submission that was never written down. It goes back where
	 * it was taken from: nothing on the record says the reader ever asked it. */
	| { type: "promptReturned"; entry: OutboxEntry }
	/** An entry leaving the outbox, whether it is being submitted or dropped. */
	| { type: "outboxEntryRemoved"; id: string }
	/** Everything the outbox held, taken out at once — a stop puts it on the record
	 * instead, and there is nothing left waiting to be sent. */
	| { type: "outboxCleared" }
	| { type: "promptRejected"; id: string | null; error: TransportError }
	| { type: "promptRetried"; id: string }
	| { type: "stopRejected"; error: TransportError }
	| { type: "binaryVersion"; version: string | null }

export const initialChatState: ChatState = {
	runtime: null,
	connection: "checking",
	turn: "idle",
	sessionOpen: false,
	sessionId: null,
	commands: [],
	binaryVersion: null,
	conversationId: null,
	messages: [],
	hasOlder: false,
	loadingOlder: false,
	rejectedPromptId: null,
	outbox: [],
	activities: [],
	permission: null,
	errors: [],
	errorCount: 0,
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

/** Whether two scopes name the same run. Compared field by field rather than on
 * the id alone: the id says which row, and the participant says whose, so a run
 * of another bot or another conversation is refused on what it says instead of on
 * a lookup nobody here can make. Two runs that have none — a launch before its
 * first one — are the same absence and match. */
export function isSameRuntimeScope(
	left: RuntimeScope | null,
	right: RuntimeScope | null,
): boolean {
	if (left === null || right === null) {
		return left === right
	}
	return (
		left.runtimeSessionId === right.runtimeSessionId &&
		left.epoch === right.epoch &&
		left.conversationId === right.conversationId &&
		left.botId === right.botId
	)
}

/** Whether two lists name the same commands in the same order. The order is the
 * child's own and the menu offers it as given, so a list rearranged is a different
 * list. Read by the reducer to publish nothing when what arrives is what is already
 * held, and by the controller to write nothing when it is what the store holds. */
export function isSameCommandList(
	left: AgentCommand[],
	right: AgentCommand[],
): boolean {
	return (
		left.length === right.length &&
		left.every(
			(command, index) =>
				command.name === right[index].name &&
				command.description === right[index].description,
		)
	)
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

/** The messages a turn produced are settled where they live, in the store. Only
 * what the running process owned is cleared here. */
function applyTurnEnded(state: ChatState, ended: TurnEnded): ChatState {
	if (state.turn === "idle" || state.turn === "failed") {
		return state
	}
	const next = setTurn(state, turnForOutcome(ended.outcome))
	return {
		...next,
		sessionId: ended.sessionId ?? state.sessionId,
		permission: null,
	}
}

/** Only a refusal that cost the host its stored id costs this one too: holding an
 * id the host gave up on would write it straight back and make every launch retry
 * a session that is gone, and dropping one the host kept — a resume that only ran
 * out of time proves nothing — writes `null` over a live conversation instead. */
function applyFailure(state: ChatState, error: TransportError): ChatState {
	const next = pushError(state, error)
	return error.kind === "resumeFailed" && error.forgotSessionId
		? { ...next, sessionId: null }
		: next
}

function applyEvent(state: ChatState, event: AgentEvent): ChatState {
	switch (event.type) {
		case "connectionChanged":
			return state.connection === event.state
				? state
				: { ...state, connection: event.state }
		case "turnChanged":
			return setTurn(state, event.state)
		case "sessionReady":
			return { ...state, sessionId: event.sessionId }
		case "commandsListed":
			return applyCommands(state, event.commands)
		// What a message says and how it ended reach the screen through the
		// transcript, never through here: the reader is shown what was stored.
		case "messageStarted":
		case "messageDelta":
		case "messageCompleted":
			return state
		case "activity":
			return applyActivity(state, event.activity)
		case "permissionRequested":
			return applyPermissionRequested(state, event.request)
		case "permissionResolved":
			return applyPermissionResolved(state, event.id, event.decision)
		case "turnEnded":
			return applyTurnEnded(state, event.ended)
		// A bot that has just rewritten itself changes nothing on the screen the
		// reader is looking at: the write is in the bundle's history, and what the
		// next session is started on is settled elsewhere.
		case "botEvolved":
			return state
		case "failed":
			return applyFailure(state, event.error)
	}
}

/** The same list again — a session re-announcing what was recalled, or a recall
 * answering what a session already named — is not a change: the state is handed
 * back as it stands, so nothing re-renders for a menu that reads the same. */
function applyCommands(state: ChatState, commands: AgentCommand[]): ChatState {
	return isSameCommandList(state.commands, commands)
		? state
		: { ...state, commands }
}

function applySessionReset(
	state: ChatState,
	runtime: RuntimeScope,
	sessionId: string | null,
): ChatState {
	return {
		...state,
		runtime,
		turn: "idle",
		sessionOpen: false,
		sessionId,
		permission: null,
		// Nothing here outlives the process that reported it, and a cold launch
		// starts with none: a step left pending would go on claiming work that no
		// longer has anything doing it.
		activities: [],
	}
}

function applyTranscriptChanged(
	state: ChatState,
	messages: TranscriptMessage[],
	hasOlder: boolean,
): ChatState {
	if (state.messages === messages && state.hasOlder === hasOlder) {
		return state
	}
	return { ...state, messages, hasOlder }
}

function applyPromptRejected(
	state: ChatState,
	id: string | null,
	error: TransportError,
): ChatState {
	const next = pushError(state, error)
	return {
		...next,
		rejectedPromptId: id,
		turn: next.turn === "submitting" ? "failed" : next.turn,
	}
}

function applyPromptRetried(state: ChatState, id: string): ChatState {
	if (state.rejectedPromptId !== id) {
		return state
	}
	return setTurn({ ...state, rejectedPromptId: null }, "submitting")
}

/** An entry leaves and the rest keep their order. */
function applyOutboxEntryRemoved(state: ChatState, id: string): ChatState {
	const outbox = state.outbox.filter((entry) => entry.id !== id)
	return outbox.length === state.outbox.length ? state : { ...state, outbox }
}

function applyStopRejected(state: ChatState, error: TransportError): ChatState {
	const next = pushError(state, error)
	return next.turn === "stopping" ? { ...next, turn: "failed" } : next
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "driverEvent":
			return isSameRuntimeScope(action.scope, state.runtime)
				? applyEvent(state, action.event)
				: state
		case "sessionOpened":
			return state.sessionOpen ? state : { ...state, sessionOpen: true }
		case "commandsRecalled":
			return applyCommands(state, action.commands)
		case "sessionReset":
			return applySessionReset(state, action.runtime, action.sessionId)
		case "conversationOpened":
			return state.conversationId === action.conversationId
				? state
				: { ...state, conversationId: action.conversationId }
		case "transcriptChanged":
			return applyTranscriptChanged(state, action.messages, action.hasOlder)
		case "olderLoading":
			return state.loadingOlder === action.loading
				? state
				: { ...state, loadingOlder: action.loading }
		case "promptSubmitted":
			return setTurn({ ...state, rejectedPromptId: null }, "submitting")
		case "promptHeld":
			return { ...state, outbox: [...state.outbox, action.entry] }
		case "promptReturned":
			return { ...state, outbox: [action.entry, ...state.outbox] }
		case "outboxEntryRemoved":
			return applyOutboxEntryRemoved(state, action.id)
		case "outboxCleared":
			return state.outbox.length === 0 ? state : { ...state, outbox: [] }
		case "promptRejected":
			return applyPromptRejected(state, action.id, action.error)
		case "promptRetried":
			return applyPromptRetried(state, action.id)
		case "stopRejected":
			return applyStopRejected(state, action.error)
		case "binaryVersion":
			return { ...state, binaryVersion: action.version }
	}
}
