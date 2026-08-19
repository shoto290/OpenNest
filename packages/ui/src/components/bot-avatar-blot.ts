import { round2 } from "@workspace/ui/components/bot-avatar-3d"
import {
	flattenPath,
	outlineBounds,
} from "@workspace/ui/components/bot-avatar-silhouette"

/** The one outline every blot is drawn from. A bot is told apart by how this shape
 * is laid down behind it, never by a second drawing: at 40px behind an animal a
 * generated contour stops reading as a mark. */
const BLOT_PATH =
	"M118,6 C152,0 180,18 189,48 C196,72 174,86 178,104 C182,122 202,130 195,151 C187,175 158,191 130,193 C102,195 80,180 58,175 C28,168 7,147 8,115 C9,85 23,58 39,38 C57,15 86,12 118,6 Z"

/** The square the outline is authored in. Wider than the outline itself, which is
 * what keeps the blot clear of the ink around it. */
const BLOT_BOX = 200

/** The centre of the outline's own bounds, read off the outline rather than written
 * down beside it. It is as wide as it is tall to within a fifth of a unit, so
 * turning it about this point swaps its extents and lands it back in the box it
 * started in — which is what lets a blot be reposed without moving a single edge of
 * the avatar around it. */
const [BLOT_CENTER_X, BLOT_CENTER_Y] = outlineBounds(
	flattenPath(BLOT_PATH),
).center.map(round2)

/** Quarter turns, each of them mirrored or not: the eight ways a square can be laid
 * over itself. Turning and mirroring are the whole vocabulary — they leave the
 * outline exactly as drawn, where a free angle would push a lobe past the edge and
 * a warp would blunt the shape at the sizes it is drawn at. */
const BLOT_TURNS = 4
const BLOT_POSES = BLOT_TURNS * 2
const QUARTER_TURN = 90

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/** FNV-1a, in integer arithmetic and nothing borrowed from the platform, so a bot
 * keeps the shape it was drawn with across machines, browsers and restarts. */
const hash = (seed: string) => {
	let value = FNV_OFFSET
	for (let at = 0; at < seed.length; at += 1) {
		value ^= seed.charCodeAt(at)
		value = Math.imul(value, FNV_PRIME)
	}
	return value >>> 0
}

type BlotPose = {
	/** Quarter turns clockwise about the outline's centre. */
	turn: number
	mirrored: boolean
}

/** The pose a seed lands on. No seed is the pose the outline was authored in. */
const blotPose = (seed?: string): BlotPose => {
	const pose = seed ? hash(seed) % BLOT_POSES : 0
	return { turn: pose % BLOT_TURNS, mirrored: pose >= BLOT_TURNS }
}

/** That pose as an SVG transform, in the box the outline is authored in. */
const blotTransform = (seed?: string) => {
	const { turn, mirrored } = blotPose(seed)
	const mirror = mirrored
		? ` translate(${BLOT_CENTER_X * 2} 0) scale(-1 1)`
		: ""
	return `rotate(${turn * QUARTER_TURN} ${BLOT_CENTER_X} ${BLOT_CENTER_Y})${mirror}`
}

export {
	BLOT_BOX,
	BLOT_CENTER_X,
	BLOT_CENTER_Y,
	BLOT_PATH,
	BLOT_POSES,
	BLOT_TURNS,
	type BlotPose,
	blotPose,
	blotTransform,
}
