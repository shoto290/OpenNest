import type { HistoryRun } from "./history-runs"

const folded = (text: string) =>
	text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()

const holds = (run: HistoryRun, text: string) =>
	[run.title, run.body, ...run.paths].some((field) =>
		folded(field).includes(text),
	)

export const matchingRuns = (runs: HistoryRun[], searchText: string) => {
	const text = folded(searchText.trim())

	return text ? runs.filter((run) => holds(run, text)) : runs
}
