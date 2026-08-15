import type { BotAvatarAnimalDefinition } from "@workspace/ui/components/bot-avatar-animals"
import {
	BLINK_CADENCE,
	type BotAvatarState,
	EXPRESSION_CADENCE,
	EXPRESSIONS,
	STATE_POOLS,
} from "@workspace/ui/components/bot-avatar-data"

const CENTER = 114.2705
const RADIUS = 105
const BOIL_SEEDS = [3, 9, 17]

export const PARTS = {
	rig: "rig",
	faceMap: "face-map",
	eye0: "eye-0",
	eye1: "eye-1",
	blush: "blush",
	noise: "noise",
	ear: (index: number) => `ear-${index}`,
} as const

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

type EarPose = { rot: number; sy: number }

const symmetric = (rot: number, sy: number): [EarPose, EarPose] => [
	{ rot, sy },
	{ rot, sy },
]

const EAR_POSES: Record<string, [EarPose, EarPose]> = {
	neutral: symmetric(0, 1),
	soft: symmetric(8, 0.97),
	perk: symmetric(-10, 1.16),
	flat: symmetric(32, 0.82),
	back: symmetric(20, 0.78),
	tilt: [
		{ rot: -16, sy: 1.16 },
		{ rot: 18, sy: 0.9 },
	],
	radar: [
		{ rot: -12, sy: 1.12 },
		{ rot: 6, sy: 1 },
	],
}

const EAR_STATE: Partial<Record<BotAvatarState, keyof typeof EAR_POSES>> = {
	waiting: "soft",
	happy: "soft",
	laughing: "soft",
	proud: "soft",
	idle: "soft",
	humming: "soft",
	listening: "perk",
	excited: "perk",
	surprised: "perk",
	notifying: "perk",
	alerting: "perk",
	dictating: "perk",
	receiving: "perk",
	spawning: "perk",
	playful: "perk",
	celebrate: "perk",
	waking: "perk",
	dragging: "perk",
	curious: "tilt",
	confused: "tilt",
	thinking: "radar",
	searching: "radar",
	working: "radar",
	loading: "radar",
	uploading: "radar",
	writing: "radar",
	sending: "radar",
	scared: "flat",
	sad: "flat",
	shy: "flat",
	sleeping: "flat",
	drowsy: "flat",
	bored: "flat",
	"powering-down": "flat",
	angry: "back",
	suspicious: "back",
}

const clamp = (v: number, min: number, max: number) =>
	Math.max(min, Math.min(max, v))

const centroid = (ring: number[][]) => {
	let x = 0
	let y = 0
	for (const p of ring) {
		x += p[0]
		y += p[1]
	}
	return [x / ring.length, y / ring.length]
}

const EYE_HOME = centroid(EXPRESSIONS.flat(2) as unknown as number[][])

const ringBottom = (ring: number[][]) => {
	let max = Number.NEGATIVE_INFINITY
	for (const p of ring) max = Math.max(max, p[1])
	return max
}

const eyesHeight = (rings: number[][][]) => {
	const heights = rings.map((ring) => {
		let min = Number.POSITIVE_INFINITY
		let max = Number.NEGATIVE_INFINITY
		for (const p of ring) {
			min = Math.min(min, p[1])
			max = Math.max(max, p[1])
		}
		return max - min
	})
	return (heights[0] + heights[1]) / 2
}

const pathFrom = (ring: number[][]) =>
	`M${ring.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L")}Z`

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
	return [position + nextVelocity * dt, nextVelocity]
}

type EarPhysics = { rot: number; vRot: number; sy: number; vSy: number }

type Parts = {
	rig: SVGGElement
	faceMap: SVGGElement
	eyes: [SVGPathElement, SVGPathElement]
	ears: SVGGElement[]
	blush: SVGGElement
	blushDots: SVGEllipseElement[]
	noise: SVGElement | null
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
	private frame: number | null = null
	private earPhys: EarPhysics[] = []
	private earSwap = false
	private boilIndex = 0
	private eyesDirty = true
	private faceDx = 0
	private faceDy = 0
	private timers: ReturnType<typeof setTimeout>[] = []
	private boilTimer: ReturnType<typeof setInterval> | null = null

	constructor(animal: BotAvatarAnimalDefinition) {
		this.animal = animal
		this.earPhys = animal.ears.map(() => ({ rot: 0, vRot: 0, sy: 1, vSy: 0 }))
		this.currentRings = EXPRESSIONS[0].map((ring) => ring.map((p) => [...p]))
		this.targetRings = EXPRESSIONS[0]
	}

	bind(svg: SVGSVGElement) {
		const part = <T extends Element>(name: string) =>
			svg.querySelector(`[data-part="${name}"]`) as T | null
		const rig = part<SVGGElement>(PARTS.rig)
		const faceMap = part<SVGGElement>(PARTS.faceMap)
		const eye0 = part<SVGPathElement>(PARTS.eye0)
		const eye1 = part<SVGPathElement>(PARTS.eye1)
		const blush = part<SVGGElement>(PARTS.blush)
		if (!rig || !faceMap || !eye0 || !eye1 || !blush) {
			this.parts = null
			return
		}
		this.parts = {
			rig,
			faceMap,
			eyes: [eye0, eye1],
			ears: this.animal.ears
				.map((_, i) => part<SVGGElement>(PARTS.ear(i)))
				.filter((el): el is SVGGElement => el !== null),
			blush,
			blushDots: Array.from(blush.querySelectorAll("ellipse")),
			noise: part<SVGElement>(PARTS.noise),
		}
		this.eyesDirty = true
		this.applyBlush()
		this.render(this.lastFrame)
	}

	setState(state: BotAvatarState) {
		this.state = state
		this.selectExpression(STATE_POOLS[state][0])
		this.applyBlush()
		if (this.frame !== null) {
			this.clearTimers()
			this.scheduleAll()
			this.applyBoil()
		}
	}

	start() {
		if (this.frame !== null) return
		this.lastFrame = performance.now()
		this.scheduleAll()
		this.applyBoil()
		const loop = (now: number) => {
			this.step(now)
			this.frame = requestAnimationFrame(loop)
		}
		this.frame = requestAnimationFrame(loop)
	}

	stop() {
		if (this.frame !== null) cancelAnimationFrame(this.frame)
		this.frame = null
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
		this.eyesDirty = true
		this.render(0)
	}

	private clearTimers() {
		for (const t of this.timers) clearTimeout(t)
		this.timers = []
	}

	private scheduleAll() {
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
				this.parts?.noise?.setAttribute(
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

	private step(now: number) {
		const dt = Math.min((now - this.lastFrame) / 1000, 0.1)
		this.lastFrame = now
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
		this.earPhys.forEach((ear, i) => {
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
		})
		this.render(now)
	}

	private render(now: number) {
		const parts = this.parts
		if (!parts) return
		const animal = this.animal
		const settled =
			this.morph > 0.999 &&
			Math.abs(this.velocity) < 0.001 &&
			this.blinkStart === null
		if (!settled || this.eyesDirty) {
			const rings = this.displayedRings()
			const blink = this.blinkScale(now)
			const s = animal.scale
			const k = Math.min(1, 64 / Math.max(1, eyesHeight(rings) * s))
			parts.faceMap.setAttribute(
				"transform",
				`translate(120 ${animal.faceY}) scale(${(s * k).toFixed(4)}) translate(${-CENTER} ${-CENTER})`,
			)
			const eyeCentroids: number[][] = []
			const eyeInfo: { ax: number; abot: number }[] = []
			rings.forEach((ring, index) => {
				const c = centroid(ring)
				eyeCentroids.push(c)
				const offset = c[0] - CENTER
				const baseLongitude = Math.asin(clamp(offset / RADIUS, -1, 1))
				const depth = Math.cos(baseLongitude)
				const x = CENTER + RADIUS * Math.sin(baseLongitude)
				const el = parts.eyes[index]
				el.setAttribute("d", pathFrom(ring))
				el.setAttribute(
					"transform",
					`translate(${x.toFixed(2)} ${c[1].toFixed(2)}) scale(1 ${blink.toFixed(4)}) translate(${(-c[0]).toFixed(2)} ${(-c[1]).toFixed(2)})`,
				)
				el.style.opacity = depth > 0.02 ? "1" : "0"
				eyeInfo[index] = {
					ax: 120 + (x - CENTER) * s * k,
					abot: animal.faceY + (ringBottom(ring) - CENTER) * s * k,
				}
			})
			this.faceDx = (eyeCentroids[0][0] + eyeCentroids[1][0]) / 2 - EYE_HOME[0]
			this.faceDy = (eyeCentroids[0][1] + eyeCentroids[1][1]) / 2 - EYE_HOME[1]
			parts.blushDots.forEach((dot, i) => {
				const info = eyeInfo[i]
				if (!info) return
				const out = Math.sign(info.ax - 120) || (i === 0 ? -1 : 1)
				dot.setAttribute("cx", (info.ax + out * 9).toFixed(2))
				dot.setAttribute(
					"cy",
					Math.max(info.abot + 9, animal.faceY + 6).toFixed(2),
				)
			})
			if (settled) this.eyesDirty = false
		}
		const breath = Math.sin(now * 0.0016)
		const stretch = clamp(this.velocity * 0.025, -0.09, 0.13)
		const rigDx = this.faceDx * animal.scale * 0.5
		const rigDy = this.faceDy * animal.scale * 0.5 + breath * 1.3
		const tilt = this.faceDx * 0.12
		parts.rig.setAttribute(
			"transform",
			`translate(${(120 + rigDx).toFixed(2)} ${(132 + rigDy).toFixed(2)}) rotate(${tilt.toFixed(2)}) scale(${(1 - stretch * 0.5).toFixed(4)} ${(1 + stretch).toFixed(4)}) translate(-120 -132)`,
		)
		const earWiggle = clamp(this.velocity, -3, 3) * 1.8 + this.faceDx * 0.08
		animal.ears.forEach((ear, i) => {
			const el = parts.ears[i]
			const phys = this.earPhys[i]
			if (!el || !phys) return
			const sway = Math.sin(now * 0.0008 + i * 2.3) * 1.6
			const angle = ear.side * phys.rot + earWiggle + sway
			el.setAttribute(
				"transform",
				`translate(${ear.pivot[0]} ${ear.pivot[1]}) rotate(${angle.toFixed(2)}) scale(1 ${Math.max(0.5, phys.sy).toFixed(3)}) translate(${-ear.pivot[0]} ${-ear.pivot[1]})`,
			)
		})
	}
}
