import { describe, expect, it } from "vitest"

import {
	hasStoppedCoasting,
	isHorizontalSwipe,
	type SpaceDrag,
	spaceAtRest,
	spaceDragged,
	spaceMagnetised,
	stillCoasting,
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
			coasting: 0,
			coasted: Number.POSITIVE_INFINITY,
		})
		expect(dragBy(spaceAtRest(1), [-20, -30])).toEqual({
			index: 1,
			travel: -50,
			coasting: 0,
			coasted: Number.POSITIVE_INFINITY,
		})
	})

	it("holds the row still at the first space and at the last", () => {
		expect(dragBy(spaceAtRest(0), [-200, -200])).toEqual(spaceAtRest(0))
		expect(dragBy(spaceAtRest(COUNT - 1), [200, 200])).toEqual(
			spaceAtRest(COUNT - 1),
		)
	})

	it("holds the space in view while the row is still on its way over", () => {
		expect(dragBy(spaceAtRest(1), [100, 149])).toEqual({
			index: 1,
			travel: 249,
			coasting: 0,
			coasted: Number.POSITIVE_INFINITY,
		})
	})

	it("reaches the neighbour once the row has travelled a whole panel", () => {
		expect(dragBy(spaceAtRest(1), [100, 200])).toEqual({
			index: 2,
			travel: 0,
			coasting: 1,
			coasted: Number.POSITIVE_INFINITY,
		})
		expect(dragBy(spaceAtRest(1), [-100, -200])).toEqual({
			index: 0,
			travel: 0,
			coasting: -1,
			coasted: Number.POSITIVE_INFINITY,
		})
	})

	it("reaches one space at a time however far the gesture travels", () => {
		expect(dragBy(spaceAtRest(0), [2000])).toEqual({
			index: 1,
			travel: 0,
			coasting: 1,
			coasted: Number.POSITIVE_INFINITY,
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
		).toEqual({
			index: 1,
			travel: 400,
			coasting: 0,
			coasted: Number.POSITIVE_INFINITY,
		})
	})
})

describe("spaceMagnetised", () => {
	it("lands on the neighbour when the row was let go past half a panel", () => {
		expect(
			spaceMagnetised({
				drag: { ...spaceAtRest(1), travel: 151 },
				width: WIDTH,
			}),
		).toBe(2)
		expect(
			spaceMagnetised({
				drag: { ...spaceAtRest(1), travel: -151 },
				width: WIDTH,
			}),
		).toBe(0)
	})

	it("lands back where it started when it was let go short of half", () => {
		expect(
			spaceMagnetised({
				drag: { ...spaceAtRest(1), travel: 149 },
				width: WIDTH,
			}),
		).toBe(1)
		expect(spaceMagnetised({ drag: spaceAtRest(1), width: WIDTH })).toBe(1)
	})

	it("stays put when the panel has no width to travel across", () => {
		expect(
			spaceMagnetised({ drag: { ...spaceAtRest(1), travel: 400 }, width: 0 }),
		).toBe(1)
	})
})

describe("hasStoppedCoasting", () => {
	const coasting: SpaceDrag = {
		index: 2,
		travel: 0,
		coasting: 1,
		coasted: 40,
	}

	it("reads the momentum of the flick that landed as still running", () => {
		expect(hasStoppedCoasting({ deltaX: 40, drag: coasting })).toBe(false)
		expect(hasStoppedCoasting({ deltaX: 2, drag: coasting })).toBe(false)
	})

	it("reads a lull as the end of it, since momentum only ever decays", () => {
		expect(hasStoppedCoasting({ deltaX: 1.5, drag: coasting })).toBe(true)
		expect(hasStoppedCoasting({ deltaX: 0, drag: coasting })).toBe(true)
	})

	it("reads a push the other way as the end of it, since momentum never turns", () => {
		expect(hasStoppedCoasting({ deltaX: -40, drag: coasting })).toBe(true)
	})

	it("reads a push harder than the last as fingers back on the trackpad", () => {
		expect(hasStoppedCoasting({ deltaX: 61, drag: coasting })).toBe(true)
		expect(hasStoppedCoasting({ deltaX: 44, drag: coasting })).toBe(false)
	})

	it("takes the first event of a coast as the coast itself", () => {
		const begun = { ...coasting, coasted: Number.POSITIVE_INFINITY }
		expect(hasStoppedCoasting({ deltaX: 200, drag: begun })).toBe(false)
		expect(stillCoasting(begun, 200).coasted).toBe(200)
	})

	it("measures a push against the slowest the coast has been, not the last", () => {
		const slowing = stillCoasting(stillCoasting(coasting, 30), 20)
		expect(hasStoppedCoasting({ deltaX: 25, drag: slowing })).toBe(false)
		expect(hasStoppedCoasting({ deltaX: 31, drag: slowing })).toBe(true)
	})
})
