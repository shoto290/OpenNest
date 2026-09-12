import {
	createHistoryFilesReader,
	type HistoryFilesState,
	initialHistoryFilesState,
} from "./history-files-controller"

import { createQueue } from "../queue"
import type { BotHistoryEntry } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type HistoryState = HistoryFilesState & {
	botId: string | null
	commits: BotHistoryEntry[]
	hasFailedToLoad: boolean
}

export type HistoryController = {
	getState: () => HistoryState
	subscribe: (listener: () => void) => () => void
	open: (botId: string) => Promise<void>
	reload: () => void
	openFiles: (oldestCommitId: string, newestCommitId: string) => void
	revert: (oldestCommitId: string, newestCommitId: string) => void
}

const INITIAL_STATE: HistoryState = {
	...initialHistoryFilesState,
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

	const readFiles = createHistoryFilesReader(
		(oldestCommitId, newestCommitId) =>
			store.botHistoryDiff(state.botId ?? "", oldestCommitId, newestCommitId),
		{
			run: (task) => onOpenBot(task),
			getState: () => state,
			setState: set,
		},
	)

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (botId: string) => {
			set({
				...initialHistoryFilesState,
				botId,
				commits: [],
				hasFailedToLoad: false,
			})
			return enqueue(() => read(botId)).catch(noteFailedRead)
		},

		reload,

		openFiles: (oldestCommitId: string, newestCommitId: string) => {
			if (state.botId) {
				readFiles(oldestCommitId, newestCommitId)
			}
		},

		revert: (oldestCommitId: string, newestCommitId: string) =>
			onOpenBot(async (botId) =>
				applyTo(botId, {
					commits: await store.revertBot(botId, oldestCommitId, newestCommitId),
				}),
			),
	}
}
