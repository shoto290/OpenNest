import { createFakeTranscriptPort } from "./fake-transcript-port"
import type {
	Bot,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
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

import type { AgentCommand } from "@/lib/agent/contract"

export type FakeTranscriptStoreOptions = {
	messages?: TranscriptMessage[]
	pageSize?: number
}

const DEFAULT_BOT: Bot = {
	id: "default",
	name: "Claude",
	title: "",
	model: "sonnet",
	avatarAnimal: "cat",
	avatarBlot: null,
	avatarImagePath: null,
	workingDir: null,
	instructions: "",
	changesNothing: false,
	createdAt: 0,
}

/** A bot holds one chat and the chat is named after it, the way `ensure_chat`
 * answers the same thread for the same bot every time it is asked. Derived rather
 * than minted so a caller can name the chat of a bot it created. */
const chatIdOf = (botId: string) => `chat-${botId}`

/** The chat of the bot a launch finds already on the record here. */
export const FAKE_CHAT_ID = chatIdOf(DEFAULT_BOT.id)

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

/** Where this fake pretends the host keeps avatars. Nothing reads it — it only has
 * to be the same shape every time, so a caller cannot come to depend on the name. */
const FAKE_AVATAR_DIR = "/fake/avatars"

/** The host's own limit, spelled here so a test can cross it without holding a
 * number the host would have to be asked for. */
const FAKE_AVATAR_LIMIT = 5 * 1024 * 1024

const IMAGE_SIGNATURES = [
	[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	[0xff, 0xd8, 0xff],
] as const

/** Png and jpeg by their leading bytes, and webp by the two windows RIFF splits it
 * across — the same three the host decodes, decided the same way. */
const isStorableImage = (bytes: Uint8Array) =>
	IMAGE_SIGNATURES.some((signature) =>
		signature.every((byte, index) => bytes[index] === byte),
	) || isWebp(bytes)

const isWebp = (bytes: Uint8Array) => {
	const text = (from: number, to: number) =>
		String.fromCharCode(...bytes.slice(from, to))
	return (
		bytes.byteLength >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP"
	)
}

/** The durable transcript without a database: the same rules, in memory, so a test
 * meets what the host would have answered rather than a store that says yes to
 * everything. Replays are idempotent on identity, an ending is final, and text
 * only ever appends to a message still open — the three rules the frontend leans
 * on, held here the way `messages.rs` holds them. */
export const createFakeTranscriptStore = (
	options: FakeTranscriptStoreOptions = {},
): TranscriptStore => {
	const pageSize = options.pageSize ?? TRANSCRIPT_PAGE_SIZE
	/** The bot the app ships with is already on the record, the way a launch finds
	 * it seeded. Insertion order is what `bots` answers in. */
	const bots = new Map<string, Bot>([[DEFAULT_BOT.id, DEFAULT_BOT]])
	let minted = 0
	/** What each bot's last session announced, the way the column holds it: written
	 * whole, read back whole, and absent for a bot no session has spoken for. */
	const commands = new Map<string, AgentCommand[]>()
	/** What each bot's bundle holds, the way the disk holds it: no row, one entry per
	 * bot, and a skill named by the directory it would live in. */
	const skills = new Map<string, BotSkill[]>()
	/** What each bot's server file declares, the way the disk holds it: one entry per
	 * bot, and a server named by the key it is declared under. */
	const servers = new Map<string, Map<string, Record<string, unknown>>>()
	const rows = new Map<string, TranscriptMessage>()
	const turns = new Map<string, NewTurn & { seq: number }>()
	const seqs = new Map<string, number>()
	/** One lineage per participant, the way `runtime_sessions` numbers them: the
	 * pair is the key, and the count is what the next run takes as its seq. */
	const runs = new Map<string, number>()
	/** Every run a lineage holds, live or already replaced, and the provider session
	 * it answered under. The column starts empty and is written once while the run is
	 * live, which is what keeps a late callback off a row that has moved on. */
	const runRows = new Map<
		string,
		{ participant: string; live: boolean; providerSessionId: string | null }
	>()
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

	/** What a name reduces to as a directory, the way the host reduces it: a run of
	 * anything a directory name would not carry is one separator. */
	const slugged = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "bot"

	/** Where a new skill goes: the directory its name reduces to, unless one of the
	 * bot's own is already there. */
	const freeSkillId = (held: BotSkill[], name: string) => {
		const base = slugged(name)
		const taken = (id: string) => held.some((skill) => skill.id === id)
		if (!taken(base)) {
			return base
		}
		let next = 2
		while (taken(`${base}-${next}`)) {
			next += 1
		}
		return `${base}-${next}`
	}

	/** What the host will take as a server configuration: a JSON object, which an
	 * array and a scalar are not. */
	const isPlainObject = (value: unknown) =>
		typeof value === "object" && value !== null && !Array.isArray(value)

	/** One of a bot's skills, changed. A bot that is not there and a skill that is
	 * not one of its own are the two refusals the host answers with — the second is
	 * a file that is not on the disk to be written. */
	const writeSkill = (
		botId: string,
		skillId: string,
		change: (skill: BotSkill) => BotSkill,
	): Promise<BotSkill> => {
		if (!bots.has(botId)) {
			return refuse({ kind: "unknownBot", id: botId })
		}
		const held = skills.get(botId) ?? []
		const stored = held.find((skill) => skill.id === skillId)
		if (!stored) {
			return refuse({ kind: "unwritableBundle", detail: "no such skill" })
		}
		const written = change(stored)
		skills.set(
			botId,
			held.map((skill) => (skill.id === skillId ? written : skill)),
		)
		return Promise.resolve(written)
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

		bots: () => Promise.resolve([...bots.values()]),

		/** Insertion order is creation order here, which is what the file answers with
		 * too. The chat is not written alongside because it does not have to be: a
		 * bot's thread is named after it, so the one it was created with is the one
		 * `mainChat` answers. */
		createBot: (identity: BotIdentity) => {
			minted += 1
			const created: Bot = {
				...identity,
				id: `bot-${minted}`,
				createdAt: minted,
			}
			bots.set(created.id, created)
			return Promise.resolve(created)
		},

		/** Who the bot is, replaced whole. Its id and the moment it was written are
		 * not a caller's to change, so they are carried over rather than taken. */
		updateBot: (id: string, identity: BotIdentity) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			const updated: Bot = { ...stored, ...identity }
			bots.set(id, updated)
			return Promise.resolve(updated)
		},

		/** A bot that is already gone is refused rather than silently accepted: a
		 * caller told its delete landed would go on showing a list that is behind the
		 * store. Everything said in its chat goes with it, the way the file cascades
		 * the thread and the transcript under the bot that held them — and so does what
		 * its sessions announced, which the file drops with the row it is a column of. */
		deleteBot: (id: string) => {
			if (!bots.delete(id)) {
				return refuse({ kind: "unknownBot", id })
			}
			commands.delete(id)
			skills.delete(id)
			servers.delete(id)
			const conversationId = chatIdOf(id)
			for (const [rowId, row] of rows) {
				if (row.conversationId === conversationId) {
					rows.delete(rowId)
				}
			}
			seqs.delete(conversationId)
			return Promise.resolve()
		},

		/** The two refusals a caller has to handle either way: a bot that is gone, and
		 * bytes that are not one of the three formats the host stores. The signature is
		 * read here too — the host reads it and nothing else, so a fake that trusted a
		 * name would let a test pass on a path production refuses. Everything past the
		 * signature is the host's own work and is not imitated: the path answered is a
		 * marker, not a file. */
		setBotAvatarImage: (id: string, bytes: Uint8Array) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			if (bytes.byteLength > FAKE_AVATAR_LIMIT) {
				return refuse({
					kind: "rejectedAvatarImage",
					reason: {
						kind: "tooLarge",
						bytes: bytes.byteLength,
						limit: FAKE_AVATAR_LIMIT,
					},
				})
			}
			if (!isStorableImage(bytes)) {
				return refuse({
					kind: "rejectedAvatarImage",
					reason: { kind: "unknownFormat" },
				})
			}
			minted += 1
			const worn: Bot = {
				...stored,
				avatarImagePath: `${FAKE_AVATAR_DIR}/avatar-${minted}.png`,
			}
			bots.set(id, worn)
			return Promise.resolve(worn)
		},

		/** Replaced whole, and refused for a bot that is not on the record — the two
		 * rules the column is written under. */
		/** By directory name, the way the host reads them off the disk, and none at
		 * all for a bot nobody has written one for. */
		botSkills: (botId: string) =>
			Promise.resolve(
				[...(skills.get(botId) ?? [])].sort((left, right) =>
					left.id.localeCompare(right.id),
				),
			),

		createBotSkill: (botId: string, draft: BotSkillDraft) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			const held = skills.get(botId) ?? []
			const created: BotSkill = {
				...draft,
				id: freeSkillId(held, draft.name),
				isPreloaded: false,
			}
			skills.set(botId, [...held, created])
			return Promise.resolve(created)
		},

		updateBotSkill: (botId: string, skillId: string, draft: BotSkillDraft) =>
			writeSkill(botId, skillId, (skill) => ({ ...skill, ...draft })),

		setBotSkillPreloaded: (
			botId: string,
			skillId: string,
			isPreloaded: boolean,
		) => writeSkill(botId, skillId, (skill) => ({ ...skill, isPreloaded })),

		deleteBotSkill: (botId: string, skillId: string) =>
			writeSkill(botId, skillId, (skill) => skill).then(() => {
				skills.set(
					botId,
					(skills.get(botId) ?? []).filter((skill) => skill.id !== skillId),
				)
			}),

		/** By the name each is declared under, the way the host reads them out of the
		 * map, and none at all for a bot nobody has written one for. */
		botMcpServers: (botId: string): Promise<BotMcpServer[]> =>
			Promise.resolve(
				[...(servers.get(botId)?.entries() ?? [])]
					.map(([name, config]) => ({ name, config }))
					.sort((left, right) => left.name.localeCompare(right.name)),
			),

		/** The two refusals the host answers with: a bot that is not there, and a
		 * configuration that is not an object — the second is a file that would fail at
		 * launch, and the refusal never carries what was offered. */
		setBotMcpServer: (
			botId: string,
			name: string,
			config: Record<string, unknown>,
		) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!isPlainObject(config)) {
				return refuse({
					kind: "unwritableBundle",
					detail: "a server configuration must be a JSON object",
				})
			}
			const declared = servers.get(botId) ?? new Map()
			declared.set(name, config)
			servers.set(botId, declared)
			return Promise.resolve({ name, config })
		},

		deleteBotMcpServer: (botId: string, name: string) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!servers.get(botId)?.delete(name)) {
				return refuse({ kind: "unwritableBundle", detail: "no such server" })
			}
			return Promise.resolve()
		},

		recordBotCommands: (botId: string, listed: AgentCommand[]) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			commands.set(botId, [...listed])
			return Promise.resolve()
		},

		/** No command is what a bot no session has announced anything for offers, and
		 * a bot that is gone offers the same: neither has a list to answer with. */
		botCommands: (botId: string) =>
			Promise.resolve([...(commands.get(botId) ?? [])]),

		mainChat: (botId: string) =>
			Promise.resolve<Chat>({
				id: chatIdOf(botId),
				createdAt: 0,
				updatedAt: 0,
			}),

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
			const id = `run-${participant}-${seq}`
			for (const row of runRows.values()) {
				if (row.participant === participant) {
					row.live = false
				}
			}
			runRows.set(id, { participant, live: true, providerSessionId: null })
			return Promise.resolve<RuntimeSession>({
				id,
				conversationId,
				botId,
				seq,
				startedAt,
			})
		},

		/** Write-once while the run is live, the way the column is: the same id again
		 * is the callback arriving twice and changes nothing, and a second id — or any
		 * id once the run has been replaced — is refused as the stale write it is. A
		 * run the participant does not hold is not theirs to name at all. */
		recordProviderSession: (
			conversationId: string,
			botId: string,
			runtimeSessionId: string,
			providerSessionId: string,
		) => {
			const row = runRows.get(runtimeSessionId)
			if (!row || row.participant !== participantKey(conversationId, botId)) {
				return refuse({
					kind: "storage",
					failure: { kind: "sqlite", detail: "no such runtime session" },
				})
			}
			if (row.live && row.providerSessionId === null) {
				row.providerSessionId = providerSessionId
				return Promise.resolve()
			}
			// What the write skipped, read back the way the statement's caller reads it:
			// the same id on a live run is the callback repeating itself, anything else
			// is a write the row has already moved past.
			return row.live && row.providerSessionId === providerSessionId
				? Promise.resolve()
				: refuse({ kind: "storage", failure: { kind: "staleWrite" } })
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
