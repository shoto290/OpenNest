import { describe, expect, it } from "vitest"

import {
	isScrollSpringAtRest,
	SCROLL_SPRING_AT_REST,
	type ScrollSpringState,
	SPRING_MAX_ADVANCE_MS,
	SPRING_STEP_MS,
	stepScrollSpring,
} from "@workspace/ui/lib/scroll-spring"

const TARGET = 900

const CADENCE_60_HZ = 1000 / 60
const CADENCE_120_HZ = 1000 / 120
const CADENCE_30_HZ = 1000 / 30

const travelOver = (durationMs: number, cadenceMs: number) => {
	let state = SCROLL_SPRING_AT_REST
	const frames = Math.round(durationMs / cadenceMs)
	for (let frame = 0; frame < frames; frame += 1) {
		state = stepScrollSpring(state, TARGET, cadenceMs)
	}
	return state.position
}

const runToRest = (from: ScrollSpringState, target: number) => {
	let state = from
	let frames = 0
	const positions = [from.position]
	while (!isScrollSpringAtRest(state, target) && frames < 600) {
		state = stepScrollSpring(state, target, CADENCE_60_HZ)
		positions.push(state.position)
		frames += 1
	}
	return { frames, positions, state }
}

describe("stepScrollSpring", () => {
	it("carries a resting scroller to its target", () => {
		const { frames, state } = runToRest(SCROLL_SPRING_AT_REST, TARGET)

		expect(frames).toBeLessThan(200)
		expect(Math.abs(TARGET - state.position)).toBeLessThanOrEqual(1)
	})

	it("never overshoots the target it travels to", () => {
		const { positions } = runToRest(SCROLL_SPRING_AT_REST, TARGET)

		expect(Math.max(...positions)).toBeLessThanOrEqual(TARGET + 1)
	})

	it("keeps every frame moving toward a target that runs away", () => {
		let target = 400
		let state = SCROLL_SPRING_AT_REST
		const steps: number[] = []
		for (let frame = 0; frame < 120; frame += 1) {
			target += 12
			const next = stepScrollSpring(state, target, CADENCE_60_HZ)
			steps.push(next.position - state.position)
			state = next
		}

		expect(steps.every((step) => step > 0)).toBe(true)
		expect(target - state.position).toBeLessThan(400)
	})

	it("travels the same distance in the same time on a faster display", () => {
		expect(travelOver(500, CADENCE_120_HZ)).toBeCloseTo(
			travelOver(500, CADENCE_60_HZ),
			6,
		)
	})

	it("travels the same distance in the same time on a slower display", () => {
		expect(travelOver(500, CADENCE_30_HZ)).toBeCloseTo(
			travelOver(500, CADENCE_60_HZ),
			6,
		)
	})

	it("clamps a frame delivered after a long gap", () => {
		const gapped = stepScrollSpring(SCROLL_SPRING_AT_REST, TARGET, 5000)
		const capped = stepScrollSpring(
			SCROLL_SPRING_AT_REST,
			TARGET,
			SPRING_MAX_ADVANCE_MS,
		)

		expect(gapped.position).toBe(capped.position)
		expect(gapped.position).toBeLessThan(TARGET)
	})

	it("holds a scroller already on its target still", () => {
		const state = stepScrollSpring(
			{ position: TARGET, velocity: 0, pending: 0 },
			TARGET,
			CADENCE_60_HZ,
		)

		expect(state.position).toBe(TARGET)
		expect(isScrollSpringAtRest(state, TARGET)).toBe(true)
	})

	it("leaves a frame shorter than one step for the next one", () => {
		const state = stepScrollSpring(
			SCROLL_SPRING_AT_REST,
			TARGET,
			SPRING_STEP_MS / 2,
		)

		expect(state.position).toBe(0)
		expect(state.pending).toBeCloseTo(SPRING_STEP_MS / 2, 6)
	})
})
