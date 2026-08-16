import type {
	ChatMessage,
	MessageCompletion,
	MessageRole,
} from "../claude/contract"

export type StoredSession = {
	sessionId: string
	messages: ChatMessage[]
}

const STORAGE_KEY = "chat.session"
/** Bumped whenever the stored shape changes, so an older payload is discarded
 * instead of being trusted. */
const SCHEMA_VERSION = 1

const ROLES: MessageRole[] = ["user", "assistant"]
const COMPLETIONS: MessageCompletion[] = [
	"streaming",
	"complete",
	"cancelled",
	"failed",
]

/** Reading the property itself throws in a locked-down webview, so even the
 * lookup stays guarded. */
const store = (): Storage | null => {
	try {
		return globalThis.localStorage ?? null
	} catch {
		return null
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

const toMessage = (value: unknown): ChatMessage | null => {
	if (!isRecord(value)) {
		return null
	}
	const { id, role, text, completion, timestamp } = value
	if (typeof id !== "string" || typeof text !== "string") {
		return null
	}
	if (typeof timestamp !== "number") {
		return null
	}
	if (!ROLES.includes(role as MessageRole)) {
		return null
	}
	if (!COMPLETIONS.includes(completion as MessageCompletion)) {
		return null
	}
	return {
		id,
		role: role as MessageRole,
		text,
		completion: completion as MessageCompletion,
		timestamp,
	}
}

const toStoredSession = (value: unknown): StoredSession | null => {
	if (!isRecord(value) || value.version !== SCHEMA_VERSION) {
		return null
	}
	if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
		return null
	}
	if (!Array.isArray(value.messages)) {
		return null
	}
	const messages: ChatMessage[] = []
	for (const entry of value.messages) {
		const message = toMessage(entry)
		if (message === null) {
			return null
		}
		messages.push(message)
	}
	return { sessionId: value.sessionId, messages }
}

export const readStoredSession = (): StoredSession | null => {
	try {
		const raw = store()?.getItem(STORAGE_KEY)
		return raw ? toStoredSession(JSON.parse(raw)) : null
	} catch {
		return null
	}
}

export const writeStoredSession = (session: StoredSession): void => {
	try {
		store()?.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: SCHEMA_VERSION, ...session }),
		)
	} catch {
		return
	}
}

export const clearStoredSession = (): void => {
	try {
		store()?.removeItem(STORAGE_KEY)
	} catch {
		return
	}
}
