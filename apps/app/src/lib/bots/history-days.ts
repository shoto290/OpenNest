import type {
	HistoryChange,
	HistoryDay,
} from "@workspace/ui/components/plugin-settings/history-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { dayKeyOf, type HistoryRun } from "./history-runs"

import type { BotHistoryEntry } from "../conversations/store-contract"

const format = (options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(i18n.language, options)

const dayBefore = (now: Date) => {
	const before = new Date(now)
	before.setDate(now.getDate() - 1)
	return before
}

const dayLabelOf = (at: Date, now: Date) => {
	const key = dayKeyOf(at)

	if (key === dayKeyOf(now)) return i18n.t("bots:history.day.today")
	if (key === dayKeyOf(dayBefore(now)))
		return i18n.t("bots:history.day.yesterday")

	return format({ day: "numeric", month: "long" }).format(at)
}

const toChange = (run: HistoryRun, at: Date): HistoryChange => ({
	id: run.id,
	author: run.author,
	sentence: run.title,
	detail: run.body || undefined,
	at: at.toISOString(),
	time: format({ hour: "2-digit", minute: "2-digit", hour12: false }).format(
		at,
	),
	retouchCount: run.entryCount > 1 ? run.entryCount : undefined,
	isUndone: run.isUndone || undefined,
})

export const toHistoryDays = (
	runs: HistoryRun[],
	now = new Date(),
): HistoryDay[] => {
	const days: HistoryDay[] = []

	for (const run of runs) {
		const at = new Date(run.timestamp * 1000)
		const id = dayKeyOf(at)
		const last = days.at(-1)

		if (last?.id === id) last.changes.push(toChange(run, at))
		else
			days.push({
				id,
				label: dayLabelOf(at, now),
				changes: [toChange(run, at)],
			})
	}

	return days
}

export const oldestHistoryDate = (entries: BotHistoryEntry[]): string => {
	if (entries.length === 0) return ""

	const oldest = Math.min(...entries.map((entry) => entry.timestamp))

	return format({ year: "numeric", month: "long", day: "numeric" }).format(
		oldest * 1000,
	)
}
