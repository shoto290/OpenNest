export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

export type EulerAngles = { yaw: number; pitch: number; roll: number }

type ProjectedEllipse = {
	cx: number
	cy: number
	major: number
	minor: number
	angle: number
}

type SurfacePoint = { point: Vec3; normal: Vec3 }

export const ORIGIN: Vec3 = [0, 0, 0]
export const AXIS_Z: Vec3 = [0, 0, 1]

export const VIEW_BOX = 240
export const FOCAL_LENGTH = 420
const NEAR_PLANE_LIMIT = 0.8
const AXIS_X: Vec3 = [1, 0, 0]
const AXIS_Y: Vec3 = [0, 1, 0]
const UNIT_AXES: Vec3[] = [AXIS_X, AXIS_Y, AXIS_Z]

export const IDENTITY_QUAT: Quat = [1, 0, 0, 0]

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export const toDegrees = (radians: number) => (radians * 180) / Math.PI

export const round2 = (value: number) => Math.round(value * 100) / 100

export const quantize = (value: number, step: number) =>
	Math.round(value / step) * step

export const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value))

export const quatFromAxisAngle = (axis: Vec3, angle: number): Quat => {
	const half = angle / 2
	const sin = Math.sin(half)
	return [Math.cos(half), axis[0] * sin, axis[1] * sin, axis[2] * sin]
}

export const quatMultiply = (a: Quat, b: Quat): Quat => [
	a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
	a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
	a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
	a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]

export const quatFromEuler = ({ yaw, pitch, roll }: EulerAngles): Quat =>
	quatMultiply(
		quatFromAxisAngle(AXIS_Z, roll),
		quatMultiply(
			quatFromAxisAngle(AXIS_X, pitch),
			quatFromAxisAngle(AXIS_Y, yaw),
		),
	)

export const rotateVec3 = (rotation: Quat, v: Vec3): Vec3 => {
	const [w, qx, qy, qz] = rotation
	const tx = 2 * (qy * v[2] - qz * v[1])
	const ty = 2 * (qz * v[0] - qx * v[2])
	const tz = 2 * (qx * v[1] - qy * v[0])
	return [
		v[0] + w * tx + qy * tz - qz * ty,
		v[1] + w * ty + qz * tx - qx * tz,
		v[2] + w * tz + qx * ty - qy * tx,
	]
}

export const rotatedZ = (rotation: Quat, v: Vec3) => {
	const [w, qx, qy, qz] = rotation
	const tx = 2 * (qy * v[2] - qz * v[1])
	const ty = 2 * (qz * v[0] - qx * v[2])
	const tz = 2 * (qx * v[1] - qy * v[0])
	return v[2] + w * tz + qx * ty - qy * tx
}

const normalize = (v: Vec3): Vec3 => {
	const length = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / length, v[1] / length, v[2] / length]
}

type DepthScale = { depth: number; perspective: number }

const perspectiveScale = ({ depth, perspective }: DepthScale) => {
	if (perspective <= 0) return 1
	const near = Math.min(depth, FOCAL_LENGTH * NEAR_PLANE_LIMIT)
	return 1 + perspective * (FOCAL_LENGTH / (FOCAL_LENGTH - near) - 1)
}

type Projection = { point: Vec3; perspective: number }

export const project = ({ point, perspective }: Projection): Vec2 => {
	const scale = perspectiveScale({ depth: point[2], perspective })
	return [point[0] * scale, point[1] * scale]
}

type FaceMapping = { radii: Vec3; face: Vec2 }

export const faceToSurface = ({ radii, face }: FaceMapping): SurfacePoint => {
	const [rx, ry, rz] = radii
	const longitude = face[0] / rx
	const latitude = face[1] / ry
	const cosLatitude = Math.cos(latitude)
	const point: Vec3 = [
		rx * cosLatitude * Math.sin(longitude),
		ry * Math.sin(latitude),
		rz * cosLatitude * Math.cos(longitude),
	]
	return {
		point,
		normal: normalize([
			point[0] / (rx * rx),
			point[1] / (ry * ry),
			point[2] / (rz * rz),
		]),
	}
}

export const isFrontFacing = (normal: Vec3) => normal[2] > 0

export const viewDepthRow = (rotation: Quat): Vec3 => [
	rotatedZ(rotation, AXIS_X),
	rotatedZ(rotation, AXIS_Y),
	rotatedZ(rotation, AXIS_Z),
]

const CLIP_REACH = 4096
const FULL_COVER = `M${-CLIP_REACH} ${-CLIP_REACH}H${CLIP_REACH}V${CLIP_REACH}H${-CLIP_REACH}Z`

const halfPlaneCorner = (
	foot: Vec2,
	tangent: Vec2,
	unit: Vec2,
	alongTangent: number,
	alongNormal: number,
) =>
	`${round2(foot[0] + tangent[0] * alongTangent + unit[0] * alongNormal)} ${round2(foot[1] + tangent[1] * alongTangent + unit[1] * alongNormal)}`

type HalfPlane = { normal: Vec2; offset: number }

export const halfPlanePath = ({ normal, offset }: HalfPlane) => {
	const length = Math.hypot(normal[0], normal[1])
	if (length < 1e-9 || Math.abs(offset) / length > CLIP_REACH) {
		return offset > 0 ? FULL_COVER : ""
	}
	const unit: Vec2 = [normal[0] / length, normal[1] / length]
	const tangent: Vec2 = [-unit[1], unit[0]]
	const foot: Vec2 = [
		(-offset / length) * unit[0],
		(-offset / length) * unit[1],
	]
	const at = (alongTangent: number, alongNormal: number) =>
		halfPlaneCorner(foot, tangent, unit, alongTangent, alongNormal)
	return `M${at(-CLIP_REACH, 0)}L${at(CLIP_REACH, 0)}L${at(CLIP_REACH, CLIP_REACH)}L${at(-CLIP_REACH, CLIP_REACH)}Z`
}

type EarSplit = { rotation: Quat; plateCenter: Vec2; depth: number }

export const earSplitPath = ({ rotation, plateCenter, depth }: EarSplit) => {
	const row = viewDepthRow(rotation)
	return halfPlanePath({
		normal: [row[0], row[1]],
		offset: depth - row[0] * plateCenter[0] - row[1] * plateCenter[1],
	})
}

type EllipsoidProjection = {
	radii: Vec3
	rotation: Quat
	center: Vec3
	perspective: number
}

type Conic = { xx: number; xy: number; yy: number }

export const projectConic = ({
	radii,
	rotation,
	center,
	perspective,
}: EllipsoidProjection): Conic => {
	const scale = perspectiveScale({ depth: center[2], perspective })
	let xx = 0
	let xy = 0
	let yy = 0
	for (let index = 0; index < UNIT_AXES.length; index += 1) {
		const rotated = rotateVec3(rotation, UNIT_AXES[index])
		const length = radii[index] * scale
		const x = rotated[0] * length
		const y = rotated[1] * length
		xx += x * x
		xy += x * y
		yy += y * y
	}
	return { xx, xy, yy }
}

export const projectEllipsoid = (
	projection: EllipsoidProjection,
): ProjectedEllipse => {
	const { xx, xy, yy } = projectConic(projection)
	const scale = perspectiveScale({
		depth: projection.center[2],
		perspective: projection.perspective,
	})
	const half = (xx + yy) / 2
	const spread = Math.hypot((xx - yy) / 2, xy)
	return {
		cx: projection.center[0] * scale,
		cy: projection.center[1] * scale,
		major: Math.sqrt(Math.max(half + spread, 0)),
		minor: Math.sqrt(Math.max(half - spread, 0)),
		angle: 0.5 * Math.atan2(2 * xy, xx - yy),
	}
}

export const ellipseToPath = ({
	cx,
	cy,
	major,
	minor,
	angle,
}: ProjectedEllipse) => {
	const dx = round2(major * Math.cos(angle))
	const dy = round2(major * Math.sin(angle))
	const x = round2(cx)
	const y = round2(cy)
	const rx = round2(major)
	const ry = round2(minor)
	const rotation = round2(toDegrees(angle))
	const arc = `A${rx} ${ry} ${rotation} 0 1`
	return `M${x - dx} ${y - dy}${arc} ${x + dx} ${y + dy}${arc} ${x - dx} ${y - dy}Z`
}

export type SurfaceAffine = { spin: number; sx: number; sy: number }

export const IDENTITY_AFFINE: SurfaceAffine = { spin: 0, sx: 1, sy: 1 }

export const inPlaneSpin = (rotation: Quat) => {
	const up = rotateVec3(rotation, AXIS_Y)
	return Math.atan2(-up[0], up[1])
}

type ConicWarp = { restRadii: Vec2; current: Conic; spin: number }

export const conicAffine = ({
	restRadii,
	current,
	spin,
}: ConicWarp): SurfaceAffine => {
	const cos = Math.cos(spin)
	const sin = Math.sin(spin)
	const shear = 2 * current.xy * sin * cos
	const alongX = current.xx * cos * cos + shear + current.yy * sin * sin
	const alongY = current.xx * sin * sin - shear + current.yy * cos * cos
	return {
		spin,
		sx: Math.sqrt(Math.max(alongX, 0)) / (restRadii[0] || 1),
		sy: Math.sqrt(Math.max(alongY, 0)) / (restRadii[1] || 1),
	}
}

export const applySurfaceAffine = (
	{ spin, sx, sy }: SurfaceAffine,
	v: Vec2,
): Vec2 => {
	const cos = Math.cos(spin)
	const sin = Math.sin(spin)
	const x = v[0] * sx
	const y = v[1] * sy
	return [x * cos - y * sin, x * sin + y * cos]
}

type AffineWarp = { affine: SurfaceAffine; restPivot: Vec2; pivot: Vec2 }

export const affineTransform = ({ affine, restPivot, pivot }: AffineWarp) =>
	`translate(${round2(pivot[0])} ${round2(pivot[1])}) rotate(${round2(toDegrees(affine.spin))}) scale(${round2(affine.sx)} ${round2(affine.sy)}) translate(${round2(-restPivot[0])} ${round2(-restPivot[1])})`

type Visibility = { visible: boolean[]; closed: boolean }

export const visibleRuns = ({ visible, closed }: Visibility): number[][] => {
	const count = visible.length
	if (count === 0) return []
	const runs: number[][] = []
	let run: number[] = []
	const push = () => {
		if (run.length) runs.push(run)
		run = []
	}
	for (let index = 0; index < count; index += 1) {
		if (visible[index]) run.push(index)
		else push()
	}
	push()
	if (closed && runs.length > 1 && visible[0] && visible[count - 1]) {
		const last = runs.pop() as number[]
		runs[0] = [...last, ...runs[0]]
	}
	return runs
}

type SurfaceGrid = {
	radii: Vec3
	rotation: Quat
	perspective: number
	parallels: number
	meridians: number
	samples: number
}

const surfaceAt = (radii: Vec3, latitude: number, longitude: number) =>
	faceToSurface({
		radii,
		face: [longitude * radii[0], latitude * radii[1]],
	})

const lineFrom = (points: Vec2[], runs: number[][]) =>
	runs
		.filter((run) => run.length > 1)
		.map(
			(run) =>
				`M${run
					.map(
						(index) =>
							`${round2(points[index][0])} ${round2(points[index][1])}`,
					)
					.join("L")}`,
		)
		.join("")

type SurfaceArc = {
	radii: Vec3
	rotation: Quat
	perspective: number
	latitude: number | null
	longitude: number | null
	samples: number
	span: number
}

const arcPath = ({
	radii,
	rotation,
	perspective,
	latitude,
	longitude,
	samples,
	span,
}: SurfaceArc) => {
	const points: Vec2[] = []
	const visible: boolean[] = []
	for (let step = 0; step <= samples; step += 1) {
		const t = -span + (2 * span * step) / samples
		const surface = surfaceAt(
			radii,
			latitude === null ? t : latitude,
			longitude === null ? t : longitude,
		)
		const point = rotateVec3(rotation, surface.point)
		points.push(project({ point, perspective }))
		visible.push(isFrontFacing(rotateVec3(rotation, surface.normal)))
	}
	return lineFrom(points, visibleRuns({ visible, closed: false }))
}

export const wireframePath = ({
	radii,
	rotation,
	perspective,
	parallels,
	meridians,
	samples,
}: SurfaceGrid) => {
	const segments: string[] = []
	for (let index = 1; index < parallels; index += 1) {
		const latitude = -Math.PI / 2 + (Math.PI * index) / parallels
		segments.push(
			arcPath({
				radii,
				rotation,
				perspective,
				latitude,
				longitude: null,
				samples,
				span: Math.PI,
			}),
		)
	}
	for (let index = 0; index < meridians; index += 1) {
		const longitude = -Math.PI / 2 + (Math.PI * index) / meridians
		segments.push(
			arcPath({
				radii,
				rotation,
				perspective,
				latitude: null,
				longitude,
				samples,
				span: Math.PI / 2,
			}),
		)
	}
	return segments.join("")
}
