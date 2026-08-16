import { describe, expect, it } from "vitest"

import {
	conicAffine,
	ellipseToPath,
	faceToSurface,
	IDENTITY_QUAT,
	inPlaneSpin,
	isFrontFacing,
	project,
	projectConic,
	projectEllipsoid,
	type Quat,
	quatFromEuler,
	rotateVec3,
	toDegrees,
	toRadians,
	type Vec3,
	visibleRuns,
	wireframePath,
} from "@workspace/ui/components/bot-avatar-3d"

const HEAD_RADII: Vec3 = [74, 70, 66]

const conjugate = ([w, x, y, z]: Quat): Quat => [w, -x, -y, -z]

const insideness = (
	ellipse: ReturnType<typeof projectEllipsoid>,
	point: [number, number],
) => {
	const dx = point[0] - ellipse.cx
	const dy = point[1] - ellipse.cy
	const cos = Math.cos(ellipse.angle)
	const sin = Math.sin(ellipse.angle)
	const u = (dx * cos + dy * sin) / ellipse.major
	const v = (-dx * sin + dy * cos) / ellipse.minor
	return u * u + v * v
}

describe("quaternions", () => {
	it("leaves a point untouched at identity", () => {
		const point: Vec3 = [3, -4, 5]
		expect(rotateVec3(IDENTITY_QUAT, point)).toEqual(point)
	})

	it("round-trips a point through a rotation and its conjugate", () => {
		const rotation = quatFromEuler({
			yaw: toRadians(31),
			pitch: toRadians(-17),
			roll: toRadians(9),
		})
		const point: Vec3 = [12, -8, 40]
		const restored = rotateVec3(
			conjugate(rotation),
			rotateVec3(rotation, point),
		)
		restored.forEach((value, index) => {
			expect(value).toBeCloseTo(point[index], 6)
		})
	})

	it("turns the front of the head toward the viewer's right on positive yaw", () => {
		const rotation = quatFromEuler({
			yaw: Math.PI / 2,
			pitch: 0,
			roll: 0,
		})
		const [x, y, z] = rotateVec3(rotation, [0, 0, 66])
		expect(x).toBeCloseTo(66, 6)
		expect(y).toBeCloseTo(0, 6)
		expect(z).toBeCloseTo(0, 6)
	})
})

describe("projection", () => {
	it("is the identity without perspective", () => {
		expect(project({ point: [11, -22, 60], perspective: 0 })).toEqual([11, -22])
	})

	it("enlarges what is closer to the viewer", () => {
		const near = project({ point: [10, 0, 60], perspective: 1 })
		const far = project({ point: [10, 0, -60], perspective: 1 })
		expect(near[0]).toBeGreaterThan(10)
		expect(far[0]).toBeLessThan(10)
	})
})

describe("face mapping", () => {
	it("puts the face origin on the front pole", () => {
		const { point, normal } = faceToSurface({
			radii: HEAD_RADII,
			face: [0, 0],
		})
		expect(point).toEqual([0, 0, 66])
		expect(normal).toEqual([0, 0, 1])
	})

	it("reaches the silhouette at a quarter turn of longitude", () => {
		const { point } = faceToSurface({
			radii: HEAD_RADII,
			face: [(HEAD_RADII[0] * Math.PI) / 2, 0],
		})
		expect(point[0]).toBeCloseTo(74, 6)
		expect(point[2]).toBeCloseTo(0, 6)
	})

	it("wraps a feature away once it passes the silhouette", () => {
		const { normal } = faceToSurface({
			radii: HEAD_RADII,
			face: [HEAD_RADII[0] * Math.PI * 0.51, 0],
		})
		expect(isFrontFacing(normal)).toBe(false)
	})

	it("keeps a feature front facing while it stays on the near sheet", () => {
		const { normal } = faceToSurface({ radii: HEAD_RADII, face: [30, 12] })
		expect(isFrontFacing(normal)).toBe(true)
	})
})

describe("visible runs", () => {
	it("returns a single run when everything faces the viewer", () => {
		const runs = visibleRuns({ visible: [true, true, true], closed: true })
		expect(runs).toEqual([[0, 1, 2]])
	})

	it("returns nothing when the whole feature wrapped away", () => {
		expect(visibleRuns({ visible: [false, false], closed: true })).toEqual([])
	})

	it("splits an open polyline on every hidden sample", () => {
		const runs = visibleRuns({
			visible: [true, false, true, true, false],
			closed: false,
		})
		expect(runs).toEqual([[0], [2, 3]])
	})

	it("joins the wrapping run of a closed ring", () => {
		const runs = visibleRuns({
			visible: [true, true, false, true],
			closed: true,
		})
		expect(runs).toEqual([[3, 0, 1]])
	})
})

describe("ellipsoid projection", () => {
	it("matches the authored radii at rest", () => {
		const ellipse = projectEllipsoid({
			radii: HEAD_RADII,
			rotation: IDENTITY_QUAT,
			center: [0, 0, 0],
			perspective: 0,
		})
		expect(ellipse.major).toBeCloseTo(74, 6)
		expect(ellipse.minor).toBeCloseTo(70, 6)
		expect(ellipse.angle).toBeCloseTo(0, 6)
	})

	it("narrows the silhouette under yaw when the head is shallower than it is wide", () => {
		const ellipse = projectEllipsoid({
			radii: [74, 70, 40],
			rotation: quatFromEuler({ yaw: toRadians(60), pitch: 0, roll: 0 }),
			center: [0, 0, 0],
			perspective: 0,
		})
		expect(ellipse.minor).toBeLessThan(74)
		expect(ellipse.major).toBeCloseTo(70, 6)
	})

	it("bounds a sampled hull of the rotated ellipsoid", () => {
		const rotation = quatFromEuler({
			yaw: toRadians(37),
			pitch: toRadians(21),
			roll: toRadians(-13),
		})
		const ellipse = projectEllipsoid({
			radii: HEAD_RADII,
			rotation,
			center: [0, 0, 0],
			perspective: 0,
		})
		let peak = 0
		for (let i = 0; i <= 120; i += 1) {
			for (let j = 0; j <= 120; j += 1) {
				const latitude = -Math.PI / 2 + (Math.PI * i) / 120
				const longitude = -Math.PI + (2 * Math.PI * j) / 120
				const surface: Vec3 = [
					HEAD_RADII[0] * Math.cos(latitude) * Math.sin(longitude),
					HEAD_RADII[1] * Math.sin(latitude),
					HEAD_RADII[2] * Math.cos(latitude) * Math.cos(longitude),
				]
				const projected = project({
					point: rotateVec3(rotation, surface),
					perspective: 0,
				})
				peak = Math.max(peak, insideness(ellipse, projected))
			}
		}
		expect(peak).toBeLessThanOrEqual(1.0001)
		expect(peak).toBeGreaterThan(0.999)
	})

	it("scales with the perspective blend", () => {
		const flat = projectEllipsoid({
			radii: HEAD_RADII,
			rotation: IDENTITY_QUAT,
			center: [0, 0, 40],
			perspective: 0,
		})
		const deep = projectEllipsoid({
			radii: HEAD_RADII,
			rotation: IDENTITY_QUAT,
			center: [0, 0, 40],
			perspective: 1,
		})
		expect(deep.major).toBeGreaterThan(flat.major)
	})
})

describe("svg emission", () => {
	it("writes an ellipse as two arcs", () => {
		const path = ellipseToPath({
			cx: 10,
			cy: 20,
			major: 30,
			minor: 15,
			angle: 0,
		})
		expect(path).toBe("M-20 20A30 15 0 0 1 40 20A30 15 0 0 1 -20 20Z")
	})

	it("collapses to a neutral warp when nothing moved", () => {
		const affine = conicAffine({
			restRadii: [HEAD_RADII[0], HEAD_RADII[1]],
			current: projectConic({
				radii: HEAD_RADII,
				rotation: IDENTITY_QUAT,
				center: [0, 0, 0],
				perspective: 0,
			}),
			spin: inPlaneSpin(IDENTITY_QUAT),
		})
		expect(affine.spin).toBeCloseTo(0, 9)
		expect(affine.sx).toBeCloseTo(1, 9)
		expect(affine.sy).toBeCloseTo(1, 9)
	})

	it("turns the drawing by the roll and nothing else", () => {
		const roll = toRadians(18)
		const rotation = quatFromEuler({ yaw: 0, pitch: 0, roll })
		const affine = conicAffine({
			restRadii: [HEAD_RADII[0], HEAD_RADII[1]],
			current: projectConic({
				radii: HEAD_RADII,
				rotation,
				center: [0, 0, 0],
				perspective: 0,
			}),
			spin: inPlaneSpin(rotation),
		})
		expect(toDegrees(affine.spin)).toBeCloseTo(18, 6)
		expect(affine.sx).toBeCloseTo(1, 6)
		expect(affine.sy).toBeCloseTo(1, 6)
	})

	it("never spins a near spherical head that only yaws or pitches", () => {
		const radii: Vec3 = [70.9, 70, 68]
		for (let yaw = -60; yaw <= 60; yaw += 4) {
			for (let pitch = -40; pitch <= 40; pitch += 4) {
				const rotation = quatFromEuler({
					yaw: toRadians(yaw),
					pitch: toRadians(pitch),
					roll: 0,
				})
				const affine = conicAffine({
					restRadii: [radii[0], radii[1]],
					current: projectConic({
						radii,
						rotation,
						center: [0, 0, 0],
						perspective: 0,
					}),
					spin: inPlaneSpin(rotation),
				})
				expect(Math.abs(toDegrees(affine.spin))).toBeLessThan(1e-9)
				expect(affine.sx).toBeGreaterThan(0.94)
				expect(affine.sx).toBeLessThan(1.01)
				expect(affine.sy).toBeGreaterThan(0.94)
				expect(affine.sy).toBeLessThan(1.01)
			}
		}
	})

	it("narrows the drawing along the axis the head turns about", () => {
		const radii: Vec3 = [70.9, 70, 40]
		const rotation = quatFromEuler({ yaw: toRadians(50), pitch: 0, roll: 0 })
		const affine = conicAffine({
			restRadii: [radii[0], radii[1]],
			current: projectConic({
				radii,
				rotation,
				center: [0, 0, 0],
				perspective: 0,
			}),
			spin: inPlaneSpin(rotation),
		})
		expect(affine.sx).toBeLessThan(0.85)
		expect(affine.sy).toBeCloseTo(1, 9)
	})

	it("draws only the near sheet of the wireframe", () => {
		const path = wireframePath({
			radii: HEAD_RADII,
			rotation: IDENTITY_QUAT,
			perspective: 0,
			parallels: 4,
			meridians: 4,
			samples: 24,
		})
		expect(path.startsWith("M")).toBe(true)
		expect(path.split("M").length).toBeGreaterThan(4)
	})
})
