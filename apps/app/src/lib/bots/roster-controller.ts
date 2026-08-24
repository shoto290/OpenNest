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
	bots: Bot[]
	previews: Record<string, LastWord | undefined>
	selectedBotId: string | null
	isEditing: boolean
	isShowingDanger: boolean
	hasLoaded: boolean
}

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	load: () => Promise<void>
	select: (id: string) => void
	create: () => Promise<void>
	duplicate: (id: string) => Promise<void>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	describe: (id: string, value: BotSettingsValue) => void
	restyle: (id: string, outputStyle: BotOutputStyle) => void
	uploadAvatar: (id: string, file: File) => Promise<void>
	askToDelete: (id: string) => void
	remove: (id: string) => Promise<void>
}

export const initialRosterState: RosterState = {
	bots: [],
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
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<RosterState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const held = (id: string) => state.bots.find((bot) => bot.id === id)

	const admit = (written: Bot) => {
		set({
			bots: [...state.bots, written],
			selectedBotId: written.id,
			isShowingDanger: false,
		})
	}

	const apply = (written: Bot) => {
		set({
			bots: state.bots.map((bot) => (bot.id === written.id ? written : bot)),
		})
	}

	const preview = (id: string, value: BotSettingsValue) => {
		const bot = held(id)
		if (!bot) {
			return
		}
		apply({ ...bot, ...toIdentity(value, bot) })
	}

	const reload = () => enqueue(() => read()).catch(() => undefined)

	const read = async () => {
		const bots = await store.bots()
		const stillHeld = bots.find((bot) => bot.id === state.selectedBotId)?.id
		set({
			bots,
			selectedBotId: stillHeld ?? bots[0]?.id ?? null,
			isEditing: state.isEditing && stillHeld !== undefined,
			isShowingDanger: state.isShowingDanger && stillHeld !== undefined,
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
		const previews: Record<string, LastWord | undefined> = {}
		await Promise.all(
			bots.map(async (bot) => {
				previews[bot.id] = await readPreview(bot.id)
			}),
		)
		set({ previews })
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

		load: async () => {
			await reload()
			set({ hasLoaded: true })
			await readPreviews(state.bots)
		},

		select: (id: string) => {
			if (id !== state.selectedBotId) {
				set({ selectedBotId: id, isShowingDanger: false })
			}
		},

		create: () =>
			enqueue(async () => {
				admit(await store.createBot(newBotIdentity(state.bots)))
			}).catch(reload),

		duplicate: (id: string) =>
			enqueue(async () => {
				admit(await store.duplicateBot(id))
			}).catch(reload),

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

		askToDelete: (id: string) =>
			set({ selectedBotId: id, isEditing: true, isShowingDanger: true }),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				writes.drop(id)
				const bots = state.bots.filter((bot) => bot.id !== id)
				const { [id]: _deleted, ...previews } = state.previews
				set({
					bots,
					previews,
					selectedBotId: bots[0]?.id ?? null,
					isEditing: false,
					isShowingDanger: false,
				})
			}).catch(reload),
	}
}
