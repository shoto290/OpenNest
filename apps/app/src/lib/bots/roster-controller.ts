import type {
	BotOutputStyle,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"

import { newBotIdentity, toIdentity, toSettingsValue } from "./bot-settings"

import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type {
	Bot,
	Conversation,
	ConversationDraft,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { type LastWord, lastWordIn } from "../conversations/transcript-state"

export type RosterState = {
	rosters: Record<string, Bot[]>
	bots: Bot[]
	conversationRosters: Record<string, Conversation[]>
	conversations: Conversation[]
	spaceId: string | null
	previews: Record<string, LastWord | undefined>
	selectedBotId: string | null
	selectedConversationId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	isEditingConversation: boolean
	hasLoaded: boolean
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

export type NewConversation = Pick<ConversationDraft, "title" | "botIds">

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	load: (opening: RosterOpening) => Promise<void>
	enter: (entry: RosterEntry) => void
	select: (id: string) => void
	selectConversation: (id: string) => void
	create: () => Promise<void>
	createConversation: (draft: NewConversation) => Promise<Conversation | null>
	duplicate: (id: string, spaceId?: string) => Promise<Bot | null>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	describe: (id: string, value: BotSettingsValue) => void
	restyle: (id: string, outputStyle: BotOutputStyle) => void
	uploadAvatar: (id: string, file: File) => Promise<void>
	remember: (id: string, memory: string) => Promise<void>
	moveToSection: (botId: string, sectionId: string | null) => void
	moveToSpace: (botId: string, spaceId: string) => Promise<Bot | null>
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
	setConversationLead: (conversationId: string, botId: string) => Promise<void>
	recruitToConversation: (
		conversationId: string,
		botId: string,
	) => Promise<void>
	dismissFromConversation: (
		conversationId: string,
		botId: string,
	) => Promise<void>
	removeConversation: (id: string) => Promise<void>
}

export const initialRosterState: RosterState = {
	rosters: {},
	bots: [],
	conversationRosters: {},
	conversations: [],
	spaceId: null,
	previews: {},
	selectedBotId: null,
	selectedConversationId: null,
	isEditing: false,
	isShowingDanger: false,
	isEditingConversation: false,
	hasLoaded: false,
}

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

const firstRowId = (bots: Bot[], conversations: Conversation[]) =>
	bots[0]?.id ?? conversations[0]?.id ?? null

const NOTHING_SELECTED: Landing = {
	selectedBotId: null,
	selectedConversationId: null,
}

export const createRosterController = (
	store: TranscriptStore,
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

	const spaceOfBot = (botId: string) =>
		Object.keys(state.rosters).find((spaceId) =>
			rosterIn(state.rosters, spaceId).some((bot) => bot.id === botId),
		)

	const landOn = (
		bots: Bot[],
		conversations: Conversation[],
		lastRowId: string | null,
	) => {
		const selectedRowId = state.selectedBotId ?? state.selectedConversationId
		const stillHeld = landingOn(bots, conversations, selectedRowId)
		const holdsBot = stillHeld !== null && stillHeld.selectedBotId !== null
		const holdsConversation =
			stillHeld !== null && stillHeld.selectedConversationId !== null
		return {
			...(stillHeld ??
				landingOn(bots, conversations, lastRowId) ??
				landingOn(bots, conversations, firstRowId(bots, conversations)) ??
				NOTHING_SELECTED),
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
			isShowingDanger: false,
			isEditingConversation: false,
		})
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
			isEditing: false,
			isShowingDanger: false,
			isEditingConversation: false,
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
		})
	}

	const preview = (id: string, value: BotSettingsValue) => {
		const bot = held(id)
		if (!bot) {
			return
		}
		apply({ ...bot, ...toIdentity(value, bot) })
	}

	const readFrom = (opening: RosterOpening) =>
		enqueue(() => read(opening)).catch(() => undefined)

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
		set({
			rosters,
			conversationRosters,
			spaceId,
			...landOn(
				rosterIn(rosters, spaceId),
				rosterIn(conversationRosters, spaceId),
				lastRowId,
			),
		})
	}

	const readPreview = async (botId: string): Promise<LastWord | undefined> => {
		try {
			const chat = await store.mainChat(botId)
			const page = await store.loadPage(chat.id, null)
			return lastWordIn(page.messages)
		} catch {
			return undefined
		}
	}

	const readPreviews = async (bots: Bot[]) => {
		const read: Record<string, LastWord | undefined> = {}
		await Promise.all(
			bots.map(async (bot) => {
				read[bot.id] = await readPreview(bot.id)
			}),
		)
		set({ previews: { ...state.previews, ...read } })
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
			await readPreviews(Object.values(state.rosters).flat())
		},

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
			})
		},

		select: (id: string) => {
			if (id !== state.selectedBotId) {
				set({
					selectedBotId: id,
					selectedConversationId: null,
					isShowingDanger: false,
					isEditingConversation: false,
				})
			}
		},

		selectConversation: (id: string) => {
			if (id !== state.selectedConversationId) {
				set({
					selectedBotId: null,
					selectedConversationId: id,
					isEditing: false,
					isShowingDanger: false,
					isEditingConversation: false,
				})
			}
		},

		create: () =>
			enqueue(async () => {
				admit(
					await store.createBot(newBotIdentity(state.bots), state.spaceId),
					state.spaceId,
				)
			}).catch(reload),

		createConversation: ({ title, botIds }: NewConversation) =>
			enqueue(async () => {
				const spaceId = state.spaceId
				if (spaceId === null) {
					return null
				}
				const created = await store.createConversation({
					spaceId,
					sectionId: null,
					title,
					botIds,
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

		edit: (id: string) =>
			set({
				selectedBotId: id,
				selectedConversationId: null,
				isEditing: true,
				isShowingDanger: false,
				isEditingConversation: false,
			}),

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
				const home = spaceOfBot(botId)
				const moved = home
					? rosterIn(state.rosters, home).find((bot) => bot.id === botId)
					: undefined
				if (!home || !moved || home === spaceId) {
					return null
				}
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

		moveToSection: (botId: string, sectionId: string | null) => {
			const bot = held(botId)
			if (bot) {
				apply({ ...bot, sectionId })
			}
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

		askToDelete: (id: string) =>
			set({
				selectedBotId: id,
				selectedConversationId: null,
				isEditing: true,
				isShowingDanger: true,
				isEditingConversation: false,
			}),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				writes.drop(id)
				const bots = state.bots.filter((bot) => bot.id !== id)
				const { [id]: _deleted, ...previews } = state.previews
				set({
					rosters: withRoster(state.spaceId, bots),
					previews,
					...landOn(bots, state.conversations, null),
					isEditing: false,
					isShowingDanger: false,
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
				applyConversation({ ...held, sectionId })
				await store.updateConversation(conversationId, {
					title: held.title,
					instructions: held.instructions,
					sectionId,
				})
			}).catch(reload),

		editConversation: (id: string) =>
			set({
				selectedBotId: null,
				selectedConversationId: id,
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

		setConversationLead: (conversationId: string, botId: string) =>
			enqueue(async () => {
				applyConversation(
					await store.setConversationLead(conversationId, botId),
				)
			}).catch(reload),

		recruitToConversation: (conversationId: string, botId: string) =>
			enqueue(async () => {
				applyConversation(
					await store.addConversationParticipant(conversationId, botId),
				)
			}).catch(reload),

		dismissFromConversation: (conversationId: string, botId: string) =>
			enqueue(async () => {
				applyConversation(
					await store.removeConversationParticipant(conversationId, botId),
				)
			}).catch(reload),

		removeConversation: (id: string) =>
			enqueue(async () => {
				await store.deleteConversation(id)
				conversationWrites.drop(id)
				const conversations = state.conversations.filter(
					(conversation) => conversation.id !== id,
				)
				set({
					conversationRosters: withConversations(state.spaceId, conversations),
					...landOn(state.bots, conversations, null),
				})
			}).catch(reload),
	}
}
