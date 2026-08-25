import { describe, expect, it } from "vitest"

import {
	isHorizontalSwipe,
	swipeStepOf,
} from "@workspace/ui/hooks/use-space-swipe"

describe("isHorizontalSwipe", () => {
	it("reads a gesture that travels further sideways than down", () => {
		expect(isHorizontalSwipe({ deltaX: 40, deltaY: 4 })).toBe(true)
		expect(isHorizontalSwipe({ deltaX: -40, deltaY: 4 })).toBe(true)
	})

	it("leaves a vertical scroll alone", () => {
		expect(isHorizontalSwipe({ deltaX: 4, deltaY: 40 })).toBe(false)
		expect(isHorizontalSwipe({ deltaX: 0, deltaY: 0 })).toBe(false)
	})
})

describe("swipeStepOf", () => {
	it("waits for the gesture to travel far enough to mean anything", () => {
		expect(swipeStepOf(12)).toBe(0)
		expect(swipeStepOf(-47)).toBe(0)
	})

	it("steps forward on travel to the end and back on travel to the start", () => {
		expect(swipeStepOf(48)).toBe(1)
		expect(swipeStepOf(-90)).toBe(-1)
	})
})
