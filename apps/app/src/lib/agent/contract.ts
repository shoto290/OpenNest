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

export type QuestionRequest = {
	id: string
	questions: AskedQuestion[]
}

export type QuestionAnswers = Record<string, string>

export type PermissionDecision = "allowOnce" | "deny"

export type TurnOutcome = "completed" | "cancelled" | "failed"

export type TurnEnded = {
	sessionId: string | null
	outcome: TurnOutcome
}

export type RuntimeScope = {
	conversationId: string
	botId: string
	runtimeSessionId: string
	epoch: number
}

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
	| { kind: "workingDirectoryRefused"; path: string }
	| { kind: "invalidFrame"; detail: string }
	| { kind: "settingsRejected"; detail: string }
	| { kind: "serverEnvRejected"; detail: string }
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

export type AgentCommand = {
	name: string
	description?: string
}

export type EvolvedBundle = "bot" | "user" | "space"

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
	| {
			type: "botEvolved"
			bundle: EvolvedBundle
			commitId: string
			title: string
	  }
	| { type: "failed"; error: TransportError }
