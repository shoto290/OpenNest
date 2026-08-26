import { DEFAULT_BOT_OUTPUT_STYLE } from "@workspace/ui/components/bot-settings"

import { createFakeTranscriptPort } from "./fake-transcript-port"
import type {
	AvatarBlot,
	Bot,
	BotHistoryEntry,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
	BotSkillFront,
	Chat,
	ContextCheckpoint,
	MessagePin,
	MessageReference,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
	Section,
	SectionError,
	Space,
	SpaceError,
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
import { deniesChanges } from "../bots/bot-settings"
import { messageUri } from "../links/message-uri"

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
	deniedTools: [],
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
	changesNothing: false,
	memory: "",
	createdAt: 0,
	sectionId: null,
}

const DEFAULT_SPACE: Space = {
	id: "personal",
	name: "Personal",
	colour: "red",
	position: 0,
	createdAt: 0,
}

const SPACE_TINTS = [
	"red",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
	"orange",
] as const

const chatIdOf = (botId: string) => `chat-${botId}`

export const FAKE_CHAT_ID = chatIdOf(DEFAULT_BOT.id)

const OPEN: TranscriptCompletion[] = ["pending", "streaming"]

const RECENT_TAIL = 20

const EXCERPT_LIMIT = 280

const excerptOf = (content: string) => {
	const letters = [...content]
	return letters.length <= EXCERPT_LIMIT
		? content
		: `${letters.slice(0, EXCERPT_LIMIT - 1).join("")}\u2026`
}

const SUMMARY_LABEL = "The conversation so far:"
const REPLY_LABEL = "The message this one replies to:"
const RECENT_LABEL = "The most recent messages:"
const PROMPT_LABEL = "The new message:"

const spoken = (message: TranscriptMessage) =>
	`${message.role}: ${message.content}`

const refuse = (error: TranscriptStoreError | SpaceError | SectionError) =>
	Promise.reject(error)

const USER_PLUGIN = "me"

const SPACE_PLUGIN_PREFIX = "space:"

const spacePlugin = (spaceId: string) => `${SPACE_PLUGIN_PREFIX}${spaceId}`

const isPluginOwner = (owner: string) =>
	owner === USER_PLUGIN || owner.startsWith(SPACE_PLUGIN_PREFIX)

const FAKE_AVATAR_DIR = "/fake/avatars"

const FAKE_AVATAR_LIMIT = 5 * 1024 * 1024

const IMAGE_SIGNATURES = [
	[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	[0xff, 0xd8, 0xff],
] as const

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

const NO_FRONT: BotSkillFront = {
	whenToUse: null,
	argumentHint: null,
	arguments: null,
	disableModelInvocation: null,
	userInvocable: null,
	allowedTools: null,
	disallowedTools: null,
	model: null,
	effort: null,
	context: null,
	agent: null,
	background: null,
	hooks: null,
	paths: null,
	shell: null,
	metadata: null,
	license: null,
	compatibility: null,
}

const learnSkill = (): BotSkill => ({
	...NO_FRONT,
	id: "learn",
	name: "learn",
	description: "How you remember.",
	body: "Your own directory is the plugin root you were given.",
	isPreloaded: true,
	isSystem: true,
})

export const createFakeTranscriptStore = (
	options: FakeTranscriptStoreOptions = {},
): TranscriptStore => {
	const pageSize = options.pageSize ?? TRANSCRIPT_PAGE_SIZE
	const bots = new Map<string, Bot>([[DEFAULT_BOT.id, DEFAULT_BOT]])
	const spaces = new Map<string, Space>([[DEFAULT_SPACE.id, DEFAULT_SPACE]])
	const spaceOf = new Map<string, string>([[DEFAULT_BOT.id, DEFAULT_SPACE.id]])
	const sections = new Map<string, Section>()
	let minted = 0
	let mintedSpaces = 0
	let mintedSections = 0
	const commands = new Map<string, AgentCommand[]>()
	const skills = new Map<string, BotSkill[]>([[DEFAULT_BOT.id, [learnSkill()]]])
	const history = new Map<string, BotHistoryEntry[]>()
	let committed = 0
	const servers = new Map<string, Map<string, Record<string, unknown>>>()
	const rows = new Map<string, TranscriptMessage>()
	const pins = new Map<string, Map<number, number>>()
	const turns = new Map<string, NewTurn & { seq: number }>()
	const seqs = new Map<string, number>()
	const runs = new Map<string, number>()
	const runRows = new Map<
		string,
		{ participant: string; live: boolean; providerSessionId: string | null }
	>()
	const checkpoints = new Map<
		string,
		{ summary: string; lastMessageSeq: number }
	>()

	const answered = new Map<string, string>()

	const participantKey = (conversationId: string, botId: string) =>
		`${conversationId}/${botId}`

	const liveSessionOf = (conversationId: string, botId: string | null) => {
		if (!botId) {
			return null
		}
		const participant = participantKey(conversationId, botId)
		for (const [id, row] of runRows) {
			if (row.participant === participant && row.live) {
				return id
			}
		}
		return null
	}

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

	const slugged = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "bot"

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

	const isPlainObject = (value: unknown) =>
		typeof value === "object" && value !== null && !Array.isArray(value)

	const recorded = (botId: string, title: string) => {
		committed += 1
		const entry: BotHistoryEntry = {
			id: `commit-${committed}`,
			timestamp: Math.floor(Date.now() / 1000),
			author: "user",
			title,
			body: "",
		}
		history.set(botId, [entry, ...(history.get(botId) ?? [])])
	}

	const historyOf = (botId: string) => [...(history.get(botId) ?? [])]

	const historyEntry = (botId: string, commitId: string) =>
		history.get(botId)?.find((entry) => entry.id === commitId)

	const listSkills = (owner: string) =>
		Promise.resolve(
			[...(skills.get(owner) ?? [])].sort((left, right) =>
				left.id.localeCompare(right.id),
			),
		)

	const addSkill = (owner: string, draft: BotSkillDraft) => {
		const held = skills.get(owner) ?? []
		const created: BotSkill = {
			...NO_FRONT,
			...draft,
			id: freeSkillId(held, draft.name),
			isPreloaded: false,
			isSystem: false,
		}
		skills.set(owner, [...held, created])
		recorded(owner, `Skill "${created.name}" saved from settings`)
		return Promise.resolve(created)
	}

	const dropSkill = (owner: string, skillId: string) =>
		writeSkill(owner, skillId, (skill) => skill, "taken away").then(() => {
			skills.set(
				owner,
				(skills.get(owner) ?? []).filter((skill) => skill.id !== skillId),
			)
		})

	const undo = (owner: string, commitId: string) => {
		const entry = historyEntry(owner, commitId)
		if (!entry) {
			return refuse({ kind: "unwritableBundle", detail: "no such commit" })
		}
		recorded(owner, `Undone: ${entry.title}`)
		return Promise.resolve(historyOf(owner))
	}

	const writeSkill = (
		botId: string,
		skillId: string,
		change: (skill: BotSkill) => BotSkill,
		verb = "saved from settings",
	): Promise<BotSkill> => {
		if (!isPluginOwner(botId) && !bots.has(botId)) {
			return refuse({ kind: "unknownBot", id: botId })
		}
		const held = skills.get(botId) ?? []
		const stored = held.find((skill) => skill.id === skillId)
		if (!stored) {
			return refuse({ kind: "unwritableBundle", detail: "no such skill" })
		}
		if (stored.isSystem) {
			return refuse({ kind: "systemSkill", id: skillId })
		}
		const written = change(stored)
		skills.set(
			botId,
			held.map((skill) => (skill.id === skillId ? written : skill)),
		)
		recorded(botId, `Skill "${written.name}" ${verb}`)
		return Promise.resolve(written)
	}

	const remember = (id: string, target: string | null) => {
		if (target) {
			answered.set(id, target)
		}
	}

	const mint = (fields: Omit<Bot, "id" | "createdAt">, spaceId: string) => {
		if (!spaces.has(spaceId)) {
			return refuse({ kind: "unknownSpace", id: spaceId })
		}
		minted += 1
		const bot: Bot = { ...fields, id: `bot-${minted}`, createdAt: minted }
		bots.set(bot.id, bot)
		spaceOf.set(bot.id, spaceId)
		skills.set(bot.id, [learnSkill()])
		return Promise.resolve(bot)
	}

	const firstSpace = () => [...spaces.keys()][0]

	const sectionsOf = (spaceId: string) =>
		[...sections.values()]
			.filter((section) => section.spaceId === spaceId)
			.sort((one, other) => one.position - other.position)

	const unsharedName = (wanted: string, spaceId: string) => {
		const carried = new Set(
			[...bots.values()]
				.filter((bot) => spaceOf.get(bot.id) === spaceId)
				.map((bot) => bot.name),
		)
		if (!carried.has(wanted)) {
			return wanted
		}
		let number = 2
		while (carried.has(`${wanted} ${number}`)) {
			number += 1
		}
		return `${wanted} ${number}`
	}

	const writePin = (
		conversationId: string,
		messageId: string,
		blockIndex: number,
		pinnedAt: number | null,
	) => {
		const stored = rows.get(messageId)
		if (!stored || stored.conversationId !== conversationId) {
			return refuse({
				kind: "storage",
				failure: { kind: "sqlite", detail: "no such message" },
			})
		}
		const held = pins.get(messageId) ?? new Map<number, number>()
		pins.set(messageId, held)
		if (pinnedAt === null) {
			held.delete(blockIndex)
		} else {
			held.set(blockIndex, pinnedAt)
		}
		return Promise.resolve()
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
		loadPage: (conversationId: string, cursor: TranscriptCursor | null) =>
			createFakeTranscriptPort({
				messages: [...rows.values()],
				pageSize,
			}).loadPage(conversationId, cursor),

		spaces: () =>
			Promise.resolve(
				[...spaces.values()].sort(
					(one, other) => one.position - other.position,
				),
			),

		createSpace: (name: string) => {
			mintedSpaces += 1
			const space: Space = {
				id: `space-${mintedSpaces}`,
				name,
				colour: SPACE_TINTS[spaces.size % SPACE_TINTS.length],
				position: mintedSpaces,
				createdAt: mintedSpaces,
			}
			spaces.set(space.id, space)
			return Promise.resolve(space)
		},

		updateSpace: (id: string, name: string, colour: AvatarBlot) => {
			const stored = spaces.get(id)
			if (!stored) {
				return refuse({ kind: "unknownSpace", id })
			}
			const written: Space = { ...stored, name, colour }
			spaces.set(id, written)
			return Promise.resolve(written)
		},

		reorderSpaces: (ids: string[]) => {
			const missing = ids.find((id) => !spaces.has(id))
			if (missing) {
				return refuse({ kind: "unknownSpace", id: missing })
			}
			ids.forEach((id, position) => {
				const stored = spaces.get(id)
				if (stored) {
					spaces.set(id, { ...stored, position })
				}
			})
			return Promise.resolve()
		},

		deleteSpace: (id: string) => {
			if (!spaces.has(id)) {
				return refuse({ kind: "unknownSpace", id })
			}
			if (spaces.size <= 1) {
				return refuse({ kind: "lastSpace" })
			}
			spaces.delete(id)
			for (const [botId, held] of spaceOf) {
				if (held === id) {
					bots.delete(botId)
					spaceOf.delete(botId)
				}
			}
			for (const [sectionId, section] of sections) {
				if (section.spaceId === id) {
					sections.delete(sectionId)
				}
			}
			return Promise.resolve()
		},

		sections: (spaceId: string) => Promise.resolve(sectionsOf(spaceId)),

		createSection: (spaceId: string, name: string) => {
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			mintedSections += 1
			const section: Section = {
				id: `section-${mintedSections}`,
				spaceId,
				name,
				position: sectionsOf(spaceId).length,
				createdAt: mintedSections,
			}
			sections.set(section.id, section)
			return Promise.resolve(section)
		},

		renameSection: (id: string, name: string) => {
			const stored = sections.get(id)
			if (!stored) {
				return refuse({ kind: "unknownSection", id })
			}
			const written: Section = { ...stored, name }
			sections.set(id, written)
			return Promise.resolve(written)
		},

		reorderSections: (spaceId: string, ids: string[]) => {
			const foreign = ids.find((id) => sections.get(id)?.spaceId !== spaceId)
			if (foreign) {
				return refuse({ kind: "foreignSection", id: foreign })
			}
			ids.forEach((id, position) => {
				const stored = sections.get(id)
				if (stored) {
					sections.set(id, { ...stored, position })
				}
			})
			return Promise.resolve()
		},

		deleteSection: (id: string) => {
			if (!sections.delete(id)) {
				return refuse({ kind: "unknownSection", id })
			}
			for (const [botId, bot] of bots) {
				if (bot.sectionId === id) {
					bots.set(botId, { ...bot, sectionId: null })
				}
			}
			return Promise.resolve()
		},

		moveBotToSection: (botId: string, sectionId: string | null) => {
			const bot = bots.get(botId)
			if (!bot) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (sectionId !== null) {
				const section = sections.get(sectionId)
				if (!section) {
					return refuse({ kind: "unknownSection", id: sectionId })
				}
				if (section.spaceId !== spaceOf.get(botId)) {
					return refuse({ kind: "foreignSection", id: sectionId })
				}
			}
			bots.set(botId, { ...bot, sectionId })
			return Promise.resolve()
		},

		moveBotToSpace: (botId: string, spaceId: string) => {
			const bot = bots.get(botId)
			if (!bot) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!spaces.has(spaceId)) {
				return refuse({ kind: "unknownSpace", id: spaceId })
			}
			if (spaceOf.get(botId) !== spaceId) {
				bots.set(botId, { ...bot, sectionId: null })
				spaceOf.set(botId, spaceId)
			}
			return Promise.resolve()
		},

		bots: (spaceId?: string | null) =>
			Promise.resolve(
				[...bots.values()].filter(
					(bot) => !spaceId || spaceOf.get(bot.id) === spaceId,
				),
			),

		createBot: (identity: BotIdentity, spaceId?: string | null) =>
			mint(
				{
					...identity,
					changesNothing: deniesChanges(identity.deniedTools),
					memory: "",
					sectionId: null,
				},
				spaceId ?? firstSpace(),
			),

		duplicateBot: (botId: string, spaceId?: string | null) => {
			const source = bots.get(botId)
			if (!source) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			const destination = spaceId ?? spaceOf.get(botId) ?? firstSpace()
			return mint(
				{
					...source,
					name: unsharedName(`${source.name} copy`, destination),
					sectionId:
						spaceOf.get(botId) === destination ? source.sectionId : null,
				},
				destination,
			)
		},

		updateBot: (id: string, identity: BotIdentity) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			const updated: Bot = {
				...stored,
				...identity,
				changesNothing: deniesChanges(identity.deniedTools),
			}
			bots.set(id, updated)
			return Promise.resolve(updated)
		},

		deleteBot: (id: string) => {
			if (!bots.delete(id)) {
				return refuse({ kind: "unknownBot", id })
			}
			spaceOf.delete(id)
			commands.delete(id)
			skills.delete(id)
			servers.delete(id)
			const conversationId = chatIdOf(id)
			for (const [rowId, row] of rows) {
				if (row.conversationId === conversationId) {
					rows.delete(rowId)
					pins.delete(rowId)
				}
			}
			seqs.delete(conversationId)
			return Promise.resolve()
		},

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

		setBotMemory: (id: string, memory: string) => {
			const stored = bots.get(id)
			if (!stored) {
				return refuse({ kind: "unknownBot", id })
			}
			const learned: Bot = { ...stored, memory: memory.trim() }
			bots.set(id, learned)
			return Promise.resolve(learned)
		},

		botSkills: (botId: string) => listSkills(botId),

		createBotSkill: (botId: string, draft: BotSkillDraft) =>
			bots.has(botId)
				? addSkill(botId, draft)
				: refuse({ kind: "unknownBot", id: botId }),

		updateBotSkill: (botId: string, skillId: string, draft: BotSkillDraft) =>
			writeSkill(botId, skillId, (skill) => ({ ...skill, ...draft })),

		setBotSkillPreloaded: (
			botId: string,
			skillId: string,
			isPreloaded: boolean,
		) => writeSkill(botId, skillId, (skill) => ({ ...skill, isPreloaded })),

		deleteBotSkill: (botId: string, skillId: string) =>
			dropSkill(botId, skillId),

		botMcpServers: (botId: string): Promise<BotMcpServer[]> =>
			Promise.resolve(
				[...(servers.get(botId)?.entries() ?? [])]
					.map(([name, config]) => ({ name, config }))
					.sort((left, right) => left.name.localeCompare(right.name)),
			),

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
			recorded(botId, `Server "${name}" saved from settings`)
			return Promise.resolve({ name, config })
		},

		deleteBotMcpServer: (botId: string, name: string) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			if (!servers.get(botId)?.delete(name)) {
				return refuse({ kind: "unwritableBundle", detail: "no such server" })
			}
			recorded(botId, `Server "${name}" taken away`)
			return Promise.resolve()
		},

		botHistory: (botId: string) => Promise.resolve(historyOf(botId)),

		botHistoryDiff: (botId: string, commitId: string) => {
			const entry = historyEntry(botId, commitId)
			return entry
				? Promise.resolve(`@@ ${entry.title} @@`)
				: refuse({ kind: "unwritableBundle", detail: "no such commit" })
		},

		revertBot: (botId: string, commitId: string) => undo(botId, commitId),

		userPluginSkills: () => listSkills(USER_PLUGIN),

		createUserPluginSkill: (draft: BotSkillDraft) =>
			addSkill(USER_PLUGIN, draft),

		updateUserPluginSkill: (skillId: string, draft: BotSkillDraft) =>
			writeSkill(USER_PLUGIN, skillId, (skill) => ({ ...skill, ...draft })),

		setUserPluginSkillPreloaded: (skillId: string, isPreloaded: boolean) =>
			writeSkill(USER_PLUGIN, skillId, (skill) => ({ ...skill, isPreloaded })),

		deleteUserPluginSkill: (skillId: string) => dropSkill(USER_PLUGIN, skillId),

		userPluginHistory: () => Promise.resolve(historyOf(USER_PLUGIN)),

		userPluginHistoryDiff: (commitId: string) => {
			const entry = historyEntry(USER_PLUGIN, commitId)
			return entry
				? Promise.resolve(`@@ ${entry.title} @@`)
				: refuse({ kind: "unwritableBundle", detail: "no such commit" })
		},

		revertUserPlugin: (commitId: string) => undo(USER_PLUGIN, commitId),

		spacePluginSkills: (spaceId: string) => listSkills(spacePlugin(spaceId)),

		createSpacePluginSkill: (spaceId: string, draft: BotSkillDraft) =>
			addSkill(spacePlugin(spaceId), draft),

		updateSpacePluginSkill: (
			spaceId: string,
			skillId: string,
			draft: BotSkillDraft,
		) =>
			writeSkill(spacePlugin(spaceId), skillId, (skill) => ({
				...skill,
				...draft,
			})),

		setSpacePluginSkillPreloaded: (
			spaceId: string,
			skillId: string,
			isPreloaded: boolean,
		) =>
			writeSkill(spacePlugin(spaceId), skillId, (skill) => ({
				...skill,
				isPreloaded,
			})),

		deleteSpacePluginSkill: (spaceId: string, skillId: string) =>
			dropSkill(spacePlugin(spaceId), skillId),

		spacePluginHistory: (spaceId: string) =>
			Promise.resolve(historyOf(spacePlugin(spaceId))),

		spacePluginHistoryDiff: (spaceId: string, commitId: string) => {
			const entry = historyEntry(spacePlugin(spaceId), commitId)
			return entry
				? Promise.resolve(`@@ ${entry.title} @@`)
				: refuse({ kind: "unwritableBundle", detail: "no such commit" })
		},

		revertSpacePlugin: (spaceId: string, commitId: string) =>
			undo(spacePlugin(spaceId), commitId),

		recordBotCommands: (botId: string, listed: AgentCommand[]) => {
			if (!bots.has(botId)) {
				return refuse({ kind: "unknownBot", id: botId })
			}
			commands.set(botId, [...listed])
			return Promise.resolve()
		},

		botCommands: (botId: string) =>
			Promise.resolve([...(commands.get(botId) ?? [])]),

		mainChat: (botId: string) =>
			Promise.resolve<Chat>({
				id: chatIdOf(botId),
				createdAt: 0,
				updatedAt: 0,
			}),

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
			return row.live && row.providerSessionId === providerSessionId
				? Promise.resolve()
				: refuse({ kind: "storage", failure: { kind: "staleWrite" } })
		},

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

		messageReference: (conversationId: string, messageId: string) => {
			const stored = rows.get(messageId)
			if (!stored || stored.conversationId !== conversationId) {
				return Promise.resolve(null)
			}
			const providerSessionId = stored.runtimeSessionId
				? (runRows.get(stored.runtimeSessionId)?.providerSessionId ?? null)
				: null
			return Promise.resolve<MessageReference>({
				uri: messageUri(conversationId, messageId),
				conversationId,
				messageId,
				role: stored.role,
				seq: stored.seq,
				createdAt: stored.createdAt,
				excerpt: excerptOf(stored.content),
				runtimeSessionId: stored.runtimeSessionId,
				providerSessionId,
			})
		},

		pinMessage: (
			conversationId: string,
			messageId: string,
			blockIndex: number,
			pinnedAt: number,
		) => writePin(conversationId, messageId, blockIndex, pinnedAt),

		unpinMessage: (
			conversationId: string,
			messageId: string,
			blockIndex: number,
		) => writePin(conversationId, messageId, blockIndex, null),

		pinnedMessages: (conversationId: string) =>
			Promise.resolve<MessagePin[]>(
				ordered(conversationId)
					.reverse()
					.flatMap((message) =>
						[...(pins.get(message.id) ?? [])]
							.sort(([left], [right]) => left - right)
							.map(([blockIndex, pinnedAt]) => ({
								message,
								blockIndex,
								pinnedAt,
							})),
					),
			),

		appendUserMessage: (message: NewUserMessage) => {
			remember(message.id, message.repliedToMessageId)
			return append({
				...message,
				role: "user",
				completion: "complete",
				runtimeSessionId: liveSessionOf(
					message.conversationId,
					message.authorBotId,
				),
			})
		},

		openAssistantMessage: (message: NewAssistantMessage) => {
			remember(message.id, message.repliedToMessageId)
			return append({
				...message,
				role: "assistant",
				content: "",
				completion: "pending",
				runtimeSessionId: liveSessionOf(
					message.conversationId,
					message.authorBotId,
				),
			})
		},

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
