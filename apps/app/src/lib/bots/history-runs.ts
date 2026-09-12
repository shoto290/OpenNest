import type {
	BotHistoryAuthor,
	BotHistoryEntry,
} from "../conversations/store-contract"

export const UNDONE_TITLE_PREFIX = "Change undone: "

export type HistoryRun = {
	id: string
	oldestId: string
	author: BotHistoryAuthor
	title: string
	body: string
	timestamp: number
	paths: string[]
	entryCount: number
	isUndone: boolean
}

export const dayKeyOf = (at: Date) =>
	`${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`

const dayOf = (entry: BotHistoryEntry) =>
	dayKeyOf(new Date(entry.timestamp * 1000))

const pathsKeyOf = (entry: BotHistoryEntry) =>
	[...entry.paths].sort().join("\n")

const isUndoOf = (entry: BotHistoryEntry) =>
	entry.title.startsWith(UNDONE_TITLE_PREFIX)
		? entry.title.slice(UNDONE_TITLE_PREFIX.length)
		: null

const newestFirst = (entries: BotHistoryEntry[]) =>
	[...entries].sort((left, right) => right.timestamp - left.timestamp)

const undoneIds = (entries: BotHistoryEntry[]) => {
	const undone = new Set<string>()

	entries.forEach((entry, index) => {
		const title = isUndoOf(entry)
		if (!title) return

		const target = entries
			.slice(index + 1)
			.find((older) => older.title === title && !undone.has(older.id))

		if (target) undone.add(target.id)
	})

	return undone
}

const joins = (previous: BotHistoryEntry, entry: BotHistoryEntry) =>
	!isUndoOf(previous) &&
	!isUndoOf(entry) &&
	previous.author === entry.author &&
	dayOf(previous) === dayOf(entry) &&
	pathsKeyOf(previous) === pathsKeyOf(entry)

const started = (entry: BotHistoryEntry, isUndone: boolean): HistoryRun => ({
	id: entry.id,
	oldestId: entry.id,
	author: entry.author,
	title: entry.title,
	body: entry.body,
	timestamp: entry.timestamp,
	paths: entry.paths,
	entryCount: 1,
	isUndone,
})

export const toHistoryRuns = (entries: BotHistoryEntry[]): HistoryRun[] => {
	const sorted = newestFirst(entries)
	const undone = undoneIds(sorted)
	const runs: HistoryRun[] = []

	sorted.forEach((entry, index) => {
		const previous = sorted[index - 1]
		const last = runs.at(-1)

		if (last && previous && joins(previous, entry)) {
			last.oldestId = entry.id
			last.entryCount += 1
			return
		}

		runs.push(started(entry, undone.has(entry.id)))
	})

	return runs
}
