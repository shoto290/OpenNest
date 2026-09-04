import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import type { BotBadge } from "@workspace/ui/components/badge"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import type { MissionRowModel } from "@workspace/ui/components/mission-row"

import type {
	Mission,
	MissionEvent,
	MissionOnBoard,
	MissionState,
} from "./mission-contract"

import { rosterTimestamp } from "../bots/roster-timestamp"
import { strongerBadge } from "../chat/sidebar-badges"

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

export type DrivingMissions = Record<string, Mission>

export const NO_MISSIONS: DrivingMissions = {}

const DRIVING_RANK: Record<MissionState, number> = {
	waiting_human: 0,
	failed: 1,
	ready_to_merge: 2,
	working: 3,
	waiting_bot: 3,
	done: 4,
}

const BADGE_OF: Partial<Record<MissionState, BotBadge>> = {
	waiting_human: "attention",
	ready_to_merge: "done",
	failed: "failed",
}

const isBotTurn = (state: MissionState) =>
	state === "working" || state === "waiting_bot"

const drives = (mission: Mission, held: Mission | undefined) =>
	held === undefined || DRIVING_RANK[mission.state] < DRIVING_RANK[held.state]

export const drivingMissions = (board: MissionOnBoard[]): DrivingMissions => {
	const driving: DrivingMissions = {}
	for (const { mission } of board) {
		if (drives(mission, driving[mission.botId])) {
			driving[mission.botId] = mission
		}
	}
	return driving
}

const drivenBy = <Row extends AppSidebarBot>(
	row: Row,
	mission: Mission | undefined,
	now: number,
): Row =>
	mission
		? {
				...row,
				title: mission.ticket.externalId,
				lastMessage: mission.objective,
				timestamp: rosterTimestamp(mission.openedAt, now),
				status: isBotTurn(mission.state) ? "onMission" : "idle",
				badge: strongerBadge(row.badge, BADGE_OF[mission.state]),
			}
		: row

export const withMissions = <Row extends AppSidebarBot>(
	rows: Row[],
	driving: DrivingMissions,
	now: number,
): Row[] => {
	const isRaised = (row: Row) =>
		driving[row.id]?.state === "waiting_human" && row.pinPosition == null
	const driven = rows.map((row) => drivenBy(row, driving[row.id], now))

	return [...driven.filter(isRaised), ...driven.filter((row) => !isRaised(row))]
}
