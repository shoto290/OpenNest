import { createFakeTranscriptPort } from "./fake-transcript-port"
import type {
	Bot,
	Chat,
	ContextCheckpoint,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
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

/** The bound the host holds, mirrored here: how many messages a rebuilt context
 * carries word for word, and where a checkpoint stops folding. */
const RECENT_TAIL = 20

const SUMMARY_LABEL = "The conversation so far:"
const REPLY_LABEL = "The message this one replies to:"
const RECENT_LABEL = "The most recent messages:"
const PROMPT_LABEL = "The new message:"

const spoken = (message: TranscriptMessage) =>
	`${message.role}: ${message.content}`

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
	/** One lineage per participant, the way `runtime_sessions` numbers them: the
	 * pair is the key, and the count is what the next run takes as its seq. */
	const runs = new Map<string, number>()
	/** One recovery point per participant, replaced only by one that reaches
	 * further: a capture that never lands leaves the previous one answering. */
	const checkpoints = new Map<
		string,
		{ summary: string; lastMessageSeq: number }
	>()

	/** Which message a row explicitly answers. Kept beside the rows because it is a
	 * column the file holds and the reader is never shown — the transcript the
	 * screen displays has no link on it, and a rebuilt context does. */
	const answered = new Map<string, string>()

	const participantKey = (conversationId: string, botId: string) =>
		`${conversationId}/${botId}`

	const ordered = (conversationId: string) =>
		[...rows.values()]
			.filter((row) => row.conversationId === conversationId)
			.sort((left, right) => left.seq - right.seq)

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

	const remember = (id: string, target: string | null) => {
		if (target) {
			answered.set(id, target)
		}
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

		/** The row the frontend scopes a process with, numbered per participant the
		 * way the file numbers it. The id is derived from the pair and the number
		 * rather than minted at random: a run named the same twice would be a
		 * handover no reader could see. */
		openRuntimeSession: (
			conversationId: string,
			botId: string,
			startedAt: number,
			_reason: string | null,
		) => {
			const participant = participantKey(conversationId, botId)
			const seq = (runs.get(participant) ?? 0) + 1
			runs.set(participant, seq)
			return Promise.resolve<RuntimeSession>({
				id: `run-${participant}-${seq}`,
				conversationId,
				botId,
				seq,
				startedAt,
			})
		},

		/** The host's composition, mirrored: the summary, the target of an explicit
		 * reply the tail no longer holds, the tail itself, and the prompt last — read
		 * from the row rather than taken from a caller, which is what makes carrying it
		 * twice impossible. A conversation with nothing behind it is the prompt alone. */
		boundedContext: (
			conversationId: string,
			botId: string,
			promptMessageId: string,
		) => {
			const prompt = rows.get(promptMessageId)
			if (!prompt) {
				return refuse({
					kind: "storage",
					failure: { kind: "sqlite", detail: "no such message" },
				})
			}
			const checkpoint = checkpoints.get(participantKey(conversationId, botId))
			const baseline = checkpoint?.lastMessageSeq ?? 0
			const recent = ordered(conversationId)
				.filter((row) => row.seq > baseline && row.seq < prompt.seq)
				.slice(-RECENT_TAIL)
			const answeredId = answered.get(prompt.id)
			const target = answeredId ? rows.get(answeredId) : undefined
			const sections: string[] = []
			if (checkpoint) {
				sections.push(`${SUMMARY_LABEL}\n${checkpoint.summary}`)
			}
			if (target && !recent.includes(target)) {
				sections.push(`${REPLY_LABEL}\n${spoken(target)}`)
			}
			if (recent.length > 0) {
				sections.push(`${RECENT_LABEL}\n${recent.map(spoken).join("\n")}`)
			}
			if (sections.length === 0) {
				return Promise.resolve(prompt.content)
			}
			sections.push(`${PROMPT_LABEL}\n${prompt.content}`)
			return Promise.resolve(sections.join("\n\n"))
		},

		/** Folds everything but the tail, carrying the previous summary forward. A
		 * capture with nothing new to fold answers `null` and leaves the recovery
		 * point where it was. */
		captureCheckpoint: (
			conversationId: string,
			botId: string,
			runtimeSessionId: string | null,
			createdAt: number,
		) => {
			const participant = participantKey(conversationId, botId)
			const previous = checkpoints.get(participant)
			const baseline = previous?.lastMessageSeq ?? 0
			const spokenSoFar = ordered(conversationId)
			const cutoff = (spokenSoFar.at(-1)?.seq ?? 0) - RECENT_TAIL
			if (cutoff <= baseline) {
				return Promise.resolve(null)
			}
			const folded = spokenSoFar
				.filter((row) => row.seq > baseline && row.seq <= cutoff)
				.map(spoken)
			const summary = [previous?.summary, ...folded].filter(Boolean).join("\n")
			checkpoints.set(participant, { summary, lastMessageSeq: cutoff })
			return Promise.resolve<ContextCheckpoint>({
				id: `checkpoint-${participant}-${cutoff}`,
				conversationId,
				botId,
				runtimeSessionId,
				lastMessageSeq: cutoff,
				tokenCount: summary.length,
				createdAt,
			})
		},

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

		appendUserMessage: (message: NewUserMessage) => {
			remember(message.id, message.repliedToMessageId)
			return append({ ...message, role: "user", completion: "complete" })
		},

		openAssistantMessage: (message: NewAssistantMessage) => {
			remember(message.id, message.repliedToMessageId)
			return append({
				...message,
				role: "assistant",
				content: "",
				completion: "pending",
			})
		},

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
