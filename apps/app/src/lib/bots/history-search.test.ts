import { describe, expect, it } from "vitest"

import { toHistoryRuns } from "./history-runs"
import { matchingRuns } from "./history-search"

import type { BotHistoryEntry } from "../conversations/store-contract"

const entry = (fields: Partial<BotHistoryEntry> & { id: string }) => ({
	timestamp: 1_772_000_000,
	author: "user" as const,
	title: "A skill saved",
	body: "",
	paths: ["AGENTS.md"],
	...fields,
})

const RUNS = toHistoryRuns([
	entry({
		id: "titled",
		title: "Résumé written",
		paths: ["notes.md"],
		timestamp: 1_772_000_002,
	}),
	entry({
		id: "bodied",
		title: "Something else",
		body: "Told to be brief",
		timestamp: 1_772_000_001,
	}),
	entry({
		id: "pathed",
		title: "Third thing",
		paths: ["skills/how-i-work/SKILL.md"],
	}),
])

const idsOf = (searchText: string) =>
	matchingRuns(RUNS, searchText).map((run) => run.id)

describe("history search", () => {
	it("shows the runs whose title holds the text, accents folded", () => {
		expect(idsOf("resume")).toEqual(["titled"])
	})

	it("shows the runs whose title holds the text, case folded", () => {
		expect(idsOf("SOMETHING")).toEqual(["bodied"])
	})

	it("shows the runs whose body holds the text", () => {
		expect(idsOf("brief")).toEqual(["bodied"])
	})

	it("shows the runs one of whose paths holds the text", () => {
		expect(idsOf("how-i-work")).toEqual(["pathed"])
	})

	it("shows nothing when no run holds the text", () => {
		expect(idsOf("nothing of the sort")).toEqual([])
	})

	it("shows every run again once the text is emptied", () => {
		expect(idsOf("")).toEqual(["titled", "bodied", "pathed"])
	})
})
