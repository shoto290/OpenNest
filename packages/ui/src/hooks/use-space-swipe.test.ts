import { describe, expect, it } from "vitest"

import {
	isHorizontalSwipe,
	type SpaceDrag,
	spaceAtRest,
	spaceDragged,
} from "@workspace/ui/hooks/use-space-swipe"

const WIDTH = 300
const COUNT = 3

const dragBy = (drag: SpaceDrag, deltas: number[]) =>
	deltas.reduce(
		(travelled, deltaX) =>
			spaceDragged({ count: COUNT, deltaX, drag: travelled, width: WIDTH }),
		drag,
	)

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
		expect(dragBy(spaceAtRest(1), [20, 30, 40])).toEqual({
			index: 1,
			travel: 90,
			isCommitted: false,
		})
		expect(dragBy(spaceAtRest(1), [-20, -30])).toEqual({
			index: 1,
			travel: -50,
			isCommitted: false,
		})
	})

	it("holds the row still at the first space and at the last", () => {
		expect(dragBy(spaceAtRest(0), [-200, -200])).toEqual(spaceAtRest(0))
		expect(dragBy(spaceAtRest(COUNT - 1), [200, 200])).toEqual(
			spaceAtRest(COUNT - 1),
		)
	})

	it("commits to the neighbour as the row crosses half a panel", () => {
		expect(dragBy(spaceAtRest(1), [100, 50])).toEqual({
			index: 2,
			travel: 0,
			isCommitted: true,
		})
		expect(dragBy(spaceAtRest(1), [-100, -50])).toEqual({
			index: 0,
			travel: 0,
			isCommitted: true,
		})
	})

	it("holds the space in view short of half a panel", () => {
		expect(dragBy(spaceAtRest(1), [100, 49])).toEqual({
			index: 1,
			travel: 149,
			isCommitted: false,
		})
	})

	it("commits one space at a time however far the gesture travels", () => {
		expect(dragBy(spaceAtRest(0), [2000])).toEqual({
			index: 1,
			travel: 0,
			isCommitted: true,
		})
	})

	it("stays put when the panel has no width to travel across", () => {
		expect(
			spaceDragged({
				count: COUNT,
				deltaX: 400,
				drag: spaceAtRest(1),
				width: 0,
			}),
		).toEqual({ index: 1, travel: 400, isCommitted: false })
	})
})
