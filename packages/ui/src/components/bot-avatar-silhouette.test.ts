import { describe, expect, it } from "vitest"

import {
	AXIS_Z,
	affineTransform,
	applySurfaceAffine,
	conicAffine,
	earSplitPath,
	IDENTITY_AFFINE,
	IDENTITY_QUAT,
	inPlaneSpin,
	ORIGIN,
	projectConic,
	quatFromAxisAngle,
	quatFromEuler,
	quatMultiply,
	rotateVec3,
	type SurfaceAffine,
	toRadians,
	type Vec2,
} from "@workspace/ui/components/bot-avatar-3d"
import {
	ANIMALS,
	type BotAvatarAnimal,
	type BotAvatarAnimalDefinition,
	type BotAvatarEar,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	type BotAvatarSilhouette,
	botAvatarSilhouette,
	flattenPath,
	headSurfaceAffine,
	nearestOutlinePoint,
	outlineBounds,
	weldToSilhouette,
} from "@workspace/ui/components/bot-avatar-silhouette"

const ANIMAL_NAMES = Object.keys(ANIMALS) as BotAvatarAnimal[]
const SWEEP = [-60, -40, -20, -8, 0, 8, 20, 40, 60]
const WELD_TOLERANCE = 1e-9

const definitionOf = (name: BotAvatarAnimal) =>
	ANIMALS[name] as BotAvatarAnimalDefinition

const warpedOutline = (
	surface: BotAvatarSilhouette,
	affine: SurfaceAffine,
): Vec2[] => {
	const [cx, cy] = surface.center
	return surface.outline.map((point) => {
		const warped = applySurfaceAffine(affine, [point[0] - cx, point[1] - cy])
		return [cx + warped[0], cy + warped[1]]
	})
}

const controlPoints = (d: string): Vec2[] => {
	const values = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
	const points: Vec2[] = []
	for (let at = 0; at + 1 < values.length; at += 2) {
		points.push([values[at], values[at + 1]])
	}
	return points
}

const drawnEarPoints = (ear: BotAvatarEar): Vec2[] =>
	ear.shapes.flatMap((shape): Vec2[] => {
		if (shape.kind === "path") return flattenPath(shape.d)
		const rx = shape.kind === "circle" ? shape.r : shape.rx
		const ry = shape.kind === "circle" ? shape.r : shape.ry
		return [
			[shape.cx - rx, shape.cy - ry],
			[shape.cx + rx, shape.cy + ry],
		]
	})

const distanceToOutline = (outline: Vec2[], target: Vec2) => {
	const nearest = nearestOutlinePoint({ points: outline, target })
	return Math.hypot(target[0] - nearest[0], target[1] - nearest[1])
}

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
	const affine = headSurfaceAffine({ surface, rotation, perspective })
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

	it("never exceeds the control-point bound, and beats it where the curve bends inside its hull", () => {
		let tighterAnimals = 0
		for (const name of ANIMAL_NAMES) {
			const animal = definitionOf(name)
			const surface = botAvatarSilhouette(animal)
			const hull = outlineBounds(controlPoints(animal.head))
			expect(surface.radii[0]).toBeLessThanOrEqual(hull.extent[0] + 1e-9)
			expect(surface.radii[1]).toBeLessThanOrEqual(hull.extent[1] + 1e-9)
			if (
				surface.radii[0] < hull.extent[0] - 1e-9 ||
				surface.radii[1] < hull.extent[1] - 1e-9
			) {
				tighterAnimals += 1
			}
		}
		expect(tighterAnimals).toBeGreaterThan(0)
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
			const affine = headSurfaceAffine({
				surface,
				rotation: IDENTITY_QUAT,
				perspective: 0,
			})
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
		const affine = headSurfaceAffine({ surface, rotation, perspective: 0 })
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
		const affine = headSurfaceAffine({
			surface,
			rotation: quatFromEuler({ yaw: 0, pitch: 0, roll }),
			perspective: 0,
		})
		const attach = surface.attachments[0]
		const weld = weldToSilhouette({ surface, attach, affine })
		expect(affine.spin).toBeCloseTo(roll, 9)
		expect(weld[0] - surface.center[0]).toBeCloseTo(
			attach[0] * Math.cos(roll) - attach[1] * Math.sin(roll),
			6,
		)
	})
})

describe("ear volume authoring", () => {
	const EAR_VOLUME_TOLERANCE = 3

	it("keeps every authored ear volume on top of the shapes it is drawn from", () => {
		for (const name of ANIMAL_NAMES) {
			for (const ear of definitionOf(name).ears) {
				const drawn = outlineBounds(drawnEarPoints(ear))
				expect(Math.abs(ear.volume.center[0] - drawn.center[0])).toBeLessThan(
					EAR_VOLUME_TOLERANCE,
				)
				expect(Math.abs(ear.volume.center[1] - drawn.center[1])).toBeLessThan(
					EAR_VOLUME_TOLERANCE,
				)
				expect(Math.abs(ear.volume.radii[0] - drawn.extent[0])).toBeLessThan(
					EAR_VOLUME_TOLERANCE,
				)
				expect(Math.abs(ear.volume.radii[1] - drawn.extent[1])).toBeLessThan(
					EAR_VOLUME_TOLERANCE,
				)
			}
		}
	})
})

describe("ear depth split", () => {
	const splitFor = (yaw: number) => {
		const definition = definitionOf("cat")
		const surface = botAvatarSilhouette(definition)
		const ear = definition.ears[0]
		const rotation = quatFromEuler({ yaw: toRadians(yaw), pitch: 0, roll: 0 })
		const hinged = quatMultiply(rotation, quatFromAxisAngle(AXIS_Z, 0))
		const anchor = rotateVec3(rotation, [
			ear.volume.center[0] - surface.center[0],
			ear.volume.center[1] - surface.center[1],
			ear.depth,
		])
		return earSplitPath({
			rotation: hinged,
			plateCenter: ear.volume.center,
			depth: anchor[2],
		})
	}

	it("keeps the whole ear plate behind the head when facing forward", () => {
		expect(splitFor(0)).toBe("")
	})

	it("brings part of the near ear plate in front once the head turns", () => {
		expect(splitFor(55).startsWith("M")).toBe(true)
	})
})
