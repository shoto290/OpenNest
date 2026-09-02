import { describe, expect, it } from "vitest"

import { RUN_OUTPUT_SCHEMA, readRunReport } from "./run-output"

describe("RUN_OUTPUT_SCHEMA", () => {
	it("holds an outcome of report or nothing plus the report text", () => {
		expect(RUN_OUTPUT_SCHEMA).toMatchObject({
			type: "object",
			properties: {
				outcome: { type: "string", enum: ["report", "nothing"] },
				report: { type: "string" },
			},
			required: ["outcome", "report"],
		})
	})
})

describe("readRunReport", () => {
	it("reads a report and trims what surrounds it", () => {
		expect(
			readRunReport({ outcome: "report", report: "  All quiet.\n" }),
		).toEqual({ outcome: "report", text: "All quiet." })
	})

	it.each([
		["the outcome says so", { outcome: "nothing" }],
		["the report text is blank", { outcome: "report", report: "   " }],
	])("reads nothing when %s", (_name, structuredOutput) => {
		expect(readRunReport(structuredOutput)).toEqual({ outcome: "nothing" })
	})

	it.each([
		["nothing at all", undefined],
		["a bare string", "All quiet."],
		["an unknown outcome", { outcome: "maybe", report: "All quiet." }],
		["a report whose text is not a string", { outcome: "report", report: 7 }],
	])("refuses %s", (_name, structuredOutput) => {
		expect(readRunReport(structuredOutput)).toBeNull()
	})
})
