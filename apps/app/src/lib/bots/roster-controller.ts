import type {
	BotOutputStyle,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings"

import { newBotIdentity, toIdentity, toSettingsValue } from "./bot-settings"

import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type { Bot } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { type LastWord, lastWordIn } from "../conversations/transcript-state"

export type RosterState = {
	rosters: Record<string, Bot[]>
	bots: Bot[]
	spaceId: string | null
	previews: Record<string, LastWord | undefined>
	selectedBotId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	hasLoaded: boolean
}

export type RosterOpening = {
	spaceIds: string[]
	spaceId: string | null
	lastBotId: string | null
}

export type RosterEntry = {
	spaceId: string
	lastBotId: string | null
}

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	load: (opening: RosterOpening) => Promise<void>
	enter: (entry: RosterEntry) => void
	select: (id: string) => void
	create: () => Promise<void>
	duplicate: (id: string, spaceId?: string) => Promise<Bot | null>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	describe: (id: string, value: BotSettingsValue) => void
	restyle: (id: string, outputStyle: BotOutputStyle) => void
	uploadAvatar: (id: string, file: File) => Promise<void>
	remember: (id: string, memory: string) => Promise<void>
	askToDelete: (id: string) => void
	remove: (id: string) => Promise<void>
}

export const initialRosterState: RosterState = {
	rosters: {},
	bots: [],
	spaceId: null,
	previews: {},
	selectedBotId: null,
	isEditing: false,
	isShowingDanger: false,
	hasLoaded: false,
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

	const rosterIn = (rosters: Record<string, Bot[]>, spaceId: string | null) =>
		spaceId === null ? [] : (rosters[spaceId] ?? [])

	const set = (fields: Partial<RosterState>) => {
		const next = { ...state, ...fields }
		state = { ...next, bots: rosterIn(next.rosters, next.spaceId) }
		publish()
	}

	const withRoster = (spaceId: string | null, bots: Bot[]) =>
		spaceId === null ? state.rosters : { ...state.rosters, [spaceId]: bots }

	const held = (id: string) => state.bots.find((bot) => bot.id === id)

	const landOn = (bots: Bot[], lastBotId: string | null) => {
		const stillHeld = bots.find((bot) => bot.id === state.selectedBotId)?.id
		const remembered = bots.find((bot) => bot.id === lastBotId)?.id
		return {
			selectedBotId: stillHeld ?? remembered ?? bots[0]?.id ?? null,
			isEditing: state.isEditing && stillHeld !== undefined,
			isShowingDanger: state.isShowingDanger && stillHeld !== undefined,
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
			isShowingDanger: false,
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
			lastBotId: null,
		})

	const read = async ({ spaceIds, spaceId, lastBotId }: RosterOpening) => {
		listedSpaceIds = spaceIds
		const listed = await Promise.all(
			spaceIds.map(async (id) => [id, await store.bots(id)] as const),
		)
		const rosters = Object.fromEntries(listed)
		set({
			rosters,
			spaceId,
			...landOn(rosterIn(rosters, spaceId), lastBotId),
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

		enter: ({ spaceId, lastBotId }: RosterEntry) => {
			const bots = rosterIn(state.rosters, spaceId)
			set({
				rosters: { ...state.rosters, [spaceId]: bots },
				spaceId,
				...landOn(bots, lastBotId),
			})
		},

		select: (id: string) => {
			if (id !== state.selectedBotId) {
				set({ selectedBotId: id, isShowingDanger: false })
			}
		},

		create: () =>
			enqueue(async () => {
				admit(
					await store.createBot(newBotIdentity(state.bots), state.spaceId),
					state.spaceId,
				)
			}).catch(reload),

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
			set({ selectedBotId: id, isEditing: true, isShowingDanger: false }),

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

		askToDelete: (id: string) =>
			set({ selectedBotId: id, isEditing: true, isShowingDanger: true }),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				writes.drop(id)
				const bots = state.bots.filter((bot) => bot.id !== id)
				const { [id]: _deleted, ...previews } = state.previews
				set({
					rosters: withRoster(state.spaceId, bots),
					previews,
					selectedBotId: bots[0]?.id ?? null,
					isEditing: false,
					isShowingDanger: false,
				})
			}).catch(reload),
	}
}
