import { describe, expect, it } from "vitest"

import {
	applySurfaceAffine,
	type SurfaceAffine,
	type Vec2,
} from "@workspace/ui/components/bot-avatar-3d"
import {
	BLOT_CENTER_X,
	BLOT_CENTER_Y,
	BLOT_PATH,
	BLOT_POSES,
	BLOT_TURNS,
	type BlotPose,
	blotPose,
	blotTransform,
} from "@workspace/ui/components/bot-avatar-blot"
import {
	flattenPath,
	outlineBounds,
} from "@workspace/ui/components/bot-avatar-silhouette"

const SEEDS = Array.from({ length: 64 }, (_, at) => `bot-${at}-9f3c${at * 7}`)

const BOUNDS_SLACK = 0.25

const posed = (points: Vec2[], { turn, mirrored }: BlotPose): Vec2[] => {
	const affine: SurfaceAffine = {
		spin: (turn * 2 * Math.PI) / BLOT_TURNS,
		sx: mirrored ? -1 : 1,
		sy: 1,
	}
	return points.map(([x, y]) => {
		const [dx, dy] = applySurfaceAffine(affine, [
			x - BLOT_CENTER_X,
			y - BLOT_CENTER_Y,
		])
		return [BLOT_CENTER_X + dx, BLOT_CENTER_Y + dy]
	})
}

const OUTLINE = flattenPath(BLOT_PATH)
const BASE = outlineBounds(OUTLINE)
const EVERY_POSE = [false, true].flatMap((mirrored) =>
	Array.from({ length: BLOT_TURNS }, (_, turn) => ({ turn, mirrored })),
)

describe("blotPose", () => {
	it("draws the authored shape when no seed is given", () => {
		expect(blotPose()).toEqual({ turn: 0, mirrored: false })
		expect(blotTransform()).toBe(`rotate(0 ${BLOT_CENTER_X} ${BLOT_CENTER_Y})`)
	})

	it("draws the authored shape for a bot with no id yet", () => {
		expect(blotPose("")).toEqual(blotPose())
	})

	it("holds the shape a fixed set of ids has always been drawn with", () => {
		expect(["bot-1", "bot-2", "bot-7", "bot-8"].map(blotTransform)).toEqual([
			"rotate(0 102.22 99.02)",
			"rotate(90 102.22 99.02)",
			"rotate(180 102.22 99.02)",
			"rotate(270 102.22 99.02)",
		])
		expect(["bot-5", "bot-6", "bot-3", "bot-4"].map(blotTransform)).toEqual([
			"rotate(0 102.22 99.02) translate(204.44 0) scale(-1 1)",
			"rotate(90 102.22 99.02) translate(204.44 0) scale(-1 1)",
			"rotate(180 102.22 99.02) translate(204.44 0) scale(-1 1)",
			"rotate(270 102.22 99.02) translate(204.44 0) scale(-1 1)",
		])
	})

	it("reaches every pose across a roster of ids", () => {
		const reached = new Set(SEEDS.map((seed) => JSON.stringify(blotPose(seed))))

		expect(reached.size).toBe(BLOT_POSES)
	})
})

describe("blot poses", () => {
	it("stays inside the box the authored blot occupies", () => {
		for (const pose of EVERY_POSE) {
			const bounds = outlineBounds(posed(OUTLINE, pose))

			for (const axis of [0, 1]) {
				expect(
					bounds.center[axis] - bounds.extent[axis],
				).toBeGreaterThanOrEqual(
					BASE.center[axis] - BASE.extent[axis] - BOUNDS_SLACK,
				)
				expect(bounds.center[axis] + bounds.extent[axis]).toBeLessThanOrEqual(
					BASE.center[axis] + BASE.extent[axis] + BOUNDS_SLACK,
				)
			}
		}
	})
})
