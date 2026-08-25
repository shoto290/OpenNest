import { describe, expect, it } from "vitest"

import {
	isHorizontalSwipe,
	type SpaceDrag,
	spaceDragged,
	spaceSettled,
} from "@workspace/ui/hooks/use-space-swipe"

const WIDTH = 300
const COUNT = 3

const dragBy = (drag: SpaceDrag, deltas: number[]) =>
	deltas.reduce(
		(travelled, deltaX) =>
			spaceDragged({ count: COUNT, deltaX, drag: travelled, width: WIDTH }),
		drag,
	)

const from = (index: number): SpaceDrag => ({ index, travel: 0 })

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

describe("spaceDragged", () => {
	it("adds up the travel of a gesture without moving the space in view", () => {
		expect(dragBy(from(1), [20, 30, 40])).toEqual({ index: 1, travel: 90 })
		expect(dragBy(from(1), [-20, -30])).toEqual({ index: 1, travel: -50 })
	})

	it("holds the row still at the first space and at the last", () => {
		expect(dragBy(from(0), [-60, -60])).toEqual({ index: 0, travel: 0 })
		expect(dragBy(from(COUNT - 1), [60, 60])).toEqual({
			index: COUNT - 1,
			travel: 0,
		})
	})

	it("never carries the row further than the panel beside it", () => {
		expect(dragBy(from(1), [400, 400])).toEqual({ index: 1, travel: WIDTH })
		expect(dragBy(from(1), [-400])).toEqual({ index: 1, travel: -WIDTH })
	})
})

describe("spaceSettled", () => {
	it("settles on the neighbour once the row has travelled past half a panel", () => {
		expect(
			spaceSettled({ drag: { index: 1, travel: 151 }, width: WIDTH }),
		).toBe(2)
		expect(
			spaceSettled({ drag: { index: 1, travel: -151 }, width: WIDTH }),
		).toBe(0)
	})

	it("settles back where it started short of half a panel", () => {
		expect(
			spaceSettled({ drag: { index: 1, travel: 149 }, width: WIDTH }),
		).toBe(1)
		expect(
			spaceSettled({ drag: { index: 1, travel: -149 }, width: WIDTH }),
		).toBe(1)
		expect(spaceSettled({ drag: from(1), width: WIDTH })).toBe(1)
	})

	it("stays put when the panel has no width to travel across", () => {
		expect(spaceSettled({ drag: { index: 1, travel: 151 }, width: 0 })).toBe(1)
	})
})
