import { describe, expect, it } from "vitest"

import { toHistoryRuns, UNDONE_TITLE_PREFIX } from "./history-runs"

import type { BotHistoryEntry } from "../conversations/store-contract"

const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime() / 1000

const MINUTE = 60

const DAY = 24 * 60 * MINUTE

const entry = (fields: Partial<BotHistoryEntry> & { id: string }) => ({
	timestamp: NOON,
	author: "user" as const,
	title: "A skill saved",
	body: "",
	paths: ["skills/how-i-work/SKILL.md"],
	...fields,
})

describe("history runs", () => {
	it("reads consecutive writes of one author, day and paths as one line", () => {
		const runs = toHistoryRuns([
			entry({
				id: "newest",
				title: "The last word",
				body: "Because",
				timestamp: NOON + MINUTE,
			}),
			entry({ id: "middle" }),
			entry({ id: "oldest", timestamp: NOON - MINUTE }),
		])

		expect(runs).toEqual([
			expect.objectContaining({
				id: "newest",
				oldestId: "oldest",
				title: "The last word",
				body: "Because",
				timestamp: NOON + MINUTE,
				entryCount: 3,
			}),
		])
	})

	it("leaves a write of another author, day or paths out of the run", () => {
		const runs = toHistoryRuns([
			entry({ id: "bot", author: "bot", timestamp: NOON + MINUTE }),
			entry({ id: "today" }),
			entry({ id: "yesterday", timestamp: NOON - DAY }),
			entry({
				id: "elsewhere",
				timestamp: NOON - DAY - MINUTE,
				paths: ["AGENTS.md"],
			}),
		])

		expect(runs.map((run) => run.id)).toEqual([
			"bot",
			"today",
			"yesterday",
			"elsewhere",
		])
	})

	it("leaves an undo in a run of its own", () => {
		const runs = toHistoryRuns([
			entry({
				id: "undo",
				title: `${UNDONE_TITLE_PREFIX}A skill saved`,
				timestamp: NOON + MINUTE,
			}),
			entry({ id: "written" }),
		])

		expect(runs.map((run) => run.id)).toEqual(["undo", "written"])
	})

	it("marks the nearest earlier write an undo names", () => {
		const runs = toHistoryRuns([
			entry({
				id: "undo",
				title: `${UNDONE_TITLE_PREFIX}A skill saved`,
				timestamp: NOON + MINUTE,
			}),
			entry({ id: "nearest", paths: ["AGENTS.md"] }),
			entry({ id: "earlier", timestamp: NOON - MINUTE, paths: ["SKILL.md"] }),
		])

		expect(runs.map((run) => [run.id, run.isUndone])).toEqual([
			["undo", false],
			["nearest", true],
			["earlier", false],
		])
	})

	it("leaves a write already marked to the undo that named it first", () => {
		const runs = toHistoryRuns([
			entry({
				id: "second-undo",
				title: `${UNDONE_TITLE_PREFIX}A skill saved`,
				timestamp: NOON + 2 * MINUTE,
			}),
			entry({
				id: "first-undo",
				title: `${UNDONE_TITLE_PREFIX}A skill saved`,
				timestamp: NOON + MINUTE,
			}),
			entry({ id: "nearest", paths: ["AGENTS.md"] }),
			entry({ id: "earlier", timestamp: NOON - MINUTE, paths: ["SKILL.md"] }),
		])

		expect(runs.filter((run) => run.isUndone).map((run) => run.id)).toEqual([
			"nearest",
			"earlier",
		])
	})
})
