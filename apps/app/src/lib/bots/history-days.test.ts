import { describe, expect, it } from "vitest"

import { toHistoryDays } from "./history-days"
import { toHistoryRuns, UNDONE_TITLE_PREFIX } from "./history-runs"

import type { BotHistoryEntry } from "../conversations/store-contract"

const NOW = new Date(2026, 2, 10, 18, 0, 0)

const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime() / 1000

const MINUTE = 60

const entry = (fields: Partial<BotHistoryEntry> & { id: string }) => ({
	timestamp: NOON,
	author: "user" as const,
	title: "A skill saved",
	body: "",
	paths: ["skills/how-i-work/SKILL.md"],
	...fields,
})

const daysOf = (entries: BotHistoryEntry[]) =>
	toHistoryDays(toHistoryRuns(entries), NOW)

describe("history days", () => {
	it("counts the writes a line stands for", () => {
		const [day] = daysOf([
			entry({ id: "newest", timestamp: NOON + MINUTE }),
			entry({ id: "oldest" }),
		])

		expect(day.changes).toMatchObject([{ id: "newest", retouchCount: 2 }])
	})

	it("counts nothing on a line standing for one write", () => {
		const [day] = daysOf([entry({ id: "only" })])

		expect(day.changes[0].retouchCount).toBeUndefined()
	})

	it("marks the line an undo named", () => {
		const [day] = daysOf([
			entry({
				id: "undo",
				title: `${UNDONE_TITLE_PREFIX}A skill saved`,
				timestamp: NOON + MINUTE,
			}),
			entry({ id: "written" }),
		])

		expect(day.changes).toMatchObject([
			{ id: "undo", isUndone: undefined },
			{ id: "written", isUndone: true },
		])
	})
})
