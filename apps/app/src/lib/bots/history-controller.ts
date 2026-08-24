import { createQueue } from "../queue"
import type { BotHistoryEntry } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type BotCommit = BotHistoryEntry & { diff?: string }

export type HistoryState = {
	botId: string | null
	commits: BotCommit[]
}

export type HistoryController = {
	getState: () => HistoryState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	loadDiff: (commitId: string) => void
	revert: (commitId: string) => void
}

const INITIAL_STATE: HistoryState = { botId: null, commits: [] }

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

	const applyTo = (botId: string, commits: BotCommit[]) => {
		if (state.botId === botId) {
			set({ commits })
		}
	}

	const read = async (botId: string) =>
		applyTo(botId, await store.botHistory(botId))

	const reload = () => {
		const botId = state.botId
		if (botId) {
			void enqueue(() => read(botId)).catch(() => undefined)
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
