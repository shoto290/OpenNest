import type { BotBadge } from "@workspace/ui/components/badge"
import type { BotIdentityAvatarProps } from "@workspace/ui/components/bot-identity-avatar"

const MISSION_EVENT_KINDS = [
	"opened",
	"note",
	"agent_asked",
	"answered",
	"escalated",
	"ready",
	"failed",
	"closed",
] as const

type MissionEventKind = (typeof MISSION_EVENT_KINDS)[number]

const MISSION_STATES = [
	"working",
	"waiting_bot",
	"waiting_human",
	"ready_to_merge",
	"failed",
	"done",
] as const

type MissionState = (typeof MISSION_STATES)[number]

const MISSION_AVATAR_SIZE = 32

type MissionBot = Pick<
	BotIdentityAvatarProps,
	"animal" | "blot" | "image" | "seed"
> & { name: string }

type MissionTicket = {
	externalId: string
	title: string
}

type MissionEventModel = {
	id: string
	kind: MissionEventKind
	source: string
	createdAt: number
	text?: string
}

const missionBadgeFor = (state: MissionState): BotBadge | undefined =>
	state === "waiting_human" ? "attention" : undefined

export {
	MISSION_AVATAR_SIZE,
	MISSION_EVENT_KINDS,
	MISSION_STATES,
	type MissionBot,
	type MissionEventKind,
	type MissionEventModel,
	type MissionState,
	type MissionTicket,
	missionBadgeFor,
}
