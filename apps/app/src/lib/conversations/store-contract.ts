/** The model labels the host accepts, which are Claude Code's own aliases. A bot
 * is moved between them from its own settings; nothing outside this union reaches
 * the column. */
export type BotModel = "opus" | "sonnet" | "haiku"

/** The eight animals the avatar engine draws. The host holds the same eight and
 * refuses anything else at the boundary, so a value outside this union never
 * reaches the file. */
export type AvatarAnimal =
	| "cat"
	| "rabbit"
	| "bear"
	| "chick"
	| "dog"
	| "mouse"
	| "owl"
	| "koala"

/** The eight poses a bot is identified by. The engine animates many more — what a
 * bot is doing right now belongs to the runtime and is not stored. */
export type AvatarPose =
	| "idle"
	| "happy"
	| "curious"
	| "proud"
	| "shy"
	| "playful"
	| "bored"
	| "sleeping"

export type Bot = {
	id: string
	name: string
	title: string
	description: string
	model: BotModel
	avatarAnimal: AvatarAnimal
	avatarPose: AvatarPose
	avatarImagePath: string | null
	workingDir: string | null
	createdAt: number
}

/** Who a bot is, as the store is told it — whole, both to create one and to
 * change one. No `id` or `createdAt`: neither is a caller's to choose.
 * `avatarImagePath` and `workingDir` are `null` rather than empty, since both name
 * something outside the database. */
export type BotIdentity = {
	name: string
	title: string
	description: string
	model: BotModel
	avatarAnimal: AvatarAnimal
	avatarPose: AvatarPose
	avatarImagePath: string | null
	workingDir: string | null
}

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
	| { kind: "unknownBot"; id: string }
