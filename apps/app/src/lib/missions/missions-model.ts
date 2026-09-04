import type { BotBadge } from "@workspace/ui/components/badge"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import type { MissionRowModel } from "@workspace/ui/components/mission-row"

import type {
	Mission,
	MissionEvent,
	MissionState,
} from "./mission-contract"

const BADGE_BY_STATE: Record<MissionState, BotBadge | null> = {
	working: null,
	waiting_bot: null,
	waiting_human: "attention",
	ready_to_merge: "done",
	failed: "failed",
	done: null,
}

export const toMissionRows = (missions: Mission[]): MissionRowModel[] =>
	missions.map((mission) => ({
		id: mission.id,
		objective: mission.objective,
		ticketId: mission.ticket.externalId,
		tools: mission.tools,
		openedAt: mission.openedAt,
		badge: BADGE_BY_STATE[mission.state],
	}))

const spokenTextOf = (payload: unknown): string | undefined => {
	if (typeof payload !== "object" || payload === null) {
		return undefined
	}

	const { text } = payload as { text?: unknown }

	return typeof text === "string" ? text : undefined
}

export const toMissionEventModels = (
	events: MissionEvent[],
): MissionEventModel[] =>
	events.map((event) => ({
		id: event.id,
		kind: event.kind,
		source: event.source,
		createdAt: event.createdAt,
		text: spokenTextOf(event.payload),
	}))
