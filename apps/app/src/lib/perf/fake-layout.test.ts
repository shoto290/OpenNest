import { describe, expect, it } from "vitest"

import { MEASURED_ROWS } from "@workspace/ui/lib/measured-rows"

import { rowHeightFor } from "@/lib/perf/fake-layout"

const lengths = MEASURED_ROWS.map((row) => row.length)

const heights = MEASURED_ROWS.map((row) => row.height)

describe("fake layout row heights", () => {
	it("returns the measured height at every measured length", () => {
		for (const row of MEASURED_ROWS) {
			expect(rowHeightFor(row.length)).toBe(row.height)
		}
	})

	it("holds the shapes by ascending length and non-decreasing height", () => {
		expect(lengths).toEqual([...lengths].sort((left, right) => left - right))
		expect(new Set(lengths).size).toBe(lengths.length)
		expect(heights).toEqual([...heights].sort((left, right) => left - right))
	})
})
