import { describe, expect, it } from "vitest"

import { MEASURED_ROW_SHAPES, rowHeightFor } from "@/lib/perf/fake-layout"

const lengths = MEASURED_ROW_SHAPES.map((shape) => shape.length)

const heights = MEASURED_ROW_SHAPES.map((shape) => shape.height)

describe("fake layout row heights", () => {
	it("returns the measured height at every measured length", () => {
		for (const shape of MEASURED_ROW_SHAPES) {
			expect(rowHeightFor(shape.length)).toBe(shape.height)
		}
	})

	it("holds the shapes by ascending length and non-decreasing height", () => {
		expect(lengths).toEqual([...lengths].sort((left, right) => left - right))
		expect(new Set(lengths).size).toBe(lengths.length)
		expect(heights).toEqual([...heights].sort((left, right) => left - right))
	})
})
