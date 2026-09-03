import { describe, expect, it } from "vitest"

import type { Routine } from "./routine-contract"
import { botIdsOf, toRoutineRows, toSourceTitles } from "./routines-model"
import type { TriggerSource } from "./trigger-contract"

const routine = (over: Partial<Routine>): Routine => ({
	id: "r-1",
	conversationId: "c-1",
	botId: "b-1",
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 0,
	...over,
})

const SCHEDULE: TriggerSource = {
	id: "schedule",
	title: "Every day at 08:00",
	payload: [],
	dedupeKey: "at",
}

describe("botIdsOf", () => {
	it("keeps one entry per bot", () => {
		expect(
			botIdsOf([
				routine({ id: "r-1", botId: "b-1" }),
				routine({ id: "r-2", botId: "b-2" }),
				routine({ id: "r-3", botId: "b-1" }),
			]),
		).toEqual(["b-1", "b-2"])
	})
})

describe("toRoutineRows", () => {
	const titles = toSourceTitles([{ botId: "b-1", sources: [SCHEDULE] }])

	it("names the trigger source declared by the bot of the routine", () => {
		expect(toRoutineRows([routine({})], titles)[0].triggerSourceTitle).toBe(
			SCHEDULE.title,
		)
	})

	it("names a source no read declared by its id", () => {
		expect(
			toRoutineRows([routine({ triggerSourceId: "webhook" })], titles)[0]
				.triggerSourceTitle,
		).toBe("webhook")
	})

	it("marks a disabled routine that ran out of attempts", () => {
		expect(
			toRoutineRows(
				[routine({ isEnabled: false, consecutiveFailures: 3 })],
				titles,
			)[0].hasStoppedItself,
		).toBe(true)
	})

	it("leaves an enabled routine unmarked whatever it failed before", () => {
		expect(
			toRoutineRows(
				[routine({ isEnabled: true, consecutiveFailures: 3 })],
				titles,
			)[0].hasStoppedItself,
		).toBe(false)
	})

	it("leaves a disabled routine that never failed unmarked", () => {
		expect(
			toRoutineRows(
				[routine({ isEnabled: false, consecutiveFailures: 0 })],
				titles,
			)[0].hasStoppedItself,
		).toBe(false)
	})
})
