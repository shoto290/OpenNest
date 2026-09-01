import { describe, expect, it } from "vitest"

import {
	isScrollSpringAtRest,
	type ScrollSpringState,
	stepScrollSpring,
} from "@workspace/ui/lib/scroll-spring"

const runToRest = (from: ScrollSpringState, target: () => number) => {
	let state = from
	let frames = 0
	const positions = [from.position]
	while (!isScrollSpringAtRest(state, target()) && frames < 600) {
		state = stepScrollSpring(state, target())
		positions.push(state.position)
		frames += 1
	}
	return { frames, positions, state }
}

describe("stepScrollSpring", () => {
	it("carries a resting scroller to its target", () => {
		const { frames, state } = runToRest({ position: 0, velocity: 0 }, () => 900)

		expect(frames).toBeLessThan(200)
		expect(Math.abs(900 - state.position)).toBeLessThanOrEqual(1)
	})

	it("never overshoots the target it travels to", () => {
		const { positions } = runToRest({ position: 0, velocity: 0 }, () => 900)

		expect(Math.max(...positions)).toBeLessThanOrEqual(901)
	})

	it("keeps every frame moving toward a target that runs away", () => {
		let target = 400
		let state: ScrollSpringState = { position: 0, velocity: 0 }
		const steps: number[] = []
		for (let frame = 0; frame < 120; frame += 1) {
			target += 12
			const next = stepScrollSpring(state, target)
			steps.push(next.position - state.position)
			state = next
		}

		expect(steps.every((step) => step > 0)).toBe(true)
		expect(target - state.position).toBeLessThan(400)
	})

	it("holds a scroller already on its target still", () => {
		const state = stepScrollSpring({ position: 900, velocity: 0 }, 900)

		expect(state.position).toBe(900)
		expect(isScrollSpringAtRest(state, 900)).toBe(true)
	})
})
