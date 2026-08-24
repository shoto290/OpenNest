import { round2 } from "@workspace/ui/components/bot-avatar-3d"
import {
	flattenPath,
	outlineBounds,
} from "@workspace/ui/components/bot-avatar-silhouette"

const BLOT_PATH =
	"M118,6 C152,0 180,18 189,48 C196,72 174,86 178,104 C182,122 202,130 195,151 C187,175 158,191 130,193 C102,195 80,180 58,175 C28,168 7,147 8,115 C9,85 23,58 39,38 C57,15 86,12 118,6 Z"

const BLOT_BOX = 200

const [BLOT_CENTER_X, BLOT_CENTER_Y] = outlineBounds(
	flattenPath(BLOT_PATH),
).center.map(round2)

const BLOT_TURNS = 4
const BLOT_POSES = BLOT_TURNS * 2
const QUARTER_TURN = 90

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

const hash = (seed: string) => {
	let value = FNV_OFFSET
	for (let at = 0; at < seed.length; at += 1) {
		value ^= seed.charCodeAt(at)
		value = Math.imul(value, FNV_PRIME)
	}
	return value >>> 0
}

type BlotPose = {
	turn: number
	mirrored: boolean
}

const blotPose = (seed?: string): BlotPose => {
	const pose = seed ? hash(seed) % BLOT_POSES : 0
	return { turn: pose % BLOT_TURNS, mirrored: pose >= BLOT_TURNS }
}

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
