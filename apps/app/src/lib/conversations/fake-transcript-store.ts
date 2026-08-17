import type {
	Bot,
	Chat,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	TranscriptStoreError,
} from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	type TerminalCompletion,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptCompletion,
	type TranscriptCursor,
	type TranscriptMessage,
	type TranscriptPage,
} from "./transcript-contract"

export type FakeTranscriptStoreOptions = {
	messages?: TranscriptMessage[]
	pageSize?: number
}

const DEFAULT_BOT: Bot = {
	id: "default",
	name: "Claude",
	model: "sonnet",
	createdAt: 0,
}

/** The one visible chat, the way `ensure_chat` answers for it. */
export const FAKE_CHAT_ID = "chat-default"

const OPEN: TranscriptCompletion[] = ["pending", "streaming"]

const refuse = (error: TranscriptStoreError) => Promise.reject(error)

/** The durable transcript without a database: the same rules, in memory, so a test
 * meets what the host would have answered rather than a store that says yes to
 * everything. Replays are idempotent on identity, an ending is final, and text
 * only ever appends to a message still open — the three rules the frontend leans
 * on, held here the way `messages.rs` holds them. */
export const createFakeTranscriptStore = (
	options: FakeTranscriptStoreOptions = {},
): TranscriptStore => {
	const pageSize = options.pageSize ?? TRANSCRIPT_PAGE_SIZE
	const rows = new Map<string, TranscriptMessage>()
	const turns = new Map<string, NewTurn>()
	const seqs = new Map<string, number>()

	for (const seeded of [...(options.messages ?? [])].sort(
		(left, right) => left.seq - right.seq,
	)) {
		rows.set(seeded.id, seeded)
		seqs.set(seeded.conversationId, seeded.seq)
	}

	const nextSeq = (conversationId: string): number => {
		const seq = (seqs.get(conversationId) ?? 0) + 1
		seqs.set(conversationId, seq)
		return seq
	}

	const divergingField = (
		stored: TranscriptMessage,
		message: TranscriptMessage,
	): string | null => {
		if (stored.conversationId !== message.conversationId)
			return "conversation_id"
		if (stored.turnId !== message.turnId) return "turn_id"
		if (stored.role !== message.role) return "role"
		if (stored.createdAt !== message.createdAt) return "created_at"
		if (message.role === "user" && stored.content !== message.content)
			return "content"
		return null
	}

	const append = (
		message: Omit<TranscriptMessage, "seq">,
	): Promise<number> => {
		const stored = rows.get(message.id)
		if (stored) {
			const field = divergingField(stored, { ...message, seq: stored.seq })
			return field
				? refuse({ kind: "conflict", id: message.id, field })
				: Promise.resolve(stored.seq)
		}
		const seq = nextSeq(message.conversationId)
		rows.set(message.id, { ...message, seq })
		return Promise.resolve(seq)
	}

	return {
		loadPage: (conversationId: string, cursor: TranscriptCursor | null) => {
			const owned = [...rows.values()]
				.filter((message) => message.conversationId === conversationId)
				.sort((left, right) => left.seq - right.seq)
			const older = cursor
				? owned.filter((message) => message.seq < cursor.beforeSeq)
				: owned
			const messages = older.slice(-pageSize)
			return Promise.resolve<TranscriptPage>({
				conversationId,
				messages,
				hasMore: older.length > messages.length,
			})
		},

		defaultBot: () => Promise.resolve(DEFAULT_BOT),

		mainChat: (_botId: string) =>
			Promise.resolve<Chat>({ id: FAKE_CHAT_ID, createdAt: 0, updatedAt: 0 }),

		startTurn: (turn: NewTurn) => {
			const stored = turns.get(turn.id)
			if (stored) {
				return stored.startedAt === turn.startedAt &&
					stored.conversationId === turn.conversationId
					? Promise.resolve(1)
					: refuse({ kind: "conflict", id: turn.id, field: "started_at" })
			}
			turns.set(turn.id, turn)
			return Promise.resolve(turns.size)
		},

		completeTurn: () => Promise.resolve(),

		appendUserMessage: (message: NewUserMessage) =>
			append({ ...message, role: "user", completion: "complete" }),

		openAssistantMessage: (message: NewAssistantMessage) =>
			append({
				...message,
				role: "assistant",
				content: "",
				completion: "pending",
			}),

		/** Silently dropped once the message has ended, the way the statement that
		 * writes it matches nothing. */
		appendText: (id: string, delta: string) => {
			const stored = rows.get(id)
			if (stored && OPEN.includes(stored.completion)) {
				rows.set(id, {
					...stored,
					content: stored.content + delta,
					completion: "streaming",
				})
			}
			return Promise.resolve()
		},

		finalizeMessage: (id: string, completion: TerminalCompletion) => {
			const stored = rows.get(id)
			if (!stored || stored.completion === completion) {
				return Promise.resolve()
			}
			if (!OPEN.includes(stored.completion)) {
				return refuse({
					kind: "invalidTransition",
					id,
					from: stored.completion,
					to: completion,
				})
			}
			rows.set(id, { ...stored, completion })
			return Promise.resolve()
		},
	}
}
