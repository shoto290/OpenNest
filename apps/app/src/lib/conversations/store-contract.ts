export type Bot = { id: string; name: string; model: string; createdAt: number }

export type Chat = { id: string; createdAt: number; updatedAt: number }

/** A run just opened in a participant's lineage. `seq` is the number the lineage
 * counts handovers with, and what a runtime scope carries as its epoch. */
export type RuntimeSession = {
	id: string
	conversationId: string
	botId: string
	seq: number
	startedAt: number
}

/** The recovery point a later context is rebuilt from. Its summary stays in the
 * file: nothing on this side displays or submits it — the context that carries it
 * is composed by the host. */
export type ContextCheckpoint = {
	id: string
	conversationId: string
	botId: string
	runtimeSessionId: string | null
	lastMessageSeq: number
	tokenCount: number
	createdAt: number
}

export type NewTurn = { id: string; conversationId: string; startedAt: number }

export type NewUserMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	content: string
	createdAt: number
}

/** The answer opens empty: its text arrives delta by delta, so it carries no
 * content until the store closes it. */
export type NewAssistantMessage = {
	id: string
	conversationId: string
	turnId: string
	authorBotId: string | null
	repliedToMessageId: string | null
	createdAt: number
}

export type StorageFailure =
	| { kind: "appDataDir" }
	| { kind: "journalMode"; mode: string }
	| { kind: "poisonedConnection" }
	| { kind: "callInterrupted" }
	| { kind: "staleWrite" }
	| { kind: "sqlite"; detail: string }

export type TranscriptStoreError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "conflict"; id: string; field: string }
	| { kind: "invalidTransition"; id: string; from: string; to: string }
	| {
			kind: "identityConflict"
			id: string
			field: string
			expected: string
			stored: string
	  }
