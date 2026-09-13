import { clamp, type EulerAngles } from "@workspace/ui/components/bot-avatar-3d"

export const EAR_LAG = 70
export const EAR_YAW_DRAG_DEGREES = 3.2
export const EAR_PITCH_DRAG_DEGREES = 2
export const EAR_TWIST_LIMIT = 10
export const EAR_GAZE_LEAK_DEGREES = 0.12
export const EAR_GAZE_LEAK_LIMIT = 1.8

const REST: EulerAngles = { yaw: 0, pitch: 0, roll: 0 }

type HeadVelocity = { yaw: number; pitch: number }

export const earDrag = ({ yaw, pitch }: HeadVelocity) =>
	-(yaw * EAR_YAW_DRAG_DEGREES + pitch * EAR_PITCH_DRAG_DEGREES)

export const earGazeLeak = (gazeYaw: number) =>
	clamp(
		gazeYaw * EAR_GAZE_LEAK_DEGREES,
		-EAR_GAZE_LEAK_LIMIT,
		EAR_GAZE_LEAK_LIMIT,
	)

type EarTwist = { drag: number; leak: number; sway: number }

export const earTwist = ({ drag, leak, sway }: EarTwist) =>
	clamp(drag + leak + sway, -EAR_TWIST_LIMIT, EAR_TWIST_LIMIT)

export type BotAvatarPoseSample = { at: number; pose: EulerAngles }

export type BotAvatarPoseTrail = BotAvatarPoseSample[]

const between = (from: number, to: number, t: number) => from + (to - from) * t

export const laggedPose = (
	trail: BotAvatarPoseTrail,
	at: number,
): EulerAngles => {
	const when = at - EAR_LAG
	const oldest = trail[0]
	if (!oldest) return { ...REST }
	if (oldest.at >= when) return { ...oldest.pose }
	let index = 0
	while (index + 1 < trail.length && trail[index + 1].at <= when) index += 1
	const from = trail[index]
	const to = trail[index + 1]
	if (!to) return { ...from.pose }
	const span = to.at - from.at
	const travelled = span > 0 ? (when - from.at) / span : 1
	return {
		yaw: between(from.pose.yaw, to.pose.yaw, travelled),
		pitch: between(from.pose.pitch, to.pose.pitch, travelled),
		roll: between(from.pose.roll, to.pose.roll, travelled),
	}
}

export const trackPose = (
	trail: BotAvatarPoseTrail,
	at: number,
	pose: EulerAngles,
): BotAvatarPoseTrail => {
	trail.push({ at, pose: { ...pose } })
	while (trail.length > 2 && trail[1].at <= at - EAR_LAG) trail.shift()
	return trail
}
