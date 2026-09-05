import { describe, expect, it } from "vitest"

import { isReportOwedBy, missionRunOutputSchemaFor } from "./mission-run-output"

describe("missionRunOutputSchemaFor", () => {
	it.each(["done", "failed"] as const)(
		"accepts a report and nothing else on a %s run",
		(cause) => {
			expect(missionRunOutputSchemaFor(cause)).toMatchObject({
				properties: {
					outcome: { enum: ["report"] },
					report: { minLength: 1 },
				},
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

describe("isReportOwedBy", () => {
	it.each(["done", "failed"] as const)("owes a report on a %s run", (cause) => {
		expect(isReportOwedBy(cause)).toBe(true)
	})

	it("owes none on an answer run", () => {
		expect(isReportOwedBy("answer")).toBe(false)
	})
})
