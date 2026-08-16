import { describe, expect, it } from "vitest"

import {
	affineTransform,
	conicAffine,
	halfPlanePath,
	IDENTITY_AFFINE,
	IDENTITY_QUAT,
	inPlaneSpin,
	projectConic,
	type Quat,
	quatFromAxisAngle,
	quatFromEuler,
	quatMultiply,
	rotateVec3,
	toRadians,
	type Vec2,
	viewDepthRow,
} from "@workspace/ui/components/bot-avatar-3d"
import {
	ANIMALS,
	type BotAvatarAnimal,
	type BotAvatarAnimalDefinition,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	botAvatarSilhouette,
	flattenPath,
	nearestOutlinePoint,
	outlineBounds,
	warpedOutline,
	weldToSilhouette,
} from "@workspace/ui/components/bot-avatar-silhouette"

const ORIGIN: [number, number, number] = [0, 0, 0]
const ANIMAL_NAMES = Object.keys(ANIMALS) as BotAvatarAnimal[]
const SWEEP = [-60, -40, -20, -8, 0, 8, 20, 40, 60]
const WELD_TOLERANCE = 1e-9
const VIEW_AXIS: [number, number, number] = [0, 0, 1]

const definitionOf = (name: BotAvatarAnimal) =>
	ANIMALS[name] as BotAvatarAnimalDefinition

const headAffine = (
	surface: ReturnType<typeof botAvatarSilhouette>,
	rotation: Quat,
	perspective: number,
) =>
	conicAffine({
		restRadii: [surface.radii[0], surface.radii[1]],
		current: projectConic({
			radii: surface.radii,
			rotation,
			center: ORIGIN,
			perspective,
		}),
		spin: inPlaneSpin(rotation),
	})

const distanceToOutline = (outline: Vec2[], target: Vec2) =>
	Math.hypot(
		target[0] - nearestOutlinePoint({ points: outline, target })[0],
		target[1] - nearestOutlinePoint({ points: outline, target })[1],
	)

type WeldCase = {
	animal: BotAvatarAnimal
	yaw: number
	pitch: number
	roll: number
	perspective: number
}

const weldGap = ({ animal, yaw, pitch, roll, perspective }: WeldCase) => {
	const definition = definitionOf(animal)
	const surface = botAvatarSilhouette(definition)
	const rotation = quatFromEuler({
		yaw: toRadians(yaw),
		pitch: toRadians(pitch),
		roll: toRadians(roll),
	})
	const affine = headAffine(surface, rotation, perspective)
	const outline = warpedOutline(surface, affine)
	return surface.attachments.map((attach) =>
		distanceToOutline(outline, weldToSilhouette({ surface, attach, affine })),
	)
}

describe("path flattening", () => {
	it("samples every animal head into a closed polygon", () => {
		for (const name of ANIMAL_NAMES) {
			const points = flattenPath(definitionOf(name).head)
			expect(points.length).toBeGreaterThan(64)
			expect(Math.hypot(...points[0])).toBeGreaterThan(0)
		}
	})

	it("stays inside the control polygon of a single curve", () => {
		const points = flattenPath("M0,0 C0,100 100,100 100,0")
		for (const [x, y] of points) {
			expect(x).toBeGreaterThanOrEqual(-1e-9)
			expect(x).toBeLessThanOrEqual(100 + 1e-9)
			expect(y).toBeGreaterThanOrEqual(-1e-9)
			expect(y).toBeLessThanOrEqual(100 + 1e-9)
		}
	})
})

describe("head volume fit", () => {
	it("touches the drawn outline on all four sides", () => {
		for (const name of ANIMAL_NAMES) {
			const surface = botAvatarSilhouette(definitionOf(name))
			const { center, extent } = outlineBounds(surface.outline)
			expect(center[0]).toBeCloseTo(surface.center[0], 9)
			expect(center[1]).toBeCloseTo(surface.center[1], 9)
			expect(surface.radii[0]).toBeCloseTo(extent[0], 9)
			expect(surface.radii[1]).toBeCloseTo(extent[1], 9)
		}
	})

	it("never lets the drawn outline escape the fitted volume", () => {
		for (const name of ANIMAL_NAMES) {
			const surface = botAvatarSilhouette(definitionOf(name))
			for (const [x, y] of surface.outline) {
				expect(Math.abs(x - surface.center[0])).toBeLessThanOrEqual(
					surface.radii[0] + 1e-9,
				)
				expect(Math.abs(y - surface.center[1])).toBeLessThanOrEqual(
					surface.radii[1] + 1e-9,
				)
			}
		}
	})

	it("tightens the volume the control-point heuristic left loose", () => {
		expect(botAvatarSilhouette(ANIMALS.cat).radii[0]).toBeLessThan(74)
		expect(botAvatarSilhouette(ANIMALS.dog).radii[0]).toBeLessThan(55)
		expect(botAvatarSilhouette(ANIMALS.mouse).radii[0]).toBeLessThan(53)
		expect(botAvatarSilhouette(ANIMALS.koala).radii[0]).toBeLessThan(65)
	})
})

describe("ear attachment", () => {
	it("resolves every ear anchor onto the drawn head outline at rest", () => {
		for (const name of ANIMAL_NAMES) {
			const surface = botAvatarSilhouette(definitionOf(name))
			for (const attach of surface.attachments) {
				const point: Vec2 = [
					surface.center[0] + attach[0],
					surface.center[1] + attach[1],
				]
				expect(distanceToOutline(surface.outline, point)).toBeLessThan(1e-9)
			}
		}
	})

	it("welds the ear base to the rendered silhouette across a yaw sweep", () => {
		for (const animal of ANIMAL_NAMES) {
			for (const yaw of SWEEP) {
				for (const gap of weldGap({
					animal,
					yaw,
					pitch: 0,
					roll: 0,
					perspective: 0.55,
				})) {
					expect(gap).toBeLessThan(WELD_TOLERANCE)
				}
			}
		}
	})

	it("welds the ear base to the rendered silhouette across a pitch sweep", () => {
		for (const animal of ANIMAL_NAMES) {
			for (const pitch of SWEEP) {
				for (const gap of weldGap({
					animal,
					yaw: 0,
					pitch,
					roll: 0,
					perspective: 0.55,
				})) {
					expect(gap).toBeLessThan(WELD_TOLERANCE)
				}
			}
		}
	})

	it("holds the weld under combined roll and full perspective", () => {
		for (const animal of ANIMAL_NAMES) {
			for (const roll of SWEEP) {
				for (const gap of weldGap({
					animal,
					yaw: 37,
					pitch: -21,
					roll,
					perspective: 1,
				})) {
					expect(gap).toBeLessThan(WELD_TOLERANCE)
				}
			}
		}
	})

	it("emits a neutral ear warp at rest so the authored pose is untouched", () => {
		for (const animal of ANIMAL_NAMES) {
			const definition = definitionOf(animal)
			const surface = botAvatarSilhouette(definition)
			const affine = headAffine(surface, IDENTITY_QUAT, 0)
			surface.attachments.forEach((attach, index) => {
				const attachRest: Vec2 = [
					surface.center[0] + attach[0],
					surface.center[1] + attach[1],
				]
				const ear = definition.ears[index]
				const transform = affineTransform({
					affine: conicAffine({
						restRadii: [ear.volume.radii[0], ear.volume.radii[1]],
						current: projectConic({
							radii: ear.volume.radii,
							rotation: IDENTITY_QUAT,
							center: ORIGIN,
							perspective: 0,
						}),
						spin: inPlaneSpin(IDENTITY_QUAT),
					}),
					restPivot: attachRest,
					pivot: weldToSilhouette({ surface, attach, affine }),
				})
				expect(transform).toContain("rotate(0) scale(1 1)")
				expect(transform).toBe(
					affineTransform({
						affine: IDENTITY_AFFINE,
						restPivot: attachRest,
						pivot: attachRest,
					}),
				)
			})
		}
	})

	it("carries the anchor with the head through the same arc as the skull", () => {
		const surface = botAvatarSilhouette(ANIMALS.cat)
		const rotation = quatFromEuler({ yaw: toRadians(50), pitch: 0, roll: 0 })
		const affine = headAffine(surface, rotation, 0)
		const attach = surface.attachments[0]
		const weld = weldToSilhouette({ surface, attach, affine })
		expect(affine.spin).toBeCloseTo(0, 9)
		expect(weld[1]).toBeCloseTo(surface.center[1] + attach[1], 9)
		expect(Math.abs(weld[0] - surface.center[0])).toBeLessThan(
			Math.abs(attach[0]),
		)
	})

	it("rolls the anchor with the head when the head rolls", () => {
		const surface = botAvatarSilhouette(ANIMALS.cat)
		const roll = toRadians(30)
		const affine = headAffine(
			surface,
			quatFromEuler({ yaw: 0, pitch: 0, roll }),
			0,
		)
		const attach = surface.attachments[0]
		const weld = weldToSilhouette({ surface, attach, affine })
		expect(affine.spin).toBeCloseTo(roll, 9)
		expect(weld[0] - surface.center[0]).toBeCloseTo(
			attach[0] * Math.cos(roll) - attach[1] * Math.sin(roll),
			6,
		)
	})
})

describe("ear depth split", () => {
	const splitFor = (yaw: number) => {
		const definition = definitionOf("cat")
		const surface = botAvatarSilhouette(definition)
		const ear = definition.ears[0]
		const rotation = quatFromEuler({ yaw: toRadians(yaw), pitch: 0, roll: 0 })
		const hinged = quatMultiply(rotation, quatFromAxisAngle(VIEW_AXIS, 0))
		const anchor = rotateVec3(rotation, [
			ear.volume.center[0] - surface.center[0],
			ear.volume.center[1] - surface.center[1],
			ear.depth,
		])
		const row = viewDepthRow(hinged)
		return halfPlanePath({
			normal: [row[0], row[1]],
			offset:
				anchor[2] -
				row[0] * ear.volume.center[0] -
				row[1] * ear.volume.center[1],
		})
	}

	it("keeps the whole ear plate behind the head when facing forward", () => {
		expect(splitFor(0)).toBe("")
	})

	it("brings part of the near ear plate in front once the head turns", () => {
		expect(splitFor(55).startsWith("M")).toBe(true)
	})
})
