import { describe, expect, it } from "vitest"

import {
	missionRunOutputSchemaFor,
	readMissionRunReport,
} from "./mission-run-output"

describe("missionRunOutputSchemaFor", () => {
	it.each(["done", "failed"] as const)(
		"accepts a report and nothing else on a %s run",
		(cause) => {
			expect(missionRunOutputSchemaFor(cause)).toMatchObject({
				properties: { outcome: { enum: ["report"] } },
				required: ["outcome", "report"],
			})
		},
	)

	it("keeps the right to say nothing on an answer run", () => {
		expect(missionRunOutputSchemaFor("answer")).toMatchObject({
			properties: { outcome: { enum: ["report", "nothing"] } },
		})
	})

	it("names a mission run in every description it carries", () => {
		const described = JSON.stringify([
			missionRunOutputSchemaFor("answer"),
			missionRunOutputSchemaFor("done"),
		])

		expect(described).not.toContain("routine")
		expect(described).toContain("mission run")
	})
})

describe("readMissionRunReport", () => {
	it.each(["done", "failed"] as const)(
		"refuses an empty report on a %s run",
		(cause) => {
			expect(
				readMissionRunReport(cause, { outcome: "report", report: "  " }),
			).toBeNull()
			expect(readMissionRunReport(cause, { outcome: "nothing" })).toBeNull()
		},
	)

	it("reads a report of a closing run", () => {
		expect(
			readMissionRunReport("done", {
				outcome: "report",
				report: "The walls stand.",
			}),
		).toEqual({ outcome: "report", text: "The walls stand." })
	})

	it("reads nothing on an answer run that has nothing to say", () => {
		expect(readMissionRunReport("answer", { outcome: "nothing" })).toEqual({
			outcome: "nothing",
		})
	})
})
