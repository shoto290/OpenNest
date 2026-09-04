import type { BotBadge } from "@workspace/ui/components/badge"
import type { BotIdentityAvatarProps } from "@workspace/ui/components/bot-identity-avatar"

type MissionEventKind =
	| "opened"
	| "note"
	| "agent_asked"
	| "answered"
	| "escalated"
	| "ready"
	| "failed"
	| "closed"

type MissionState =
	| "working"
	| "waiting_bot"
	| "waiting_human"
	| "ready_to_merge"
	| "failed"
	| "done"

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
	type MissionBot,
	type MissionEventKind,
	type MissionEventModel,
	type MissionState,
	type MissionTicket,
	missionBadgeFor,
}
