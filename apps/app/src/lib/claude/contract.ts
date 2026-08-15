export type ConnectionState = "checking" | "ready" | "unavailable" | "crashed"

export type TurnState = "idle" | "submitting" | "running" | "stopping" | "failed"

export type MessageRole = "user" | "assistant"

export type MessageCompletion = "streaming" | "complete" | "cancelled" | "failed"

export type ChatMessage = {
	id: string
	role: MessageRole
	text: string
	completion: MessageCompletion
	timestamp: number
}

export type ActivityKind = "tool" | "thinking" | "permission"

export type ActivityStatus = "pending" | "running" | "succeeded" | "failed" | "denied"

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

export type PermissionDecision = "allowOnce" | "deny"

export type TurnOutcome = "completed" | "cancelled" | "failed"

export type TurnEnded = {
	sessionId: string | null
	outcome: TurnOutcome
}

export type TransportError =
	| { kind: "binaryNotFound"; searched: string[] }
	| { kind: "notAuthenticated" }
	| { kind: "authCheckFailed"; detail: string }
	| { kind: "spawnFailed"; detail: string }
	| { kind: "startupTimeout"; timeoutMs: number }
	| { kind: "crashed"; code: number | null; detail: string | null }
	| { kind: "invalidFrame"; detail: string }
	| { kind: "notStarted" }
	| { kind: "turnAlreadyRunning" }
	| { kind: "noActiveTurn" }
	| { kind: "unknownPermission"; id: string }
	| { kind: "writeFailed"; detail: string }

export type CheckReport = {
	connection: ConnectionState
	binaryVersion: string | null
	authenticated: boolean
	error: TransportError | null
}

export type SessionHandle = {
	sessionId: string | null
	resumed: boolean
}

export type ClaudeEvent =
	| { type: "connectionChanged"; state: ConnectionState }
	| { type: "turnChanged"; state: TurnState }
	| { type: "sessionReady"; sessionId: string; resumed: boolean }
	| { type: "messageStarted"; message: ChatMessage }
	| { type: "messageDelta"; id: string; text: string }
	| { type: "messageCompleted"; message: ChatMessage }
	| { type: "activity"; activity: ActivityEvent }
	| { type: "permissionRequested"; request: PermissionRequest }
	| { type: "permissionResolved"; id: string; decision: PermissionDecision }
	| { type: "turnEnded"; ended: TurnEnded }
	| { type: "failed"; error: TransportError }

export function describeTransportError(error: TransportError): string {
	switch (error.kind) {
		case "binaryNotFound":
			return `Claude Code introuvable. Emplacements testés : ${error.searched.join(", ")}`
		case "notAuthenticated":
			return "Claude Code n'est pas connecté. Lancez `claude auth login`."
		case "authCheckFailed":
			return `Vérification d'authentification impossible : ${error.detail}`
		case "spawnFailed":
			return `Démarrage de Claude Code impossible : ${error.detail}`
		case "startupTimeout":
			return `Claude Code n'a pas répondu en ${error.timeoutMs} ms.`
		case "crashed":
			return `Claude Code s'est arrêté (code ${error.code ?? "inconnu"}).`
		case "invalidFrame":
			return `Trame illisible ignorée : ${error.detail}`
		case "notStarted":
			return "Aucune session active."
		case "turnAlreadyRunning":
			return "Un tour est déjà en cours."
		case "noActiveTurn":
			return "Aucun tour à interrompre."
		case "unknownPermission":
			return `Demande de permission inconnue (${error.id}).`
		case "writeFailed":
			return `Envoi impossible : ${error.detail}`
	}
}
