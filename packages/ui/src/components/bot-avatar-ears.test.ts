import { describe, expect, it } from "vitest"

import type { EulerAngles } from "@workspace/ui/components/bot-avatar-3d"
import {
	type BotAvatarPoseTrail,
	EAR_GAZE_LEAK_DEGREES,
	EAR_GAZE_LEAK_LIMIT,
	EAR_LAG,
	EAR_PITCH_DRAG_DEGREES,
	EAR_TWIST_LIMIT,
	EAR_YAW_DRAG_DEGREES,
	earDrag,
	earGazeLeak,
	earTwist,
	laggedPose,
	trackPose,
} from "@workspace/ui/components/bot-avatar-ears"

const FRAME = 1000 / 60
const FRAMES = 60
const TURN_PER_MS = 0.001

const turningTrail = (): BotAvatarPoseTrail => {
	const trail: BotAvatarPoseTrail = []
	for (let frame = 0; frame <= FRAMES; frame += 1) {
		const at = frame * FRAME
		trail.push({ at, pose: { yaw: at * TURN_PER_MS, pitch: 0, roll: 0 } })
	}
	return trail
}

const ramp = (): BotAvatarPoseTrail => {
	const trail: BotAvatarPoseTrail = []
	for (let frame = 0; frame <= FRAMES; frame += 1) {
		const at = frame * FRAME
		const pose: EulerAngles = { yaw: at * TURN_PER_MS, pitch: 0, roll: 0 }
		trackPose(trail, at, pose)
	}
	return trail
}

describe("the ear lag trail", () => {
	it("aims at the head pose as it stood 70 ms earlier", () => {
		const at = FRAMES * FRAME
		const trail = turningTrail()

		expect(EAR_LAG).toBe(70)
		expect(laggedPose(trail, at).yaw).toBeCloseTo((at - EAR_LAG) * TURN_PER_MS)
	})

	it("never aims at the current pose while the head turns", () => {
		const at = FRAMES * FRAME
		const trail = turningTrail()

		expect(laggedPose(trail, at).yaw).toBeLessThan(at * TURN_PER_MS)
	})

	it("keeps the lag after the trail is trimmed frame by frame", () => {
		const at = FRAMES * FRAME
		const trail = ramp()

		expect(trail.length).toBeLessThan(FRAMES)
		expect(laggedPose(trail, at).yaw).toBeCloseTo((at - EAR_LAG) * TURN_PER_MS)
	})

	it("holds the only known pose before the trail reaches back far enough", () => {
		const trail: BotAvatarPoseTrail = []
		trackPose(trail, 0, { yaw: 0.4, pitch: 0, roll: 0 })

		expect(laggedPose(trail, 0)).toEqual({ yaw: 0.4, pitch: 0, roll: 0 })
	})
})

describe("the ear drag", () => {
	it("signs the drag against the head motion", () => {
		expect(earDrag({ yaw: 1, pitch: 0 })).toBe(-EAR_YAW_DRAG_DEGREES)
		expect(earDrag({ yaw: -1, pitch: 0 })).toBe(EAR_YAW_DRAG_DEGREES)
		expect(earDrag({ yaw: 0, pitch: 1 })).toBe(-EAR_PITCH_DRAG_DEGREES)
	})

	it("reads 3.2 degrees per rad/s of yaw and 2 of pitch", () => {
		expect(EAR_YAW_DRAG_DEGREES).toBe(3.2)
		expect(EAR_PITCH_DRAG_DEGREES).toBe(2)
		expect(earDrag({ yaw: 2, pitch: 1 })).toBeCloseTo(-8.4)
	})

	it("leaves a still head dragging nothing", () => {
		expect(earDrag({ yaw: 0, pitch: 0 })).toBeCloseTo(0)
	})
})

describe("the ear twist cap", () => {
	it("holds drag, wiggle and sway together within ten degrees", () => {
		expect(EAR_TWIST_LIMIT).toBe(10)
		expect(earTwist({ drag: -9, leak: -1.8, sway: -1.6 })).toBe(
			-EAR_TWIST_LIMIT,
		)
		expect(earTwist({ drag: 9, leak: 1.8, sway: 1.6 })).toBe(EAR_TWIST_LIMIT)
	})

	it("leaves an uncapped sum untouched", () => {
		expect(earTwist({ drag: -3.2, leak: 1.2, sway: 1.6 })).toBeCloseTo(-0.4)
	})
})

describe("the ear gaze leak", () => {
	it("leaks 0.12 degrees of ear per degree of gaze yaw", () => {
		expect(EAR_GAZE_LEAK_DEGREES).toBe(0.12)
		expect(earGazeLeak(10)).toBeCloseTo(1.2)
		expect(earGazeLeak(-10)).toBeCloseTo(-1.2)
	})

	it("caps the leak at 1.8 degrees each way", () => {
		expect(EAR_GAZE_LEAK_LIMIT).toBe(1.8)
		expect(earGazeLeak(60)).toBe(EAR_GAZE_LEAK_LIMIT)
		expect(earGazeLeak(-60)).toBe(-EAR_GAZE_LEAK_LIMIT)
	})
})
