import type { BotSettingsValue } from "@workspace/ui/components/bot-settings"

import { newBotIdentity, toIdentity } from "./bot-settings"

import { createQueue } from "../queue"
import type { Bot } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { type LastWord, lastWordIn } from "../conversations/transcript-state"

export type RosterState = {
	/** Every bot on the record, oldest first, as the store answered it. */
	bots: Bot[]
	/** The last word in each bot's main conversation as the record held it at load,
	 * and when it was said, keyed by bot. It is what a row previews and dates before
	 * this launch has opened that bot: a conversation nobody has read is still a
	 * conversation somebody had. A bot with nothing settled in it, and one whose
	 * conversation could not be read, are both absent — the row keeps both slots empty
	 * either way. */
	previews: Record<string, LastWord | undefined>
	/** The bot the chat is open on. `null` is a reader who owns none: there is no
	 * bot to fall back to, which is what makes the empty state real. */
	selectedBotId: string | null
	/** Whether the selected bot's settings stand open. It is what mounts the column:
	 * closed, there is no panel beside the conversation at all, and the gear in the
	 * conversation's own bar is what brings it back. */
	isEditing: boolean
	/** Whether the settings were opened to ask about a delete, which is what lands
	 * them on the Danger zone rather than on the first group. Only ever about the
	 * selected bot, because asking to delete one is what selects it. Nothing is
	 * confirmed here — the confirmation belongs to the panel. */
	isShowingDanger: boolean
	/** Whether the record has answered the first read. It is what tells a launch
	 * from a reader who owns no bot: both hold no rows, and only one of them is a
	 * reader with nothing to show for it. A read the store refused still counts as
	 * answered — waiting on a record that will never come is worse than showing
	 * what it failed to give. */
	hasLoaded: boolean
}

export type RosterController = {
	getState: () => RosterState
	subscribe: (listener: () => void) => () => void
	/** The roster as the launch finds it, and the bot the app opens on: the oldest,
	 * or none at all. Nothing is created here — a launch that wrote a bot back would
	 * resurrect the one a reader deleted. The rows land first and their previews
	 * follow: a reader waiting on one conversation to be read is a reader looking at
	 * no roster at all. */
	load: () => Promise<void>
	select: (id: string) => void
	/** A bot, immediately, with the conversation open on it. There is no dialog to
	 * fill in first and none opens after: the bot exists and can be talked to, and the
	 * gear is there for whoever wants to describe it. */
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
	/** Selects the bot and opens its settings on the Danger zone. Nothing is asked
	 * and nothing is deleted here — `remove` is what the panel's confirmation calls. */
	askToDelete: (id: string) => void
	/** Deletes the bot, closes the panel that asked and lands the reader at the top of
	 * the roster: the row a deleted bot left behind is nobody's conversation. */
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

	/** Every call on the roster in the order it was asked for. A create that landed
	 * while the first read was in flight would otherwise be overwritten by an answer
	 * that predates it, and two writes on one bot would land in whichever order the
	 * host happened to answer. */
	const enqueue = createQueue()

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
		const stillHeld = bots.find((bot) => bot.id === state.selectedBotId)?.id
		set({
			bots,
			selectedBotId: stillHeld ?? bots[0]?.id ?? null,
			// The panel belongs to the bot it was opened on: a record that no longer
			// holds that bot has nothing left for it to edit, and the group it was
			// opened on is nobody's question.
			isEditing: state.isEditing && stillHeld !== undefined,
			isShowingDanger: state.isShowingDanger && stillHeld !== undefined,
		})
	}

	/** The tail of one bot's main conversation, or nothing at all. Read per bot and
	 * refused per bot: a conversation the store will not answer for leaves that row
	 * blank, and every other row keeps the preview it was read with. */
	const readPreview = async (botId: string): Promise<LastWord | undefined> => {
		try {
			const chat = await store.mainChat(botId)
			const page = await store.loadPage(chat.id, null)
			return lastWordIn(page.messages)
		} catch {
			return undefined
		}
	}

	/** Every row's preview, read at once: they are independent conversations, so
	 * queueing them behind each other would only make the last row wait for the
	 * first. */
	const readPreviews = async (bots: Bot[]) => {
		const previews: Record<string, LastWord | undefined> = {}
		await Promise.all(
			bots.map(async (bot) => {
				previews[bot.id] = await readPreview(bot.id)
			}),
		)
		set({ previews })
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

		load: async () => {
			await reload()
			// Answered as soon as the rows are in, before their previews: a launch
			// waiting on every conversation to be read would hold the boot screen up
			// over a roster that is already there to be read.
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
				const created = await store.createBot(newBotIdentity(state.bots))
				set({
					bots: [...state.bots, created],
					selectedBotId: created.id,
					isShowingDanger: false,
				})
			}).catch(reload),

		edit: (id: string) =>
			set({ selectedBotId: id, isEditing: true, isShowingDanger: false }),

		/** The group goes with the panel that opened on it: settings reopened with the
		 * gear are settings nobody asked a delete about, so they land on the first
		 * group again. */
		setEditing: (isEditing: boolean) =>
			set({
				isEditing,
				isShowingDanger: isEditing && state.isShowingDanger,
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
			set({ selectedBotId: id, isEditing: true, isShowingDanger: true }),

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteBot(id)
				pending.delete(id)
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
