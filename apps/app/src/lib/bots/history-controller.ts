import { createQueue } from "../queue"
import type { BotHistoryEntry } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

/** A write to the bundle and what it changed, once a reader has asked to see it.
 * The diff is a read of its own, so a commit without one is a commit nobody has
 * opened yet. */
export type BotCommit = BotHistoryEntry & { diff?: string }

export type HistoryState = {
	/** The bot the history on hand belongs to. `null` is a reader who owns no bot,
	 * which is the only state with nothing to read. */
	botId: string | null
	/** Every write to that bot's bundle, newest first, as the store answered it. */
	commits: BotCommit[]
}

export type HistoryController = {
	getState: () => HistoryState
	subscribe: (listener: () => void) => () => void
	/** The bot's history, read and shown. Called again for the same bot re-reads it:
	 * a bundle written to since is a bundle this side never heard about. */
	open: (botId: string) => Promise<void>
	/** What one write changed, read the first time it is opened and never again: a
	 * commit is what it was the day it landed, so the diff on hand is the answer. */
	loadDiff: (commitId: string) => void
	/** The write undone, as a new write on top. The store answers with the history as
	 * it now reads, which is what replaces the list — every diff already read goes
	 * with it, because the commits below the undo are no longer what the bundle
	 * holds. */
	revert: (commitId: string) => void
}

const INITIAL_STATE: HistoryState = { botId: null, commits: [] }

export const createHistoryController = (
	store: TranscriptStore,
): HistoryController => {
	let state = INITIAL_STATE
	const listeners = new Set<() => void>()

	/** Every call in the order it was asked for: an undo that landed while the read
	 * was in flight would otherwise be overwritten by an answer that predates it. */
	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<HistoryState>) => {
		state = { ...state, ...fields }
		publish()
	}

	/** The store's own answer, applied only while the bot it was read for is still
	 * the one on hand: a reader who moved on is owed the history they moved to. */
	const applyTo = (botId: string, commits: BotCommit[]) => {
		if (state.botId === botId) {
			set({ commits })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botHistory(botId))

	/** What the repository holds, read again. It is where a refused undo lands:
	 * neither the panel nor this has anywhere to say it did not go through, so the
	 * reader ends up on what the bundle really holds. */
	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
		}
	}

	/** A call against the bot on hand, or nothing at all: there is no commit to
	 * address while no bot is open. */
	const onOpenBot = (run: (botId: string) => Promise<void>) => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => run(botId)).catch(reload)
		}
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (botId: string) => {
			// The list belongs to the bundle it was read in, so leaving it up is how one
			// bot's writes end up read as another's.
			set({ botId, commits: [] })
			return enqueue(() => read(botId)).catch(() => undefined)
		},

		loadDiff: (commitId: string) => {
			const known = state.commits.find((commit) => commit.id === commitId)
			if (known?.diff !== undefined) {
				return
			}
			onOpenBot(async (botId) => {
				const diff = await store.botHistoryDiff(botId, commitId)
				applyTo(
					botId,
					state.commits.map((commit) =>
						commit.id === commitId ? { ...commit, diff } : commit,
					),
				)
			})
		},

		revert: (commitId: string) =>
			onOpenBot(async (botId) =>
				applyTo(botId, await store.revertBot(botId, commitId)),
			),
	}
}
