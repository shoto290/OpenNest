import type {
	AppSidebarBot,
	AppSidebarBotMission,
} from "@workspace/ui/components/app-sidebar"
import type { BotBadge, BotMissionState } from "@workspace/ui/components/badge"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import type { MissionRowModel } from "@workspace/ui/components/mission-row"

import type {
	Mission,
	MissionEvent,
	MissionOnBoard,
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

export type MissionsByBot = Record<string, AppSidebarBotMission>

export const NO_MISSIONS: MissionsByBot = {}

const CHIP_STATE_OF: Partial<Record<MissionState, BotMissionState>> = {
	waiting_human: "waiting",
	failed: "failed",
	ready_to_merge: "ready",
	working: "working",
	waiting_bot: "working",
}

const MOST_URGENT_FIRST: BotMissionState[] = [
	"waiting",
	"failed",
	"ready",
	"working",
]

const RING_BADGE_OF: Partial<Record<BotMissionState, BotBadge>> =
	Object.fromEntries(
		Object.entries(CHIP_STATE_OF).flatMap(([state, chip]) => {
			const badge = BADGE_BY_STATE[state as MissionState]
			return badge ? [[chip, badge]] : []
		}),
	)

const mostUrgent = (states: BotMissionState[]): BotMissionState =>
	MOST_URGENT_FIRST.find((state) => states.includes(state)) ?? "working"

export const missionsByBot = (board: MissionOnBoard[]): MissionsByBot => {
	const states: Record<string, BotMissionState[]> = {}
	for (const { mission } of board) {
		const state = CHIP_STATE_OF[mission.state]
		if (state) {
			states[mission.botId] = [...(states[mission.botId] ?? []), state]
		}
	}

	return Object.fromEntries(
		Object.entries(states).map(([botId, held]) => [
			botId,
			{ state: mostUrgent(held), count: held.length },
		]),
	)
}

export const withMissions = <Row extends AppSidebarBot>(
	rows: Row[],
	missions: MissionsByBot,
): Row[] =>
	rows.map((row) =>
		missions[row.id] ? { ...row, mission: missions[row.id] } : row,
	)

export const missionRingBadges = (
	rowsBySpaceId: Record<string, AppSidebarBot[]>,
): Record<string, { badge?: BotBadge }[]> =>
	Object.fromEntries(
		Object.entries(rowsBySpaceId).map(([spaceId, rows]) => [
			spaceId,
			rows.map((row) => ({
				badge: row.mission && RING_BADGE_OF[row.mission.state],
			})),
		]),
	)
