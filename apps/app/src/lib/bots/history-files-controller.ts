import type { BotChangedFile } from "../conversations/store-contract"

export type HistoryFilesState = {
	openedRunId: string | null
	files: BotChangedFile[]
	areFilesReading: boolean
	haveFilesFailedToRead: boolean
}

export const initialHistoryFilesState: HistoryFilesState = {
	openedRunId: null,
	files: [],
	areFilesReading: false,
	haveFilesFailedToRead: false,
}

export type HistoryFilesHost = {
	run: (task: () => Promise<void>) => void
	getState: () => HistoryFilesState
	setState: (fields: Partial<HistoryFilesState>) => void
}

export const createHistoryFilesReader = (
	read: (
		oldestCommitId: string,
		newestCommitId: string,
	) => Promise<BotChangedFile[]>,
	host: HistoryFilesHost,
) => {
	const applyToRun = (runId: string, fields: Partial<HistoryFilesState>) => {
		if (host.getState().openedRunId === runId) {
			host.setState(fields)
		}
	}

	return (oldestCommitId: string, newestCommitId: string) => {
		if (host.getState().openedRunId === newestCommitId) {
			return
		}

		host.setState({
			openedRunId: newestCommitId,
			files: [],
			areFilesReading: true,
			haveFilesFailedToRead: false,
		})

		host.run(async () => {
			try {
				applyToRun(newestCommitId, {
					files: await read(oldestCommitId, newestCommitId),
					areFilesReading: false,
				})
			} catch {
				applyToRun(newestCommitId, {
					openedRunId: null,
					areFilesReading: false,
					haveFilesFailedToRead: true,
				})
			}
		})
	}
}
