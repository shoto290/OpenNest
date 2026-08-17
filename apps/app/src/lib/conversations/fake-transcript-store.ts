import { createFakeTranscriptPort } from "./fake-transcript-port"
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
	type TranscriptDraft,
	type TranscriptMessage,
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
	const turns = new Map<string, NewTurn & { seq: number }>()
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

	/** Every column a row is written with and never updated, so an append that
	 * describes any of them differently is describing another message. A reply's
	 * text is not among them on purpose: it is written after the row, delta by
	 * delta, and the append that created it carried none of it. */
	const divergingField = (
		stored: TranscriptMessage,
		message: TranscriptDraft,
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

	const append = (message: TranscriptDraft): Promise<number> => {
		const stored = rows.get(message.id)
		if (stored) {
			const field = divergingField(stored, message)
			return field
				? refuse({ kind: "conflict", id: message.id, field })
				: Promise.resolve(stored.seq)
		}
		const seq = nextSeq(message.conversationId)
		rows.set(message.id, { ...message, seq })
		return Promise.resolve(seq)
	}

	return {
		/** Read through the port the transcript tests already page with, so both
		 * fakes answer a cursor the same way and only one of them defines how. */
		loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
			createFakeTranscriptPort({
				messages: [...rows.values()],
				pageSize,
			}).loadPage(conversationId, cursor),

		defaultBot: () => Promise.resolve(DEFAULT_BOT),

		mainChat: (_botId: string) =>
			Promise.resolve<Chat>({ id: FAKE_CHAT_ID, createdAt: 0, updatedAt: 0 }),

		/** A replay answers with the place the turn already has, the way an append
		 * does: a caller cannot tell its own duplicate from a refusal otherwise. */
		startTurn: (turn: NewTurn) => {
			const stored = turns.get(turn.id)
			if (stored) {
				return stored.startedAt === turn.startedAt &&
					stored.conversationId === turn.conversationId
					? Promise.resolve(stored.seq)
					: refuse({ kind: "conflict", id: turn.id, field: "started_at" })
			}
			const seq = turns.size + 1
			turns.set(turn.id, { ...turn, seq })
			return Promise.resolve(seq)
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
