import {
	applySurfaceAffine,
	type SurfaceAffine,
	type Vec2,
	type Vec3,
} from "@workspace/ui/components/bot-avatar-3d"
import type { BotAvatarAnimalDefinition } from "@workspace/ui/components/bot-avatar-animals"

const CURVE_SAMPLES = 16
const NUMBER_PATTERN = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
const COMMAND_PATTERN = /[a-z][^a-z]*/gi

const cubicAt = (from: Vec2, c1: Vec2, c2: Vec2, to: Vec2, t: number): Vec2 => {
	const u = 1 - t
	const a = u * u * u
	const b = 3 * u * u * t
	const c = 3 * u * t * t
	const d = t * t * t
	return [
		a * from[0] + b * c1[0] + c * c2[0] + d * to[0],
		a * from[1] + b * c1[1] + c * c2[1] + d * to[1],
	]
}

const readNumbers = (source: string) =>
	(source.match(NUMBER_PATTERN) ?? []).map(Number)

export const flattenPath = (d: string): Vec2[] => {
	const points: Vec2[] = []
	let cursor: Vec2 = [0, 0]
	for (const chunk of d.match(COMMAND_PATTERN) ?? []) {
		const command = chunk[0]
		const values = readNumbers(chunk.slice(1))
		if (command === "M" || command === "L") {
			for (let at = 0; at + 1 < values.length; at += 2) {
				cursor = [values[at], values[at + 1]]
				points.push(cursor)
			}
			continue
		}
		if (command !== "C") continue
		for (let at = 0; at + 5 < values.length; at += 6) {
			const c1: Vec2 = [values[at], values[at + 1]]
			const c2: Vec2 = [values[at + 2], values[at + 3]]
			const to: Vec2 = [values[at + 4], values[at + 5]]
			for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
				points.push(cubicAt(cursor, c1, c2, to, step / CURVE_SAMPLES))
			}
			cursor = to
		}
	}
	return points
}

type OutlineBounds = { center: Vec2; extent: Vec2 }

export const outlineBounds = (points: Vec2[]): OutlineBounds => {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const [x, y] of points) {
		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x)
		maxY = Math.max(maxY, y)
	}
	return {
		center: [(minX + maxX) / 2, (minY + maxY) / 2],
		extent: [(maxX - minX) / 2, (maxY - minY) / 2],
	}
}

type NearestPoint = { points: Vec2[]; target: Vec2 }

export const nearestOutlinePoint = ({ points, target }: NearestPoint): Vec2 => {
	let best: Vec2 = points[0]
	let bestDistance = Number.POSITIVE_INFINITY
	for (let index = 0; index < points.length; index += 1) {
		const from = points[index]
		const to = points[(index + 1) % points.length]
		const edgeX = to[0] - from[0]
		const edgeY = to[1] - from[1]
		const lengthSquared = edgeX * edgeX + edgeY * edgeY || 1
		const along = Math.max(
			0,
			Math.min(
				1,
				((target[0] - from[0]) * edgeX + (target[1] - from[1]) * edgeY) /
					lengthSquared,
			),
		)
		const point: Vec2 = [from[0] + edgeX * along, from[1] + edgeY * along]
		const distance = Math.hypot(target[0] - point[0], target[1] - point[1])
		if (distance >= bestDistance) continue
		bestDistance = distance
		best = point
	}
	return best
}

export type BotAvatarSilhouette = {
	center: Vec2
	radii: Vec3
	outline: Vec2[]
	attachments: Vec2[]
}

const solve = (animal: BotAvatarAnimalDefinition): BotAvatarSilhouette => {
	const outline = flattenPath(animal.head)
	const { center, extent } = outlineBounds(outline)
	return {
		center,
		radii: [extent[0], extent[1], animal.headDepth],
		outline,
		attachments: animal.ears.map((ear) => {
			const attach = nearestOutlinePoint({ points: outline, target: ear.pivot })
			return [attach[0] - center[0], attach[1] - center[1]]
		}),
	}
}

const CACHE = new WeakMap<BotAvatarAnimalDefinition, BotAvatarSilhouette>()

export const botAvatarSilhouette = (animal: BotAvatarAnimalDefinition) => {
	const cached = CACHE.get(animal)
	if (cached) return cached
	const solved = solve(animal)
	CACHE.set(animal, solved)
	return solved
}

type EarWeld = {
	surface: BotAvatarSilhouette
	attach: Vec2
	affine: SurfaceAffine
}

export const weldToSilhouette = ({
	surface,
	attach,
	affine,
}: EarWeld): Vec2 => {
	const [cx, cy] = surface.center
	const hit = applySurfaceAffine(affine, attach)
	return [cx + hit[0], cy + hit[1]]
}

export const warpedOutline = (
	surface: BotAvatarSilhouette,
	affine: SurfaceAffine,
): Vec2[] => {
	const [cx, cy] = surface.center
	return surface.outline.map((point) => {
		const warped = applySurfaceAffine(affine, [point[0] - cx, point[1] - cy])
		return [cx + warped[0], cy + warped[1]]
	})
}
