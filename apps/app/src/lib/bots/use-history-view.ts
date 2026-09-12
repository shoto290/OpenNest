import { useState } from "react"

import type {
	HistoryChange,
	PluginHistory,
} from "@workspace/ui/components/plugin-settings/history-panel"

import { oldestHistoryDate, toHistoryDays } from "./history-days"
import type { HistoryFilesState } from "./history-files-controller"
import { toHistoryRuns } from "./history-runs"
import { matchingRuns } from "./history-search"

import type { BotHistoryEntry } from "../conversations/store-contract"

export type HistoryRange = (
	oldestCommitId: string,
	newestCommitId: string,
) => void

export type HistoryViewSource = HistoryFilesState & {
	isOpen: boolean
	commits: BotHistoryEntry[]
	hasFailedToLoad: boolean
	onOpenRun: HistoryRange
	onUndoRun: HistoryRange
}

export const useHistoryView = ({
	isOpen,
	commits,
	files,
	areFilesReading,
	haveFilesFailedToRead,
	hasFailedToLoad,
	onOpenRun,
	onUndoRun,
}: HistoryViewSource): PluginHistory => {
	const [searchText, setSearchText] = useState("")

	if (!isOpen && searchText) {
		setSearchText("")
	}

	const runs = toHistoryRuns(commits)

	const overRun = (act: HistoryRange) => (change: HistoryChange) => {
		const run = runs.find((candidate) => candidate.id === change.id)
		if (run) act(run.oldestId, run.id)
	}

	return {
		days: toHistoryDays(matchingRuns(runs, searchText)),
		oldestDate: oldestHistoryDate(commits),
		haveFailedToLoad: hasFailedToLoad,
		onSearchChange: setSearchText,
		onOpen: overRun(onOpenRun),
		onUndo: overRun(onUndoRun),
		files,
		areFilesReading,
		haveFilesFailedToRead,
	}
}
