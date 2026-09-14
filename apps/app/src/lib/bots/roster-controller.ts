import type {
	BotOutputStyle,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { newBotIdentity, toIdentity, toSettingsValue } from "./bot-settings"
import { type RosterLine, rosterLinesIn, type SoloThreads } from "./roster-line"

import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import {
	isNameless,
	presentParticipants,
} from "../conversations/roster-conversations"
import type {
	Bot,
	BotDraft,
	Conversation,
	Participant,
	RosterPin,
	SpaceError,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import {
	type ConversationPreviews,
	type LastWord,
	lastWordIn,
} from "../conversations/transcript-state"

export type BotPreviews = Record<string, LastWord | undefined>

export type RosterState = {
	rosters: Record<string, Bot[]>
	bots: Bot[]
	conversationRosters: Record<string, Conversation[]>
	conversations: Conversation[]
	spaceId: string | null
	previews: Record<string, BotPreviews>
	soloThreads: SoloThreads
	conversationPreviews: ConversationPreviews
	selectedBotId: string | null
	selectedConversationId: string | null
	settingsBotId: string | null
	settingsConversationId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	isEditingConversation: boolean
	hasLoaded: boolean
	hasFailedToLoad: boolean
}

export type RosterOpening = {
	spaceIds: string[]
	spaceId: string | null
	lastRowId: string | null
}

export type RosterEntry = {
	spaceId: string
	lastRowId: string | null
}

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	load: (opening: RosterOpening) => Promise<void>
	reload: () => Promise<void>
	spacesOfBot: (botId: string) => string[]
	spaceOfConversation: (conversationId: string) => string | undefined
	enter: (entry: RosterEntry) => void
	select: (id: string) => void
	selectConversation: (id: string) => void
	create: () => Promise<void>
	createFromDraft: (draft: BotDraft) => Promise<Bot>
	createConversation: () => Promise<Conversation | null>
	duplicate: (id: string, spaceId?: string) => Promise<Bot | null>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	describe: (id: string, value: BotSettingsValue) => void
	restyle: (id: string, outputStyle: BotOutputStyle) => void
	uploadAvatar: (id: string, file: File) => Promise<void>
	remember: (id: string, memory: string) => Promise<void>
	moveToSection: (botId: string, sectionId: string | null) => void
	pin: (pins: RosterPin[]) => void
	moveToSpace: (botId: string, spaceId: string) => Promise<Bot | null>
	addToSpace: (botId: string, spaceId: string) => Promise<void>
	removeFromSpace: (botId: string, spaceId: string) => Promise<void>
	clearSection: (sectionId: string) => void
	askToDelete: (id: string) => void
	remove: (id: string) => Promise<void>
	moveConversationToSection: (
		conversationId: string,
		sectionId: string | null,
	) => Promise<void>
	editConversation: (id: string) => void
	setConversationEditing: (isEditing: boolean) => void
	describeConversation: (id: string, value: ConversationSettingsValue) => void
	nameConversation: (id: string, title: string) => void
	setConversationLead: (
		conversationId: string,
		botId: string,
	) => Promise<boolean>
	recruitToConversation: (
		conversationId: string,
		botId: string,
	) => Promise<boolean>
	dismissFromConversation: (
		conversationId: string,
		botId: string,
	) => Promise<boolean>
	botsByPresence: (conversationId: string) => Promise<Bot[]>
	removeConversation: (id: string) => Promise<void>
}

export const initialRosterState: RosterState = {
	rosters: {},
	bots: [],
	conversationRosters: {},
	conversations: [],
	spaceId: null,
	previews: {},
	soloThreads: {},
	conversationPreviews: {},
	selectedBotId: null,
	selectedConversationId: null,
	settingsBotId: null,
	settingsConversationId: null,
	isEditing: false,
	isShowingDanger: false,
	isEditingConversation: false,
	hasLoaded: false,
	hasFailedToLoad: false,
}

const LOOSE = { sectionId: null, pinPosition: null }

type Placement = { sectionId: string | null; pinPosition: number }

const relocated = <Row extends { id: string }>(
	rows: Row[],
	placed: Map<string, Placement>,
) => rows.map((row) => ({ ...row, ...(placed.get(row.id) ?? LOOSE) }))

const LAST_PIN = Number.MAX_SAFE_INTEGER

const pinnedLast = (sectionId: string | null) =>
	sectionId === null ? null : LAST_PIN

type Landing = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

const landingOn = (
	bots: Bot[],
	conversations: Conversation[],
	id: string | null,
): Landing | null => {
	if (id === null) {
		return null
	}
	if (bots.some((bot) => bot.id === id)) {
		return { selectedBotId: id, selectedConversationId: null }
	}
	if (conversations.some((conversation) => conversation.id === id)) {
		return { selectedBotId: null, selectedConversationId: id }
	}
	return null
}

const withSeatsOf = (
	conversations: Conversation[],
	botId: string,
	worn: Partial<Participant>,
): Conversation[] =>
	conversations.map((conversation) => ({
		...conversation,
		participants: conversation.participants.map((participant) =>
			participant.botId === botId ? { ...participant, ...worn } : participant,
		),
	}))

const faceOf = (bot: Bot): Partial<Participant> => ({
	name: bot.name,
	avatarAnimal: bot.avatarAnimal,
	avatarBlot: bot.avatarBlot,
	avatarImagePath: bot.avatarImagePath,
})

const seats = (conversation: Conversation, botId: string) =>
	presentParticipants(conversation).some(
		(participant) => participant.botId === botId,
	)

const firstRowId = (bots: Bot[], conversations: Conversation[]) =>
	bots[0]?.id ?? conversations[0]?.id ?? null

const NOTHING_SELECTED: Landing = {
	selectedBotId: null,
	selectedConversationId: null,
}

const NO_SETTINGS = {
	settingsBotId: null,
	settingsConversationId: null,
	isEditing: false,
	isShowingDanger: false,
	isEditingConversation: false,
}

type BotSettingsOpening = { id: string; isShowingDanger: boolean }

const withoutBotIn = (held: BotPreviews, botId: string): BotPreviews => {
	const { [botId]: _forgotten, ...kept } = held
	return kept
}

const withoutBot = (
	previews: Record<string, BotPreviews>,
	botId: string,
): Record<string, BotPreviews> =>
	Object.fromEntries(
		Object.entries(previews).map(([spaceId, held]) => [
			spaceId,
			withoutBotIn(held, botId),
		]),
	)

const withLine = (
	previews: Record<string, BotPreviews>,
	{ spaceId, botId }: RosterLine,
	word: LastWord | undefined,
): Record<string, BotPreviews> => ({
	...previews,
	[spaceId]: { ...previews[spaceId], [botId]: word },
})

const withoutLine = (
	previews: Record<string, BotPreviews>,
	{ spaceId, botId }: RosterLine,
): Record<string, BotPreviews> => ({
	...previews,
	[spaceId]: withoutBotIn(previews[spaceId] ?? {}, botId),
})

const withoutThreadsOf = (
	soloThreads: SoloThreads,
	holds: (line: RosterLine) => boolean,
): SoloThreads =>
	Object.fromEntries(
		Object.entries(soloThreads).filter(([, line]) => !holds(line)),
	)

const NO_SPACE = { kind: "unknownSpace", id: "" } satisfies SpaceError

const NO_TITLE = ""

const NOBODY_SEATED: string[] = []

const NO_BOTS: Bot[] = []

const namesTheLastSpace = (reason: unknown): boolean =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === "lastSpaceOfBot"

export type RosterControllerOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export const createRosterController = (
	store: TranscriptStore,
	{ reportFailure = raiseFailureNotice }: RosterControllerOptions = {},
): RosterController => {
	let state = initialRosterState
	let listedSpaceIds: string[] = []
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const rosterIn = <Row>(
		rosters: Record<string, Row[]>,
		spaceId: string | null,
	) => (spaceId === null ? [] : (rosters[spaceId] ?? []))

	const set = (fields: Partial<RosterState>) => {
		const next = { ...state, ...fields }
		state = {
			...next,
			bots: rosterIn(next.rosters, next.spaceId),
			conversations: rosterIn(next.conversationRosters, next.spaceId),
		}
		publish()
	}

	const withRoster = (spaceId: string | null, bots: Bot[]) =>
		spaceId === null ? state.rosters : { ...state.rosters, [spaceId]: bots }

	const withConversations = (
		spaceId: string | null,
		conversations: Conversation[],
	) =>
		spaceId === null
			? state.conversationRosters
			: { ...state.conversationRosters, [spaceId]: conversations }

	const held = (id: string) => state.bots.find((bot) => bot.id === id)

	const heldConversation = (id: string) =>
		state.conversations.find((conversation) => conversation.id === id)

	const spacesOfBot = (botId: string) =>
		Object.keys(state.rosters).filter((spaceId) =>
			rosterIn(state.rosters, spaceId).some((bot) => bot.id === botId),
		)

	const spaceOfConversation = (conversationId: string) =>
		Object.keys(state.conversationRosters).find((spaceId) =>
			rosterIn(state.conversationRosters, spaceId).some(
				(conversation) => conversation.id === conversationId,
			),
		) ?? state.soloThreads[conversationId]?.spaceId

	const landOn = (
		bots: Bot[],
		conversations: Conversation[],
		lastRowId: string | null,
	) => {
		const selectedRowId = state.selectedBotId ?? state.selectedConversationId
		return (
			landingOn(bots, conversations, selectedRowId) ??
			landingOn(bots, conversations, lastRowId) ??
			landingOn(bots, conversations, firstRowId(bots, conversations)) ??
			NOTHING_SELECTED
		)
	}

	const settingsStandingIn = (bots: Bot[], conversations: Conversation[]) => {
		const holdsBot = bots.some((bot) => bot.id === state.settingsBotId)
		const holdsConversation = conversations.some(
			(conversation) => conversation.id === state.settingsConversationId,
		)
		return {
			settingsBotId: holdsBot ? state.settingsBotId : null,
			settingsConversationId: holdsConversation
				? state.settingsConversationId
				: null,
			isEditing: state.isEditing && holdsBot,
			isShowingDanger: state.isShowingDanger && holdsBot,
			isEditingConversation: state.isEditingConversation && holdsConversation,
		}
	}

	const admit = (written: Bot, spaceId: string | null) => {
		set({
			rosters: withRoster(spaceId, [
				...rosterIn(state.rosters, spaceId),
				written,
			]),
			spaceId,
			selectedBotId: written.id,
			selectedConversationId: null,
		})
		if (spaceId) {
			void readPreviews([{ spaceId, botId: written.id }])
		}
	}

	const enrol = (written: Bot, spaceId: string) => {
		set({
			rosters: withRoster(spaceId, [
				...rosterIn(state.rosters, spaceId),
				written,
			]),
		})
		void readPreviews([{ spaceId, botId: written.id }])
	}

	const admitConversation = (written: Conversation, spaceId: string) => {
		set({
			conversationRosters: withConversations(spaceId, [
				...rosterIn(state.conversationRosters, spaceId),
				written,
			]),
			spaceId,
			selectedBotId: null,
			selectedConversationId: written.id,
		})
	}

	const applyConversation = (written: Conversation) => {
		set({
			conversationRosters: withConversations(
				state.spaceId,
				state.conversations.map((conversation) =>
					conversation.id === written.id ? written : conversation,
				),
			),
		})
	}

	const apply = (written: Bot) => {
		set({
			rosters: withRoster(
				state.spaceId,
				state.bots.map((bot) => (bot.id === written.id ? written : bot)),
			),
			conversationRosters: withConversations(
				state.spaceId,
				withSeatsOf(state.conversations, written.id, faceOf(written)),
			),
		})
	}

	const preview = (id: string, value: BotSettingsValue) => {
		const bot = held(id)
		if (!bot) {
			return
		}
		apply({ ...bot, ...toIdentity(value, bot) })
	}

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const refuseMembership = (reason: unknown) => {
		reportFailure({
			title: namesTheLastSpace(reason)
				? i18n.t("bots:spaces.remove.lastSpace")
				: i18n.t("bots:spaces.remove.failed"),
		})
	}

	const readFrom = (opening: RosterOpening) =>
		enqueue(() => read(opening)).catch(noteFailedRead)

	const reload = () =>
		readFrom({
			spaceIds: listedSpaceIds,
			spaceId: state.spaceId,
			lastRowId: null,
		})

	const read = async ({ spaceIds, spaceId, lastRowId }: RosterOpening) => {
		listedSpaceIds = spaceIds
		const listed = await Promise.all(
			spaceIds.map(async (id) => {
				const [bots, conversations] = await Promise.all([
					store.bots(id),
					store.conversations(id),
				])
				return { id, bots, conversations }
			}),
		)
		const rosters = Object.fromEntries(
			listed.map(({ id, bots }) => [id, bots] as const),
		)
		const conversationRosters = Object.fromEntries(
			listed.map(({ id, conversations }) => [id, conversations] as const),
		)
		const bots = rosterIn(rosters, spaceId)
		const conversations = rosterIn(conversationRosters, spaceId)
		set({
			rosters,
			conversationRosters,
			spaceId,
			hasFailedToLoad: false,
			...landOn(bots, conversations, lastRowId),
			...settingsStandingIn(bots, conversations),
		})
	}

	const readPreviewIn = async (
		conversationId: string,
	): Promise<LastWord | undefined> => {
		try {
			const page = await store.loadPage(conversationId, null)
			return lastWordIn(page.messages)
		} catch {
			return undefined
		}
	}

	const readSoloThread = async ({ spaceId, botId }: RosterLine) => {
		try {
			return await store.mainChat(botId, spaceId)
		} catch {
			return null
		}
	}

	const readPreviews = async (lines: RosterLine[]) => {
		const read = await Promise.all(
			lines.map(async (line) => {
				const chat = await readSoloThread(line)
				return chat
					? {
							line,
							conversationId: chat.id,
							word: await readPreviewIn(chat.id),
						}
					: null
			}),
		)
		let previews = state.previews
		const soloThreads = { ...state.soloThreads }
		for (const held of read) {
			if (!held) {
				continue
			}
			previews = withLine(previews, held.line, held.word)
			soloThreads[held.conversationId] = held.line
		}
		set({ previews, soloThreads })
	}

	const readConversationPreviews = async (conversationIds: string[]) => {
		const read: ConversationPreviews = {}
		await Promise.all(
			conversationIds.map(async (id) => {
				read[id] = await readPreviewIn(id)
			}),
		)
		set({
			conversationPreviews: { ...state.conversationPreviews, ...read },
		})
	}

	const emptySeatsIn = async (spaceId: string, botId: string) => {
		const held = rosterIn(state.conversationRosters, spaceId)
		const emptied = await Promise.all(
			held.map((conversation) =>
				seats(conversation, botId)
					? store.removeConversationParticipant(conversation.id, botId)
					: Promise.resolve(conversation),
			),
		)
		set({ conversationRosters: withConversations(spaceId, emptied) })
	}

	const catchUpOnLeftConversation = () => {
		const left = state.selectedConversationId
		if (left !== null) {
			void readConversationPreviews([left])
		}
	}

	const writes = createWriteLoop<BotSettingsValue, Bot>({
		enqueue,
		write: (id, value) => {
			const bot = held(id)
			return bot
				? store.updateBot(id, toIdentity(value, bot))
				: Promise.resolve(null)
		},
		apply: (_id, written) => apply(written),
		onRefused: reload,
	})

	const refuseSeatMove = async () => {
		reportFailure({ title: i18n.t("chat:conversationSeating.failed") })
		await reload()
		return false
	}

	const seatMove =
		(move: (conversationId: string, botId: string) => Promise<Conversation>) =>
		(conversationId: string, botId: string) =>
			enqueue(async () => {
				applyConversation(await move(conversationId, botId))
				return true
			}).catch(refuseSeatMove)

	const conversationWrites = createWriteLoop<
		ConversationSettingsValue,
		Conversation
	>({
		enqueue,
		write: (id, value) => {
			const conversation = heldConversation(id)
			return conversation
				? store.updateConversation(id, {
						title: value.name,
						instructions: value.instructions,
						sectionId: conversation.sectionId,
					})
				: Promise.resolve(null)
		},
		apply: (_id, written) => applyConversation(written),
		onRefused: reload,
	})

	const openBotSettings = ({ id, isShowingDanger }: BotSettingsOpening) =>
		set({
			settingsBotId: id,
			isEditing: true,
			isShowingDanger,
			isEditingConversation: false,
		})

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		load: async (opening: RosterOpening) => {
			await readFrom(opening)
			set({ hasLoaded: true })
			await Promise.all([
				readPreviews(rosterLinesIn(state.rosters)),
				readConversationPreviews(
					Object.values(state.conversationRosters)
						.flat()
						.map((conversation) => conversation.id),
				),
			])
		},

		reload,

		spacesOfBot,

		spaceOfConversation,

		enter: ({ spaceId, lastRowId }: RosterEntry) => {
			const bots = rosterIn(state.rosters, spaceId)
			const conversations = rosterIn(state.conversationRosters, spaceId)
			set({
				rosters: { ...state.rosters, [spaceId]: bots },
				conversationRosters: {
					...state.conversationRosters,
					[spaceId]: conversations,
				},
				spaceId,
				...landOn(bots, conversations, lastRowId),
				...NO_SETTINGS,
			})
		},

		select: (id: string) => {
			if (id !== state.selectedBotId) {
				catchUpOnLeftConversation()
				set({ selectedBotId: id, selectedConversationId: null })
			}
		},

		selectConversation: (id: string) => {
			if (id !== state.selectedConversationId) {
				catchUpOnLeftConversation()
				set({ selectedBotId: null, selectedConversationId: id })
			}
		},

		create: () =>
			enqueue(async () => {
				admit(
					await store.createBot(newBotIdentity(state.bots), state.spaceId),
					state.spaceId,
				)
			}).catch(reload),

		createFromDraft: (draft: BotDraft) =>
			enqueue(async () => {
				const spaceId = state.spaceId
				if (!spaceId) {
					throw NO_SPACE
				}
				const written = await store.createBotFromDraft(draft, spaceId)
				enrol(written, spaceId)
				return written
			}),

		createConversation: () =>
			enqueue(async () => {
				const spaceId = state.spaceId
				if (spaceId === null) {
					return null
				}
				const created = await store.createConversation({
					spaceId,
					sectionId: null,
					title: NO_TITLE,
					botIds: NOBODY_SEATED,
				})
				admitConversation(created, spaceId)
				return created
			}).catch(async () => {
				await reload()
				return null
			}),

		duplicate: (id: string, spaceId?: string) =>
			enqueue(async () => {
				const destination = spaceId ?? state.spaceId
				const written = await store.duplicateBot(id, destination)
				admit(written, destination)
				return written
			}).catch(async () => {
				await reload()
				return null
			}),

		edit: (id: string) => openBotSettings({ id, isShowingDanger: false }),

		setEditing: (isEditing: boolean) =>
			set({
				isEditing,
				isShowingDanger: isEditing && state.isShowingDanger,
			}),

		describe: (id: string, value: BotSettingsValue) => {
			preview(id, value)
			writes.push(id, value)
		},

		restyle: (id: string, outputStyle: BotOutputStyle) => {
			const bot = held(id)
			if (!bot) {
				return
			}
			const styled = { ...bot, outputStyle }
			apply(styled)
			writes.push(id, toSettingsValue(styled))
		},

		uploadAvatar: (id: string, file: File) =>
			enqueue(async () => {
				const bytes = new Uint8Array(await file.arrayBuffer())
				apply(await store.setBotAvatarImage(id, bytes))
			}).catch(reload),

		remember: (id: string, memory: string) =>
			enqueue(async () => {
				apply(await store.setBotMemory(id, memory))
			}).catch(reload),

		moveToSpace: (botId: string, spaceId: string) =>
			enqueue(async () => {
				const [home] = spacesOfBot(botId)
				const moved = home
					? rosterIn(state.rosters, home).find((bot) => bot.id === botId)
					: undefined
				if (!home || !moved || home === spaceId) {
					return null
				}
				await emptySeatsIn(home, botId)
				await store.moveBotToSpace(botId, spaceId)
				set({
					rosters: withRoster(
						home,
						rosterIn(state.rosters, home).filter((bot) => bot.id !== botId),
					),
				})
				admit({ ...moved, sectionId: null }, spaceId)
				return moved
			}).catch(async () => {
				await reload()
				return null
			}),

		addToSpace: (botId: string, spaceId: string) =>
			enqueue(async () => {
				const memberships = spacesOfBot(botId)
				const joined = rosterIn(state.rosters, memberships[0] ?? null).find(
					(bot) => bot.id === botId,
				)
				if (!joined || memberships.includes(spaceId)) {
					return
				}
				await store.addBotToSpace(botId, spaceId)
				set({
					rosters: withRoster(spaceId, [
						...rosterIn(state.rosters, spaceId),
						{ ...joined, sectionId: null, pinPosition: null },
					]),
				})
				await readPreviews([{ spaceId, botId }])
			}).catch(reload),

		removeFromSpace: (botId: string, spaceId: string) =>
			enqueue(async () => {
				await store.removeBotFromSpace(botId, spaceId)
				const bots = rosterIn(state.rosters, spaceId).filter(
					(bot) => bot.id !== botId,
				)
				const landing =
					spaceId === state.spaceId
						? landOn(bots, state.conversations, null)
						: {}
				set({
					rosters: withRoster(spaceId, bots),
					previews: withoutLine(state.previews, { spaceId, botId }),
					soloThreads: withoutThreadsOf(
						state.soloThreads,
						(line) => line.botId === botId && line.spaceId === spaceId,
					),
					...landing,
				})
			}).catch(refuseMembership),

		moveToSection: (botId: string, sectionId: string | null) => {
			const bot = held(botId)
			if (bot) {
				apply({ ...bot, sectionId, pinPosition: pinnedLast(sectionId) })
			}
		},

		pin: (pins: RosterPin[]) => {
			const placed = new Map(
				pins.map((pin, pinPosition) => [
					pin.id,
					{ sectionId: pin.sectionId, pinPosition },
				]),
			)
			set({
				rosters: withRoster(state.spaceId, relocated(state.bots, placed)),
				conversationRosters: withConversations(
					state.spaceId,
					relocated(state.conversations, placed),
				),
			})
		},

		clearSection: (sectionId: string) => {
			set({
				rosters: withRoster(
					state.spaceId,
					state.bots.map((bot) =>
						bot.sectionId === sectionId ? { ...bot, sectionId: null } : bot,
					),
				),
				conversationRosters: withConversations(
					state.spaceId,
					state.conversations.map((conversation) =>
						conversation.sectionId === sectionId
							? { ...conversation, sectionId: null }
							: conversation,
					),
				),
			})
		},

		askToDelete: (id: string) => openBotSettings({ id, isShowingDanger: true }),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				writes.drop(id)
				const bots = state.bots.filter((bot) => bot.id !== id)
				const conversations = withSeatsOf(state.conversations, id, {
					isDeleted: true,
				})
				set({
					rosters: withRoster(state.spaceId, bots),
					conversationRosters: withConversations(state.spaceId, conversations),
					previews: withoutBot(state.previews, id),
					soloThreads: withoutThreadsOf(
						state.soloThreads,
						(line) => line.botId === id,
					),
					...landOn(bots, conversations, null),
					...settingsStandingIn(bots, conversations),
				})
			}).catch(reload),

		moveConversationToSection: (
			conversationId: string,
			sectionId: string | null,
		) =>
			enqueue(async () => {
				const held = state.conversations.find(
					(conversation) => conversation.id === conversationId,
				)
				if (!held) {
					return
				}
				applyConversation({
					...held,
					sectionId,
					pinPosition: pinnedLast(sectionId),
				})
				await store.updateConversation(conversationId, {
					title: held.title,
					instructions: held.instructions,
					sectionId,
				})
			}).catch(reload),

		editConversation: (id: string) =>
			set({
				settingsConversationId: id,
				isEditing: false,
				isShowingDanger: false,
				isEditingConversation: true,
			}),

		setConversationEditing: (isEditingConversation: boolean) =>
			set({ isEditingConversation }),

		describeConversation: (id: string, value: ConversationSettingsValue) => {
			const conversation = heldConversation(id)
			if (!conversation) {
				return
			}
			applyConversation({
				...conversation,
				title: value.name,
				instructions: value.instructions,
			})
			conversationWrites.push(id, value)
		},

		nameConversation: (id: string, title: string) => {
			const conversation = heldConversation(id)
			if (!conversation || !isNameless(conversation)) {
				return
			}
			applyConversation({ ...conversation, title })
			conversationWrites.push(id, {
				name: title,
				instructions: conversation.instructions,
			})
		},

		setConversationLead: seatMove(store.setConversationLead),

		recruitToConversation: seatMove(store.addConversationParticipant),

		botsByPresence: (conversationId: string) => {
			const spaceId = state.spaceId
			return spaceId === null
				? Promise.resolve(NO_BOTS)
				: store.botsByPresence(spaceId, conversationId)
		},

		dismissFromConversation: seatMove(store.removeConversationParticipant),

		removeConversation: (id: string) =>
			enqueue(async () => {
				await store.deleteConversation(id)
				conversationWrites.drop(id)
				const conversations = state.conversations.filter(
					(conversation) => conversation.id !== id,
				)
				const { [id]: _forgotten, ...conversationPreviews } =
					state.conversationPreviews
				set({
					conversationRosters: withConversations(state.spaceId, conversations),
					conversationPreviews,
					...landOn(state.bots, conversations, null),
					...settingsStandingIn(state.bots, conversations),
				})
			}).catch(reload),
	}
}
