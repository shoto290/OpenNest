import {
	AXIS_Z,
	affineTransform,
	clamp,
	conicAffine,
	type EarPlate,
	type EulerAngles,
	earSplitPath,
	ellipseToPath,
	inPlaneSpin,
	ORIGIN,
	project,
	projectConic,
	projectEllipsoid,
	type Quat,
	quantize,
	quatFromAxisAngle,
	quatFromEuler,
	quatMultiply,
	rotatedZ,
	rotateVec3,
	round2,
	type SurfaceAffine,
	toDegrees,
	toRadians,
	type Vec2,
	type Vec3,
	VIEW_BOX,
	visibleRuns,
	wireframePath,
} from "@workspace/ui/components/bot-avatar-3d"
import type { BotAvatarAnimalDefinition } from "@workspace/ui/components/bot-avatar-animals"
import { onBotAvatarFrame } from "@workspace/ui/components/bot-avatar-clock"
import {
	BLINK_CADENCE,
	type BotAvatarState,
	EAR_POSES,
	EAR_STATE,
	EXPRESSION_CADENCE,
	EXPRESSIONS,
	STATE_POOLS,
	STATE_POSES,
} from "@workspace/ui/components/bot-avatar-data"
import {
	type BotAvatarPoseTrail,
	earDrag,
	earGazeLeak,
	earTwist,
	laggedPose,
	trackPose,
} from "@workspace/ui/components/bot-avatar-ears"
import {
	type BotAvatarGaze,
	type BotAvatarGazeCadence,
	blinkDelay,
	blinksWithDart,
	clampGaze,
	drawGazeTarget,
	GAZE_AXES,
	GAZE_CADENCE,
	GAZE_CENTRE,
	GAZE_HEAD_DELAY,
	GAZE_HEAD_SPRING_DAMPING,
	GAZE_HEAD_SPRING_FREQUENCY,
	gazeAlong,
	gazeTravel,
	glanceDelay,
	headGazeAsPose,
	headGazeFor,
	isGazeCentred,
	rigFromHeadGaze,
} from "@workspace/ui/components/bot-avatar-gaze"
import {
	type BotAvatarEarRest,
	type BotAvatarShellRest,
	type BotAvatarSilhouette,
	botAvatarSilhouette,
	headShellPoint,
	headShellRest,
	headShellWarp,
	headSurfaceAffine,
	weldToSilhouette,
} from "@workspace/ui/components/bot-avatar-silhouette"

type AxisTriple = { yaw: number; pitch: number; roll: number }

const CENTER = 114.2705
const BOIL_SEEDS = [3, 9, 17]
const AMBIENT_INTERVAL = 1000 / 30
const AMBIENT_DEGREES = 1.1
const AMBIENT_PERIODS: AxisTriple = { yaw: 2.6, pitch: 3.3, roll: 4.1 }
const AMBIENT_PHASES: AxisTriple = { yaw: 0, pitch: 11.7, roll: 23.4 }
const SMALLEST_RENDERED_PIXELS = 28
const STEPS_PER_RENDERED_PIXEL = 20
const UNIT_STEP = VIEW_BOX / SMALLEST_RENDERED_PIXELS / STEPS_PER_RENDERED_PIXEL
const AVATAR_REACH_UNITS = VIEW_BOX / 2
const RADIAN_STEP = UNIT_STEP / AVATAR_REACH_UNITS
const DEGREE_STEP = toDegrees(RADIAN_STEP)
const SCALE_STEP = UNIT_STEP / AVATAR_REACH_UNITS
const POSE_SPRING_FREQUENCY = 9
const POSE_SPRING_DAMPING = 0.9
const EAR_SWAY_DEGREES = 1.6
const EAR_SWAY_RATE = 0.0008
const EAR_SWAY_STAGGER = 2.3
const EAR_PLATE_SQUASH_FLOOR = 0.5
const EXTRAS_DEPTH_RATIO = 0.85
const BLUSH_DEPTH_RATIO = 0.55
const BLUSH_OUTWARD_OFFSET = 9
const BLUSH_BELOW_EYE_OFFSET = 9
const BLUSH_FACE_FLOOR = 6
const WIRE_PARALLELS = 6
const WIRE_MERIDIANS = 8
const WIRE_SAMPLES = 40

export type BotAvatarEarLayer = "back" | "front"

export const PARTS = {
	rig: "rig",
	head: "head",
	headClip: "head-clip",
	eye0: "eye-0",
	eye1: "eye-1",
	blush: "blush",
	noise: "noise",
	wire: "wire",
	extra: (index: number) => `extra-${index}`,
	ear: (index: number, layer: BotAvatarEarLayer) => `ear-${layer}-${index}`,
	earSplit: (index: number) => `ear-split-${index}`,
} as const

const WELD_MARKER_RADIUS = 3.5

const PASSIVE = new Set<BotAvatarState>([
	"waiting",
	"sleeping",
	"idle",
	"bored",
	"drowsy",
	"powering-down",
])

const HAPPY = new Set<BotAvatarState>([
	"happy",
	"laughing",
	"playful",
	"celebrate",
	"excited",
	"proud",
])

const centroid = (ring: number[][]) => {
	let x = 0
	let y = 0
	for (const p of ring) {
		x += p[0]
		y += p[1]
	}
	return [x / ring.length, y / ring.length]
}

const ringHeight = (ring: number[][]) => {
	let min = Number.POSITIVE_INFINITY
	let max = Number.NEGATIVE_INFINITY
	for (const p of ring) {
		min = Math.min(min, p[1])
		max = Math.max(max, p[1])
	}
	return max - min
}

const eyesHeight = (rings: number[][][]) =>
	(ringHeight(rings[0]) + ringHeight(rings[1])) / 2

const springOut: [number, number] = [0, 0]

const springStep = (
	position: number,
	velocity: number,
	target: number,
	frequency: number,
	damping: number,
	dt: number,
): [number, number] => {
	const nextVelocity =
		velocity +
		(-2 * damping * frequency * velocity -
			frequency * frequency * (position - target)) *
			dt
	springOut[0] = position + nextVelocity * dt
	springOut[1] = nextVelocity
	return springOut
}

const latticeValue = (cell: number) => {
	const wave = Math.sin(cell * 127.1) * 43758.5453
	return wave - Math.floor(wave)
}

const valueNoise = (t: number) => {
	const cell = Math.floor(t)
	const fraction = t - cell
	const blend = fraction * fraction * (3 - 2 * fraction)
	const from = latticeValue(cell)
	const to = latticeValue(cell + 1)
	return (from + (to - from) * blend) * 2 - 1
}

const ambientAxis = (seconds: number, axis: keyof AxisTriple) =>
	toRadians(
		valueNoise(seconds / AMBIENT_PERIODS[axis] + AMBIENT_PHASES[axis]) *
			AMBIENT_DEGREES,
	)

const NEUTRAL_POSE: EulerAngles = { yaw: 0, pitch: 0, roll: 0 }

const POSE_AXES: (keyof EulerAngles)[] = ["yaw", "pitch", "roll"]

export type BotAvatarOrientation = {
	yaw?: number
	pitch?: number
	roll?: number
}

const poseInRadians = (state: BotAvatarState): EulerAngles => {
	const pose = STATE_POSES[state]
	if (!pose) return { ...NEUTRAL_POSE }
	return {
		yaw: toRadians(pose.yaw),
		pitch: toRadians(pose.pitch),
		roll: toRadians(pose.roll),
	}
}

type EarPhysics = { rot: number; vRot: number; sy: number; vSy: number }

type BlushDot = {
	index: number
	rotation: Quat
	middleX: number
	lowest: number
}

type EarNodes = {
	back: SVGGElement
	front: SVGGElement
	split: SVGPathElement | null
}

type Parts = {
	rig: SVGGElement
	head: SVGGElement
	headClip: SVGPathElement | null
	extras: (SVGGElement | null)[]
	eyes: [SVGPathElement, SVGPathElement]
	ears: EarNodes[]
	blush: SVGGElement
	blushDots: SVGEllipseElement[]
	noise: SVGElement | null
	wire: SVGPathElement | null
}

export class BotAvatarEngine {
	private animal: BotAvatarAnimalDefinition
	private parts: Parts | null = null
	private state: BotAvatarState = "waiting"
	private expression = 0
	private currentRings: number[][][]
	private targetRings: number[][][]
	private morph = 1
	private velocity = 0
	private blinkStart: number | null = null
	private lastFrame = 0
	private release: (() => void) | null = null
	private earPhys: EarPhysics[] = []
	private earSwap = false
	private eyeVisible = [true, true]
	private boilIndex = 0
	private eyesDirty = true
	private gaze: BotAvatarGaze = { ...GAZE_CENTRE }
	private gazeFrom: BotAvatarGaze = { ...GAZE_CENTRE }
	private gazeTarget: BotAvatarGaze = { ...GAZE_CENTRE }
	private gazeDartAt: number | null = null
	private gazeHeld: BotAvatarGaze | null = null
	private gazeWasCentred = true
	private headGaze: BotAvatarGaze = { ...GAZE_CENTRE }
	private headGazeTarget: BotAvatarGaze = { ...GAZE_CENTRE }
	private headGazeVelocity: BotAvatarGaze = { ...GAZE_CENTRE }
	private displayGaze: BotAvatarGaze = { ...GAZE_CENTRE }
	private renderedGaze: BotAvatarGaze = { yaw: 9, pitch: 9 }
	private timers: ReturnType<typeof setTimeout>[] = []
	private boilTimer: ReturnType<typeof setInterval> | null = null
	private basePose: Partial<EulerAngles> = {}
	private statePose: EulerAngles = { ...NEUTRAL_POSE }
	private pose: EulerAngles = { ...NEUTRAL_POSE }
	private poseVelocity: EulerAngles = { ...NEUTRAL_POSE }
	private ambient: EulerAngles = { ...NEUTRAL_POSE }
	private ambientAt = 0
	private displayPose: EulerAngles = { ...NEUTRAL_POSE }
	private poseTrail: BotAvatarPoseTrail = []
	private renderedPose: EulerAngles = { yaw: 9, pitch: 9, roll: 9 }
	private written = new WeakMap<Element, Map<string, string>>()
	private perspective = 0.55
	private wireframe = false
	private surface: BotAvatarSilhouette
	private earRests: BotAvatarEarRest[]
	private extraRests: BotAvatarShellRest[]
	private welds: Vec2[]

	constructor(animal: BotAvatarAnimalDefinition) {
		this.animal = animal
		this.surface = botAvatarSilhouette(animal)
		this.statePose = poseInRadians(this.state)
		this.earPhys = animal.ears.map(() => ({ rot: 0, vRot: 0, sy: 1, vSy: 0 }))
		this.currentRings = EXPRESSIONS[0].map((ring) => ring.map((p) => [...p]))
		this.targetRings = EXPRESSIONS[0]
		this.welds = animal.ears.map((): Vec2 => [0, 0])
		this.earRests = this.surface.earRests
		this.extraRests = this.solveExtraRests()
	}

	private solveExtraRests() {
		return this.animal.extras.map((_, index) =>
			headShellRest({
				surface: this.surface,
				depthRatio: EXTRAS_DEPTH_RATIO,
				perspective: this.perspective,
				face: this.surface.extraAnchors[index],
			}),
		)
	}

	bind(svg: SVGSVGElement) {
		const part = <T extends Element>(name: string) =>
			svg.querySelector(`[data-part="${name}"]`) as T | null
		const rig = part<SVGGElement>(PARTS.rig)
		const head = part<SVGGElement>(PARTS.head)
		const eye0 = part<SVGPathElement>(PARTS.eye0)
		const eye1 = part<SVGPathElement>(PARTS.eye1)
		const blush = part<SVGGElement>(PARTS.blush)
		if (!rig || !head || !eye0 || !eye1 || !blush) {
			this.parts = null
			return
		}
		this.parts = {
			rig,
			head,
			headClip: part<SVGPathElement>(PARTS.headClip),
			extras: this.animal.extras.map((_, index) =>
				part<SVGGElement>(PARTS.extra(index)),
			),
			eyes: [eye0, eye1],
			ears: this.animal.ears
				.map((_, i) => ({
					back: part<SVGGElement>(PARTS.ear(i, "back")),
					front: part<SVGGElement>(PARTS.ear(i, "front")),
					split: part<SVGPathElement>(PARTS.earSplit(i)),
				}))
				.filter((nodes): nodes is EarNodes =>
					Boolean(nodes.back && nodes.front),
				),
			blush,
			blushDots: Array.from(blush.querySelectorAll("ellipse")),
			noise: part<SVGElement>(PARTS.noise),
			wire: part<SVGPathElement>(PARTS.wire),
		}
		this.eyeVisible = [true, true]
		this.eyesDirty = true
		this.applyBlush()
		this.render(this.lastFrame)
	}

	setState(state: BotAvatarState) {
		this.state = state
		this.statePose = poseInRadians(state)
		this.invalidate()
		this.selectExpression(STATE_POOLS[state][0])
		this.applyBlush()
		if (this.release !== null) {
			this.clearTimers()
			this.scheduleAll()
			this.applyBoil()
		}
		if (!this.glanceCadence() && this.gazeHeld === null) {
			this.startDart({ ...GAZE_CENTRE })
		}
	}

	setOrientation({ yaw, pitch, roll }: BotAvatarOrientation) {
		this.basePose = {
			yaw: yaw === undefined ? undefined : toRadians(yaw),
			pitch: pitch === undefined ? undefined : toRadians(pitch),
			roll: roll === undefined ? undefined : toRadians(roll),
		}
		this.invalidate()
	}

	setGaze(gaze: BotAvatarGaze | null) {
		const wasHeld = this.gazeHeld !== null
		this.gazeHeld = gaze && clampGaze(gaze)
		if (this.gazeHeld) {
			this.holdGaze(this.gazeHeld)
			this.invalidate()
			return
		}
		if (!wasHeld) return
		if (!this.glanceCadence()) {
			this.startDart({ ...GAZE_CENTRE })
			return
		}
		if (this.release !== null) this.scheduleGlance()
	}

	setPerspective(perspective: number) {
		this.perspective = clamp(perspective, 0, 1)
		this.extraRests = this.solveExtraRests()
		this.invalidate()
	}

	setWireframe(enabled: boolean) {
		this.wireframe = enabled
		this.invalidate()
	}

	private invalidate() {
		this.renderedPose = { yaw: 9, pitch: 9, roll: 9 }
		this.renderedGaze = { yaw: 9, pitch: 9 }
	}

	private write(el: Element | null | undefined, name: string, value: string) {
		if (!el) return
		let attributes = this.written.get(el)
		if (!attributes) {
			attributes = new Map()
			this.written.set(el, attributes)
		}
		if (attributes.get(name) === value) return
		attributes.set(name, value)
		el.setAttribute(name, value)
	}

	start() {
		if (this.release !== null) return
		this.lastFrame = performance.now()
		this.scheduleAll()
		this.applyBoil()
		this.release = onBotAvatarFrame((now) => this.step(now))
	}

	stop() {
		this.release?.()
		this.release = null
		this.clearTimers()
		if (this.boilTimer !== null) clearInterval(this.boilTimer)
		this.boilTimer = null
	}

	renderStatic() {
		const pose = EAR_POSES[EAR_STATE[this.state] ?? "neutral"]
		this.earPhys.forEach((ear, i) => {
			const target = pose[i]
			ear.rot = target.rot
			ear.sy = target.sy
			ear.vRot = 0
			ear.vSy = 0
		})
		this.morph = 1
		this.velocity = 0
		this.ambient = { ...NEUTRAL_POSE }
		this.holdGaze(this.gazeHeld ?? GAZE_CENTRE)
		this.headGaze = { ...this.headGazeTarget }
		this.headGazeVelocity = { ...GAZE_CENTRE }
		this.pose = {
			yaw: this.restPose("yaw"),
			pitch: this.restPose("pitch"),
			roll: this.restPose("roll"),
		}
		this.poseVelocity = { ...NEUTRAL_POSE }
		this.poseTrail = []
		this.eyesDirty = true
		this.render(0)
	}

	private clearTimers() {
		for (const t of this.timers) clearTimeout(t)
		this.timers = []
	}

	private scheduleAll() {
		this.scheduleGlance()
		this.scheduleExpression()
		this.scheduleBlink()
		this.scheduleEarTwitch()
		this.scheduleEarSwap()
	}

	private applyBoil() {
		const active = !PASSIVE.has(this.state)
		if (active && this.boilTimer === null) {
			this.boilTimer = setInterval(() => {
				this.boilIndex = (this.boilIndex + 1) % BOIL_SEEDS.length
				this.write(
					this.parts?.noise,
					"seed",
					String(BOIL_SEEDS[this.boilIndex]),
				)
			}, 140)
		}
		if (!active && this.boilTimer !== null) {
			clearInterval(this.boilTimer)
			this.boilTimer = null
		}
	}

	private schedule(delay: number, run: () => void) {
		const timer = setTimeout(() => {
			this.timers = this.timers.filter((t) => t !== timer)
			run()
		}, delay)
		this.timers.push(timer)
	}

	private selectExpression(index: number) {
		this.currentRings = this.displayedRings()
		this.targetRings = EXPRESSIONS[index]
		this.expression = index
		this.morph = 0
		this.velocity = 0
		this.eyesDirty = true
	}

	private scheduleExpression() {
		const cadence = EXPRESSION_CADENCE[this.state]
		const pool = STATE_POOLS[this.state]
		if (!cadence || !pool) return
		const delay = cadence[0] + Math.random() * (cadence[1] - cadence[0])
		this.schedule(delay, () => {
			const alternatives = pool.filter((x) => x !== this.expression)
			const next = alternatives.length
				? alternatives[Math.floor(Math.random() * alternatives.length)]
				: pool[0]
			this.selectExpression(next)
			this.scheduleExpression()
		})
	}

	private glanceCadence() {
		return GAZE_CADENCE[this.state]
	}

	private scheduleGlance() {
		const cadence = this.glanceCadence()
		if (!cadence || this.gazeHeld !== null) return
		this.schedule(glanceDelay(cadence, Math.random), () => {
			if (this.gazeHeld !== null) return
			this.startDart(this.nextGazeTarget(cadence))
			this.scheduleGlance()
		})
	}

	private nextGazeTarget(cadence: BotAvatarGazeCadence): BotAvatarGaze {
		if (cadence.returnsToCentre && !this.gazeWasCentred) {
			this.gazeWasCentred = true
			return { ...GAZE_CENTRE }
		}
		const target = drawGazeTarget(cadence, Math.random)
		this.gazeWasCentred = isGazeCentred(target)
		return target
	}

	private holdGaze(target: BotAvatarGaze) {
		this.gaze = { ...target }
		this.gazeFrom = { ...target }
		this.gazeTarget = { ...target }
		this.gazeDartAt = null
		this.headGazeTarget = headGazeFor(target)
	}

	private startDart(target: BotAvatarGaze) {
		if (this.release === null) {
			this.holdGaze(target)
			return
		}
		this.gazeFrom = { ...this.gaze }
		this.gazeTarget = target
		this.gazeDartAt = performance.now()
		if (!blinksWithDart(gazeTravel(this.gazeFrom, target), Math.random)) return
		this.schedule(blinkDelay(Math.random), () => {
			this.blinkStart = performance.now()
			this.eyesDirty = true
		})
	}

	private stepGaze(now: number, dt: number) {
		if (this.gazeDartAt !== null) {
			const elapsed = now - this.gazeDartAt
			this.gaze = gazeAlong(this.gazeFrom, this.gazeTarget, elapsed)
			if (elapsed >= GAZE_HEAD_DELAY) {
				this.headGazeTarget = headGazeFor(this.gazeTarget)
				this.gazeDartAt = null
			}
		}
		for (const axis of GAZE_AXES) {
			const [next, velocity] = springStep(
				this.headGaze[axis],
				this.headGazeVelocity[axis],
				this.headGazeTarget[axis],
				GAZE_HEAD_SPRING_FREQUENCY,
				GAZE_HEAD_SPRING_DAMPING,
				dt,
			)
			this.headGaze[axis] = Number.isFinite(next) ? next : 0
			this.headGazeVelocity[axis] = Number.isFinite(velocity) ? velocity : 0
		}
	}

	private scheduleBlink() {
		const cadence = BLINK_CADENCE[this.state]
		if (!cadence) return
		const delay = cadence[0] + Math.random() * (cadence[1] - cadence[0])
		this.schedule(delay, () => {
			this.blinkStart = performance.now()
			this.eyesDirty = true
			this.scheduleBlink()
		})
	}

	private scheduleEarTwitch() {
		const calm = PASSIVE.has(this.state)
		const delay = (calm ? 5000 : 1600) + Math.random() * (calm ? 9000 : 3000)
		this.schedule(delay, () => {
			const ear = this.earPhys[Math.floor(Math.random() * this.earPhys.length)]
			ear.vRot += (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 90)
			this.scheduleEarTwitch()
		})
	}

	private scheduleEarSwap() {
		this.schedule(2200 + Math.random() * 2800, () => {
			this.earSwap = !this.earSwap
			this.scheduleEarSwap()
		})
	}

	private applyBlush() {
		if (!this.parts) return
		this.parts.blush.style.opacity = HAPPY.has(this.state) ? "0.9" : "0"
	}

	private displayedRings() {
		const t = clamp(this.morph, 0, 1)
		return this.currentRings.map((ring, eye) =>
			ring.map((p, i) => [
				p[0] + (this.targetRings[eye][i][0] - p[0]) * t,
				p[1] + (this.targetRings[eye][i][1] - p[1]) * t,
			]),
		)
	}

	private blinkScale(now: number) {
		if (this.blinkStart === null) return 1
		const t = (now - this.blinkStart) / 320
		if (t >= 1) {
			this.blinkStart = null
			return 1
		}
		return Math.max(t < 0.42 ? 1 - t / 0.42 : (t - 0.42) / 0.58, 0.04)
	}

	private stepPose(now: number, dt: number) {
		if (now - this.ambientAt >= AMBIENT_INTERVAL) {
			const seconds = now / 1000
			this.ambient.yaw = ambientAxis(seconds, "yaw")
			this.ambient.pitch = ambientAxis(seconds, "pitch")
			this.ambient.roll = ambientAxis(seconds, "roll")
			this.ambientAt = now
		}
		for (const axis of POSE_AXES) {
			const [next, velocity] = springStep(
				this.pose[axis],
				this.poseVelocity[axis],
				this.restPose(axis) + this.ambient[axis],
				POSE_SPRING_FREQUENCY,
				POSE_SPRING_DAMPING,
				dt,
			)
			this.pose[axis] = Number.isFinite(next) ? next : 0
			this.poseVelocity[axis] = Number.isFinite(velocity) ? velocity : 0
		}
	}

	private restPose(axis: keyof EulerAngles) {
		return this.basePose[axis] ?? this.statePose[axis]
	}

	private quantizePose() {
		const headPose = headGazeAsPose(this.headGaze)
		for (const axis of POSE_AXES) {
			this.displayPose[axis] = quantize(
				this.pose[axis] + headPose[axis],
				RADIAN_STEP,
			)
		}
		for (const axis of GAZE_AXES) {
			this.displayGaze[axis] = quantize(this.gaze[axis], DEGREE_STEP)
		}
	}

	private viewMoved() {
		return (
			this.displayPose.yaw !== this.renderedPose.yaw ||
			this.displayPose.pitch !== this.renderedPose.pitch ||
			this.displayPose.roll !== this.renderedPose.roll ||
			this.displayGaze.yaw !== this.renderedGaze.yaw ||
			this.displayGaze.pitch !== this.renderedGaze.pitch
		)
	}

	private step(now: number) {
		const dt = Math.min((now - this.lastFrame) / 1000, 0.1)
		this.lastFrame = now
		this.stepPose(now, dt)
		this.stepGaze(now, dt)
		;[this.morph, this.velocity] = springStep(
			this.morph,
			this.velocity,
			1,
			7,
			1,
			dt,
		)
		if (!Number.isFinite(this.morph)) {
			this.morph = 1
			this.velocity = 0
		}
		const pose = EAR_POSES[EAR_STATE[this.state] ?? "neutral"]
		for (let i = 0; i < this.earPhys.length; i += 1) {
			const ear = this.earPhys[i]
			const target = pose[this.earSwap ? 1 - (i % 2) : i % 2]
			;[ear.rot, ear.vRot] = springStep(
				ear.rot,
				ear.vRot,
				target.rot,
				14,
				0.5,
				dt,
			)
			;[ear.sy, ear.vSy] = springStep(ear.sy, ear.vSy, target.sy, 14, 0.5, dt)
		}
		this.render(now)
	}

	private renderHead(affine: SurfaceAffine) {
		const parts = this.parts
		if (!parts) return
		const transform = affineTransform({
			affine,
			restPivot: this.surface.center,
			pivot: this.surface.center,
		})
		this.write(parts.head, "transform", transform)
		this.write(parts.headClip, "transform", transform)
	}

	private renderExtras(rotation: Quat) {
		const parts = this.parts
		if (!parts) return
		for (let index = 0; index < parts.extras.length; index += 1) {
			const el = parts.extras[index]
			if (!el) continue
			this.write(
				el,
				"transform",
				affineTransform(
					headShellWarp({
						surface: this.surface,
						depthRatio: EXTRAS_DEPTH_RATIO,
						rest: this.extraRests[index],
						rotation,
						perspective: this.perspective,
						face: this.surface.extraAnchors[index],
					}),
				),
			)
		}
	}

	private renderEars(lagged: Quat, rotation: Quat, welds: Vec2[], now: number) {
		const parts = this.parts
		if (!parts) return
		const gazeTurn = headGazeAsPose(this.headGazeVelocity)
		const drag = earDrag({
			yaw: this.poseVelocity.yaw + gazeTurn.yaw,
			pitch: this.poseVelocity.pitch + gazeTurn.pitch,
		})
		const leak = earGazeLeak(this.displayGaze.yaw)
		for (let index = 0; index < this.animal.ears.length; index += 1) {
			const ear = this.animal.ears[index]
			const el = parts.ears[index]
			const phys = this.earPhys[index]
			const rest = this.earRests[index]
			if (!el || !phys || !rest) continue
			const sway =
				Math.sin(now * EAR_SWAY_RATE + index * EAR_SWAY_STAGGER) *
				EAR_SWAY_DEGREES
			const twist = quatFromAxisAngle(
				AXIS_Z,
				toRadians(
					quantize(
						ear.side * phys.rot + earTwist({ drag, leak, sway }),
						DEGREE_STEP,
					),
				),
			)
			const hinged = quatMultiply(lagged, twist)
			const anchor = rotateVec3(lagged, rest.anchor)
			const squash = quantize(
				Math.max(EAR_PLATE_SQUASH_FLOOR, phys.sy),
				SCALE_STEP,
			)
			const plate: Vec3 = [
				ear.volume.radii[0],
				ear.volume.radii[1] * squash,
				ear.volume.radii[2],
			]
			const placement = {
				affine: conicAffine({
					restRadii: [ear.volume.radii[0], ear.volume.radii[1]],
					current: projectConic({
						radii: plate,
						rotation: hinged,
						center: anchor,
						perspective: this.perspective,
					}),
					spin: inPlaneSpin(hinged),
				}),
				restPivot: rest.attachRest,
				pivot: welds[index],
			}
			const transform = affineTransform(placement)
			this.write(el.back, "transform", transform)
			this.write(el.front, "transform", transform)
			this.writeEarSplit(index, rotation, {
				rotation: hinged,
				depth: anchor[2],
				center: ear.volume.center,
				squash,
				placement,
			})
		}
	}

	private writeEarSplit(index: number, rotation: Quat, plate: EarPlate) {
		const split = this.parts?.ears[index]?.split
		if (!split) return
		this.write(
			split,
			"d",
			earSplitPath({
				head: {
					radii: this.surface.radii,
					rotation,
					center: this.surface.center,
				},
				plate,
			}),
		)
	}

	private renderEyes(rotation: Quat, now: number) {
		const parts = this.parts
		if (!parts) return
		const animal = this.animal
		const rings = this.displayedRings()
		const blink = this.blinkScale(now)
		const faceScale =
			animal.scale *
			Math.min(1, 64 / Math.max(1, eyesHeight(rings) * animal.scale))
		const offsetY = animal.faceY - this.surface.center[1]
		const [rx, ry, rz] = this.surface.radii
		const gazeLongitude = toRadians(this.displayGaze.yaw)
		const gazeLatitude = toRadians(this.displayGaze.pitch)
		rings.forEach((ring, index) => {
			const middle = centroid(ring)
			const middleY = (middle[1] - CENTER) * faceScale + offsetY
			const points: Vec2[] = []
			const visible: boolean[] = []
			let lowest = Number.NEGATIVE_INFINITY
			for (const vertex of ring) {
				const faceX = (vertex[0] - CENTER) * faceScale
				const faceY =
					middleY +
					((vertex[1] - CENTER) * faceScale + offsetY - middleY) * blink
				lowest = Math.max(lowest, faceY)
				const longitude = faceX / rx + gazeLongitude
				const latitude = faceY / ry + gazeLatitude
				const cosLatitude = Math.cos(latitude)
				const point: Vec3 = [
					rx * cosLatitude * Math.sin(longitude),
					ry * Math.sin(latitude),
					rz * cosLatitude * Math.cos(longitude),
				]
				points.push(
					project({
						point: rotateVec3(rotation, point),
						perspective: this.perspective,
					}),
				)
				visible.push(
					rotatedZ(rotation, [
						point[0] / (rx * rx),
						point[1] / (ry * ry),
						point[2] / (rz * rz),
					]) > 0,
				)
			}
			this.writeEye(index, points, visible)
			this.writeBlushDot({
				index,
				rotation,
				middleX: (middle[0] - CENTER) * faceScale,
				lowest,
			})
		})
	}

	private writeBlushDot({ index, rotation, middleX, lowest }: BlushDot) {
		const dot = this.parts?.blushDots[index]
		if (!dot) return
		const away = Math.sign(middleX) || (index === 0 ? -1 : 1)
		const floor = this.animal.faceY + BLUSH_FACE_FLOOR - this.surface.center[1]
		const [x, y] = headShellPoint({
			surface: this.surface,
			depthRatio: BLUSH_DEPTH_RATIO,
			rotation,
			perspective: this.perspective,
			face: [
				middleX + away * BLUSH_OUTWARD_OFFSET,
				Math.max(lowest + BLUSH_BELOW_EYE_OFFSET, floor),
			],
		})
		this.write(dot, "cx", String(round2(x)))
		this.write(dot, "cy", String(round2(y)))
	}

	private writeEye(index: number, points: Vec2[], visible: boolean[]) {
		const parts = this.parts
		if (!parts) return
		const [cx, cy] = this.surface.center
		const runs = visibleRuns({ visible, closed: true })
		const el = parts.eyes[index]
		const isVisible = runs.length > 0
		if (isVisible !== this.eyeVisible[index]) {
			this.eyeVisible[index] = isVisible
			el.style.opacity = isVisible ? "1" : "0"
		}
		if (!isVisible) return
		let d = ""
		for (const run of runs) {
			for (let step = 0; step < run.length; step += 1) {
				const at = run[step]
				d += step === 0 ? "M" : "L"
				d += `${round2(cx + points[at][0])} ${round2(cy + points[at][1])}`
			}
			d += "Z"
		}
		this.write(el, "d", d)
	}

	private renderWire(rotation: Quat, welds: Vec2[]) {
		const wire = this.parts?.wire
		if (!wire || !this.wireframe) return
		const [cx, cy] = this.surface.center
		this.write(wire, "transform", `translate(${cx} ${cy})`)
		const markers = welds
			.map((weld) =>
				ellipseToPath({
					cx: weld[0] - cx,
					cy: weld[1] - cy,
					major: WELD_MARKER_RADIUS,
					minor: WELD_MARKER_RADIUS,
					angle: 0,
				}),
			)
			.join("")
		this.write(
			wire,
			"d",
			ellipseToPath(
				projectEllipsoid({
					radii: this.surface.radii,
					rotation,
					center: ORIGIN,
					perspective: this.perspective,
				}),
			) +
				wireframePath({
					radii: this.surface.radii,
					rotation,
					perspective: this.perspective,
					parallels: WIRE_PARALLELS,
					meridians: WIRE_MERIDIANS,
					samples: WIRE_SAMPLES,
				}) +
				markers,
		)
	}

	private render(now: number) {
		const parts = this.parts
		if (!parts) return
		const settled =
			this.morph > 0.999 &&
			Math.abs(this.velocity) < 0.001 &&
			this.blinkStart === null
		this.quantizePose()
		trackPose(this.poseTrail, now, this.displayPose)
		const rotation = quatFromEuler(this.displayPose)
		const trailed = laggedPose(this.poseTrail, now)
		for (const axis of POSE_AXES) {
			trailed[axis] = quantize(trailed[axis], RADIAN_STEP)
		}
		const lagged = quatFromEuler(trailed)
		const headAffine = headSurfaceAffine({
			surface: this.surface,
			rotation,
			perspective: this.perspective,
		})
		const welds = this.welds
		for (let index = 0; index < this.earRests.length; index += 1) {
			const weld = weldToSilhouette({
				surface: this.surface,
				attach: this.earRests[index].attach,
				affine: headAffine,
			})
			welds[index][0] = weld[0]
			welds[index][1] = weld[1]
		}
		if (!settled || this.eyesDirty || this.viewMoved()) {
			this.renderedPose.yaw = this.displayPose.yaw
			this.renderedPose.pitch = this.displayPose.pitch
			this.renderedPose.roll = this.displayPose.roll
			this.renderedGaze.yaw = this.displayGaze.yaw
			this.renderedGaze.pitch = this.displayGaze.pitch
			this.renderHead(headAffine)
			this.renderExtras(rotation)
			this.renderEyes(rotation, now)
			this.renderWire(rotation, welds)
			if (settled) this.eyesDirty = false
		}
		const breath = Math.sin(now * 0.0016)
		const stretch = quantize(
			clamp(this.velocity * 0.025, -0.09, 0.13),
			SCALE_STEP,
		)
		const rig = rigFromHeadGaze(this.headGaze.yaw)
		const rigDx = quantize(rig.translation, UNIT_STEP)
		const rigDy = quantize(breath * 1.3, UNIT_STEP)
		const tilt = quantize(rig.tilt, DEGREE_STEP)
		this.write(
			parts.rig,
			"transform",
			`translate(${round2(120 + rigDx)} ${round2(132 + rigDy)}) rotate(${round2(tilt)}) scale(${round2(1 - stretch * 0.5)} ${round2(1 + stretch)}) translate(-120 -132)`,
		)
		this.renderEars(lagged, rotation, welds, now)
	}
}
