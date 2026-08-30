import { createQueue } from "../queue"
import type { BotHistoryEntry } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type BotCommit = BotHistoryEntry & { diff?: string }

export type HistoryState = {
	botId: string | null
	commits: BotCommit[]
	hasFailedToLoad: boolean
}

export type HistoryController = {
	getState: () => HistoryState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	reload: () => void
	loadDiff: (commitId: string) => void
	revert: (commitId: string) => void
}

const INITIAL_STATE: HistoryState = {
	botId: null,
	commits: [],
	hasFailedToLoad: false,
}

export const createHistoryController = (
	store: TranscriptStore,
): HistoryController => {
	let state = INITIAL_STATE
	const listeners = new Set<() => void>()

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

	const applyTo = (botId: string, fields: Partial<HistoryState>) => {
		if (state.botId === botId) {
			set(fields)
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, {
			commits: await store.botHistory(botId),
			hasFailedToLoad: false,
		})

	const noteFailedRead = () => set({ hasFailedToLoad: true })

	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(noteFailedRead)
		}
	}

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
			set({ botId, commits: [], hasFailedToLoad: false })
			return enqueue(() => read(botId)).catch(noteFailedRead)
		},

		reload,

		loadDiff: (commitId: string) => {
			const known = state.commits.find((commit) => commit.id === commitId)
			if (known?.diff !== undefined) {
				return
			}
			onOpenBot(async (botId) => {
				const diff = await store.botHistoryDiff(botId, commitId)
				applyTo(botId, {
					commits: state.commits.map((commit) =>
						commit.id === commitId ? { ...commit, diff } : commit,
					),
				})
			})
		},

		revert: (commitId: string) =>
			onOpenBot(async (botId) =>
				applyTo(botId, { commits: await store.revertBot(botId, commitId) }),
			),
	}
}
