export type ConnectionState = "checking" | "ready" | "unavailable" | "crashed"

export type TurnState =
	| "idle"
	| "submitting"
	| "running"
	| "stopping"
	| "failed"

export type MessageRole = "user" | "assistant"

export type MessageCompletion =
	| "streaming"
	| "complete"
	| "cancelled"
	| "failed"

export type ChatMessage = {
	id: string
	role: MessageRole
	text: string
	completion: MessageCompletion
	timestamp: number
}

export type ActivityKind = "tool" | "permission"

export type ActivityStatus = "pending" | "running" | "succeeded" | "failed"

export type ActivityEvent = {
	id: string
	title: string
	kind: ActivityKind
	status: ActivityStatus
}

export type PermissionRequest = {
	id: string
	toolName: string
	title: string
	detail: string | null
}

/** One choice the child offered. `preview` is the longer content it wrote for the
 * option, `null` on one that carries none. */
export type QuestionOption = {
	label: string
	description: string | null
	preview: string | null
}

export type AskedQuestion = {
	header: string
	question: string
	options: QuestionOption[]
	multiSelect: boolean
}

/** The child asking the reader instead of asking for a permission. Answered under
 * the same id, and dropped with the pending permissions when the turn ends. */
export type QuestionRequest = {
	id: string
	questions: AskedQuestion[]
}

/** One answer per question, keyed by the question text. Several picked options
 * join with ", ", and words typed instead travel in the same string. */
export type QuestionAnswers = Record<string, string>

export type PermissionDecision = "allowOnce" | "deny"

export type TurnOutcome = "completed" | "cancelled" | "failed"

export type TurnEnded = {
	sessionId: string | null
	outcome: TurnOutcome
}

/** Which run a command is about, and which run an event came from. Every field
 * comes from the durable lineage the frontend opened before asking for a process:
 * the participant is the conversation and the bot, the id is the `runtime_sessions`
 * row, and the epoch is that row's `seq`. Nothing here is minted for the runtime
 * alone — a second identity for one run is a second thing that can disagree. */
export type RuntimeScope = {
	conversationId: string
	botId: string
	runtimeSessionId: string
	epoch: number
}

/** One event and the run it belongs to. `scope` is `null` only for what the host
 * says about the install itself, which is the check — it echoes the run the caller
 * named, and a launch that has not opened one yet names none. */
export type ScopedEvent = {
	scope: RuntimeScope | null
	event: AgentEvent
}

export type TransportError =
	| { kind: "binaryNotFound"; searched: string[] }
	| { kind: "notAuthenticated" }
	| { kind: "authCheckFailed"; detail: string }
	| { kind: "spawnFailed"; detail: string }
	| { kind: "startupTimeout"; timeoutMs: number }
	| { kind: "crashed"; code: number | null; detail: string | null }
	| { kind: "resumeFailed"; forgotSessionId: boolean }
	/** The bot names a folder the machine no longer has, so the run was started
	 * where one is started for a bot naming none. The process is up and answering —
	 * somewhere else. */
	| { kind: "workingDirectoryRefused"; path: string }
	| { kind: "invalidFrame"; detail: string }
	| { kind: "notStarted" }
	| { kind: "turnAlreadyRunning" }
	| { kind: "transitionInProgress" }
	| { kind: "noActiveTurn" }
	| { kind: "staleRuntimeSession"; runtimeSessionId: string }
	| { kind: "unknownPermission"; id: string }
	| { kind: "writeFailed"; detail: string }

export type CheckReport = {
	connection: ConnectionState
	binaryVersion: string | null
	authenticated: boolean
	error: TransportError | null
}

export type SessionHandle = {
	resumed: boolean
}

/** A slash command as the menu lists it. The description is what the child said
 * the command does, absent from one that says nothing. */
export type AgentCommand = {
	name: string
	description?: string
}

export type AgentEvent =
	| { type: "connectionChanged"; state: ConnectionState }
	| { type: "turnChanged"; state: TurnState }
	| { type: "sessionReady"; sessionId: string; resumed: boolean }
	| { type: "commandsListed"; commands: AgentCommand[] }
	| { type: "messageStarted"; message: ChatMessage }
	| { type: "messageDelta"; id: string; seq: number; text: string }
	| { type: "messageCompleted"; message: ChatMessage }
	| { type: "activity"; activity: ActivityEvent }
	| { type: "permissionRequested"; request: PermissionRequest }
	| { type: "questionRequested"; request: QuestionRequest }
	| { type: "permissionResolved"; id: string; decision: PermissionDecision }
	| { type: "turnEnded"; ended: TurnEnded }
	| { type: "botEvolved"; commitId: string; title: string }
	| { type: "failed"; error: TransportError }
