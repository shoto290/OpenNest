import type { BotSettingsValue } from "@workspace/ui/components/bot-settings-panel"

import { newBotIdentity, toIdentity } from "./bot-settings"

import type { Bot } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type RosterState = {
	/** Every bot on the record, oldest first, as the store answered it. */
	bots: Bot[]
	/** The bot the chat is open on. `null` is a reader who owns none: there is no
	 * bot to fall back to, which is what makes the empty state real. */
	selectedBotId: string | null
	/** Whether the selected bot's settings stand open. It is what mounts the column:
	 * closed, there is no panel beside the conversation at all, and the gear in the
	 * conversation's own bar is what brings it back. */
	isEditing: boolean
	/** A delete waiting to be confirmed. Only ever about the selected bot, because
	 * asking to delete one is what selects it. */
	isConfirmingDelete: boolean
}

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	/** The roster as the launch finds it, and the bot the app opens on: the oldest,
	 * or none at all. Nothing is created here — a launch that wrote a bot back would
	 * resurrect the one a reader deleted. */
	load: () => Promise<void>
	select: (id: string) => void
	/** A bot, immediately, with its settings open on it. There is no dialog to fill
	 * in first: the bot exists and is then described. */
	create: () => Promise<void>
	edit: (id: string) => void
	setEditing: (isEditing: boolean) => void
	/** Who the bot is now, from the panel's whole value. Written as it is typed,
	 * one write at a time per bot: the newest value waits for the one in flight and
	 * every value in between is dropped, since each of them describes the same bot
	 * less completely than the one after it. */
	describe: (id: string, value: BotSettingsValue) => void
	/** The picture the reader picked, from the bytes of their file. The store owns
	 * where it goes and answers with the bot wearing it. */
	uploadAvatar: (id: string, file: File) => Promise<void>
	/** Selects the bot and stands the confirmation up over it. Nothing is deleted
	 * here — `remove` is what the confirmation calls. */
	askToDelete: (id: string) => void
	cancelDelete: () => void
	remove: (id: string) => Promise<void>
}

export const initialRosterState: RosterState = {
	bots: [],
	selectedBotId: null,
	isEditing: false,
	isConfirmingDelete: false,
}

/** Where the selection lands when a bot is deleted: the row that takes its place,
 * the one above it if it was the last, and nothing at all if it was the only one.
 * A bot deleted from another row's menu leaves the selection where it was. */
const selectionAfter = (
	bots: Bot[],
	deleted: string,
	selected: string | null,
): string | null => {
	if (selected !== deleted) {
		return selected
	}
	const index = bots.findIndex((bot) => bot.id === deleted)
	const rest = bots.filter((bot) => bot.id !== deleted)
	return rest[index]?.id ?? rest[index - 1]?.id ?? null
}

export const createRosterController = (
	store: TranscriptStore,
): RosterController => {
	let state = initialRosterState
	const listeners = new Set<() => void>()

	/** Every call on the roster in the order it was asked for. A create that landed
	 * while the first read was in flight would otherwise be overwritten by an answer
	 * that predates it, and two writes on one bot would land in whichever order the
	 * host happened to answer. */
	let calls: Promise<unknown> = Promise.resolve()

	/** The bots a write loop is running for, and the newest value waiting behind each
	 * one. Typing is faster than a round trip: only the last value of a burst is
	 * worth writing, and the ones before it describe the same bot on the way there. */
	const writing = new Set<string>()
	const pending = new Map<string, BotSettingsValue>()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<RosterState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const result = calls.then(operation)
		calls = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}

	const held = (id: string) => state.bots.find((bot) => bot.id === id)

	/** The store's own answer over the row it is about. Applied whole: what a caller
	 * displays is what the store holds, including a picture it refused to keep. */
	const apply = (written: Bot) => {
		set({
			bots: state.bots.map((bot) => (bot.id === written.id ? written : bot)),
		})
	}

	/** What the reader sees while a write is on its way. The panel is controlled by
	 * this state, so the value has to move on the keystroke rather than on the
	 * answer — a field that waited for SQLite would drop characters. */
	const preview = (id: string, value: BotSettingsValue) => {
		const bot = held(id)
		if (!bot) {
			return
		}
		apply({ ...bot, ...toIdentity(value, bot) })
	}

	/** The record, read and shown. It is what a launch opens on and what a refused
	 * write falls back to: either way the reader ends up on what the file holds, and
	 * a read that fails leaves them on what they were already looking at. Nothing else
	 * can be done about a refusal here — neither the roster nor the panel has anywhere
	 * to say a save did not land. */
	const reload = () => enqueue(() => read()).catch(() => undefined)

	const read = async () => {
		const bots = await store.bots()
		set({
			bots,
			selectedBotId:
				bots.find((bot) => bot.id === state.selectedBotId)?.id ??
				bots[0]?.id ??
				null,
		})
	}

	/** The value that is still waiting, and then whatever arrived while it was being
	 * written. The store's answer is only applied once nothing is queued behind it:
	 * an answer to a value the reader has already typed past would rewind the field
	 * they are in. */
	const flush = async (id: string): Promise<void> => {
		const value = pending.get(id)
		if (!value) {
			return
		}
		pending.delete(id)
		const bot = held(id)
		if (!bot) {
			return
		}
		const written = await store.updateBot(id, toIdentity(value, bot))
		if (!pending.has(id)) {
			apply(written)
		}
		return flush(id)
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		load: reload,

		select: (id: string) => {
			if (id !== state.selectedBotId) {
				set({ selectedBotId: id, isConfirmingDelete: false })
			}
		},

		create: () =>
			enqueue(async () => {
				const created = await store.createBot(newBotIdentity(state.bots))
				set({
					bots: [...state.bots, created],
					selectedBotId: created.id,
					isEditing: true,
					isConfirmingDelete: false,
				})
			}).catch(reload),

		edit: (id: string) =>
			set({ selectedBotId: id, isEditing: true, isConfirmingDelete: false }),

		/** A confirmation goes with the panel that held it: the dialog lives inside the
		 * column, so one still asked for after the reader closed it would pop the next
		 * time they opened the settings for something else. */
		setEditing: (isEditing: boolean) =>
			set({
				isEditing,
				isConfirmingDelete: isEditing && state.isConfirmingDelete,
			}),

		describe: (id: string, value: BotSettingsValue) => {
			preview(id, value)
			pending.set(id, value)
			if (writing.has(id)) {
				return
			}
			writing.add(id)
			void enqueue(() => flush(id))
				.catch(reload)
				.finally(() => {
					writing.delete(id)
				})
		},

		uploadAvatar: (id: string, file: File) =>
			enqueue(async () => {
				const bytes = new Uint8Array(await file.arrayBuffer())
				apply(await store.setBotAvatarImage(id, bytes))
			}).catch(reload),

		askToDelete: (id: string) =>
			set({ selectedBotId: id, isEditing: true, isConfirmingDelete: true }),

		cancelDelete: () => set({ isConfirmingDelete: false }),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				pending.delete(id)
				const selectedBotId = selectionAfter(
					state.bots,
					id,
					state.selectedBotId,
				)
				set({
					bots: state.bots.filter((bot) => bot.id !== id),
					selectedBotId,
					isEditing: state.isEditing && selectedBotId !== null,
					isConfirmingDelete: false,
				})
			}).catch(reload),
	}
}
