import type { MissionRowModel } from "@workspace/ui/components/mission-row"

export const MISSIONS_READ_AT = Date.parse("2026-03-04T09:30:00Z")

export const WORKING_MISSION: MissionRowModel = {
	id: "mission-parser",
	objective: "Rewrite the changelog parser",
	ticketId: "OPE-42",
	tools: ["Read", "Write"],
	openedAt: MISSIONS_READ_AT - 5_400_000,
	badge: null,
}

export const WAITING_HUMAN_MISSION: MissionRowModel = {
	id: "mission-migration",
	objective: "Migrate the run history table",
	ticketId: "OPE-51",
	tools: ["Read", "Bash"],
	openedAt: MISSIONS_READ_AT - 172_800_000,
	badge: "attention",
}

export const READY_MISSION: MissionRowModel = {
	id: "mission-badges",
	objective: "Draw the badge dots of the roster",
	ticketId: "OPE-29",
	tools: ["Read", "Write", "Bash"],
	openedAt: MISSIONS_READ_AT - 18_000_000,
	badge: "done",
}

export const FAILED_MISSION: MissionRowModel = {
	id: "mission-upgrade",
	objective: "Upgrade the desktop shell",
	ticketId: "OPE-17",
	tools: ["Bash"],
	openedAt: MISSIONS_READ_AT - 604_800_000,
	badge: "failed",
}

export const RUNNING_MISSIONS: MissionRowModel[] = [
	WAITING_HUMAN_MISSION,
	READY_MISSION,
	FAILED_MISSION,
	WORKING_MISSION,
]

export const CLOSED_MISSIONS: MissionRowModel[] = [
	{
		id: "mission-transcript",
		objective: "Store the transcript of a mission thread",
		ticketId: "OPE-25",
		tools: ["Read", "Write"],
		openedAt: MISSIONS_READ_AT - 1_209_600_000,
		badge: null,
	},
	{
		id: "mission-tools",
		objective: "Let a bot manage its routines through MCP",
		ticketId: "OPE-22",
		tools: ["Read", "Write", "Bash"],
		openedAt: MISSIONS_READ_AT - 2_592_000_000,
		badge: null,
	},
]

export const NO_MISSIONS: MissionRowModel[] = []
