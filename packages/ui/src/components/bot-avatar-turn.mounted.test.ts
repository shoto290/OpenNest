// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	ANIMALS,
	type BotAvatarAnimalDefinition,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	BotAvatarEngine,
	PARTS,
} from "@workspace/ui/components/bot-avatar-engine"
import { GAZE_YAW_LIMIT } from "@workspace/ui/components/bot-avatar-gaze"

const earMarkup = (count: number) =>
	Array.from(
		{ length: count },
		(_, index) =>
			`<g data-part="${PARTS.ear(index, "back")}"></g><g data-part="${PARTS.ear(index, "front")}"></g>`,
	).join("")

const extraMarkup = (count: number) =>
	Array.from(
		{ length: count },
		(_, index) => `<g data-part="${PARTS.extra(index)}"></g>`,
	).join("")

const rigMarkup = (animal: BotAvatarAnimalDefinition) => `
<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
	<g data-part="${PARTS.rig}">
		<g data-part="${PARTS.head}"></g>
		${extraMarkup(animal.extras.length)}
		${earMarkup(animal.ears.length)}
		<path data-part="${PARTS.eye0}"></path>
		<path data-part="${PARTS.eye1}"></path>
		<g data-part="${PARTS.blush}"><ellipse></ellipse><ellipse></ellipse></g>
	</g>
</svg>
`

const TURNED_YAW = 40
const SETTLE_MS = 2000
const GAZE_TURN_FRAMES = 90
const FRAME_MS = 16
const GAZE_LEFT = { yaw: -GAZE_YAW_LIMIT, pitch: 0 }
const GAZE_RIGHT = { yaw: GAZE_YAW_LIMIT, pitch: 0 }
const DRAG_FLOOR = 1
const RETURN_BAND = 0.5
const EAR_ARRIVAL = 500
const EVEN_DRAW = 0.5
const INSIDE_TURN_MS = 40
const HALFWAY_TURN_MS = 400
const AFTER_TURN_MS = 1500
const TURNING_STATE = "listening"

const mountRig = (animal: BotAvatarAnimalDefinition) => {
	document.body.innerHTML = rigMarkup(animal)
	const svg = document.querySelector("svg") as unknown as SVGSVGElement
	const engine = new BotAvatarEngine(animal)
	engine.bind(svg)
	engine.setState(TURNING_STATE)
	return { engine, svg }
}

const transformOf = (svg: SVGSVGElement, part: string) =>
	svg.querySelector(`[data-part="${part}"]`)?.getAttribute("transform") ?? ""

const spinOf = (transform: string) =>
	Number(transform.match(/rotate\((-?\d*\.?\d+)/)?.[1] ?? Number.NaN)

const scaleOf = (transform: string) =>
	Number(transform.match(/scale\((-?\d*\.?\d+)/)?.[1] ?? Number.NaN)

const earSpin = (svg: SVGSVGElement, index: number) =>
	spinOf(transformOf(svg, PARTS.ear(index, "front")))

const eyeReach = (svg: SVGSVGElement) => {
	const pairs =
		svg.querySelector(`[data-part="${PARTS.eye0}"]`)?.getAttribute("d") ?? ""
	const columns = (pairs.match(/-?\d*\.?\d+ -?\d*\.?\d+/g) ?? []).map((pair) =>
		Number(pair.split(" ")[0]),
	)
	return columns.reduce((sum, x) => sum + x, 0) / columns.length
}

const blushReach = (svg: SVGSVGElement) =>
	Number(
		svg
			.querySelector(`[data-part="${PARTS.blush}"] ellipse`)
			?.getAttribute("cx") ?? Number.NaN,
	)

const mountGazePair = () => {
	document.body.innerHTML = `${rigMarkup(ANIMALS.rabbit)}${rigMarkup(ANIMALS.rabbit)}`
	const rigs = Array.from(
		document.querySelectorAll("svg"),
	) as unknown as SVGSVGElement[]
	const engines = rigs.map((rig) => {
		const engine = new BotAvatarEngine(ANIMALS.rabbit)
		engine.bind(rig)
		engine.setState(TURNING_STATE)
		engine.setGaze(GAZE_LEFT)
		engine.start()
		return engine
	})
	return { rigs, engines }
}

const staticFrame = (
	animal: BotAvatarAnimalDefinition,
	yaw: number | undefined,
) => {
	const { engine, svg } = mountRig(animal)
	engine.setOrientation({ yaw, pitch: 0, roll: 0 })
	engine.renderStatic()
	return svg
}

describe("the ears on a turning head", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		document.body.innerHTML = ""
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("trails the turn and comes back to rest after it", () => {
		const { engine, svg } = mountRig(ANIMALS.rabbit)
		engine.start()
		vi.advanceTimersByTime(SETTLE_MS)
		const restingSpin = earSpin(svg, 0)

		engine.setOrientation({ yaw: TURNED_YAW, pitch: 0, roll: 0 })
		vi.advanceTimersByTime(INSIDE_TURN_MS)
		const draggedSpin = earSpin(svg, 0)

		vi.advanceTimersByTime(HALFWAY_TURN_MS - INSIDE_TURN_MS)
		const halfwaySpin = earSpin(svg, 0)

		vi.advanceTimersByTime(AFTER_TURN_MS)
		const settledSpin = earSpin(svg, 0)
		engine.stop()

		expect(draggedSpin).toBeLessThan(restingSpin)
		expect(Math.abs(halfwaySpin - settledSpin)).toBeLessThan(
			Math.abs(draggedSpin - settledSpin),
		)
	})

	it("swings past its settled twist and back when the gaze turns the head", () => {
		vi.spyOn(Math, "random").mockReturnValue(EVEN_DRAW)
		const { rigs, engines } = mountGazePair()
		vi.advanceTimersByTime(SETTLE_MS)

		engines[0].setGaze(GAZE_RIGHT)
		const swing: number[] = []
		for (let frame = 0; frame < GAZE_TURN_FRAMES; frame += 1) {
			vi.advanceTimersByTime(FRAME_MS)
			swing.push(earSpin(rigs[0], 0) - earSpin(rigs[1], 0))
		}

		vi.advanceTimersByTime(SETTLE_MS)
		const settled = earSpin(rigs[0], 0) - earSpin(rigs[1], 0)
		for (const engine of engines) engine.stop()

		const dragged = Math.min(...swing)
		const after = swing.slice(swing.indexOf(dragged))
		const lastOutside = swing.reduce(
			(latest, twist, frame) =>
				Math.abs(twist - settled) > RETURN_BAND ? frame : latest,
			-1,
		)

		expect(dragged).toBeLessThan(settled - DRAG_FLOOR)
		expect(Math.max(...after)).toBeGreaterThan(settled)
		expect((lastOutside + 1) * FRAME_MS).toBeLessThanOrEqual(EAR_ARRIVAL)
	})

	it("displaces the near ear and the far ear by different amounts", () => {
		const svg = staticFrame(ANIMALS.rabbit, TURNED_YAW)
		const near = scaleOf(transformOf(svg, PARTS.ear(1, "front")))
		const far = scaleOf(transformOf(svg, PARTS.ear(0, "front")))

		expect(near).not.toBe(far)
	})
})

describe("the parts carried at their own depth", () => {
	afterEach(() => {
		document.body.innerHTML = ""
	})

	it("turns the extras group away from the head outline transform", () => {
		const turned = staticFrame(ANIMALS.owl, TURNED_YAW)

		expect(transformOf(turned, PARTS.extra(0))).not.toBe(
			transformOf(turned, PARTS.head),
		)
		expect(scaleOf(transformOf(turned, PARTS.extra(0)))).toBeLessThan(
			scaleOf(transformOf(turned, PARTS.head)),
		)
	})

	it("leaves the extras group as drawn while the head faces front", () => {
		const facing = staticFrame(ANIMALS.owl, 0)

		expect(scaleOf(transformOf(facing, PARTS.extra(0)))).toBe(1)
		expect(spinOf(transformOf(facing, PARTS.extra(0)))).toBe(0)
	})

	it("displaces the blush across a head turn by less than the eyes", () => {
		const facing = staticFrame(ANIMALS.rabbit, 0)
		const restingEye = eyeReach(facing)
		const restingBlush = blushReach(facing)

		const turned = staticFrame(ANIMALS.rabbit, TURNED_YAW)
		const eyeTravel = Math.abs(eyeReach(turned) - restingEye)
		const blushTravel = Math.abs(blushReach(turned) - restingBlush)

		expect(eyeTravel).toBeGreaterThan(0)
		expect(blushTravel).toBeGreaterThan(0)
		expect(blushTravel).toBeLessThan(eyeTravel)
	})
})
