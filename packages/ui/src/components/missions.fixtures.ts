import type {
	MissionBot,
	MissionEventModel,
	MissionTicket,
} from "@workspace/ui/components/mission"
import type { MissionCardModel } from "@workspace/ui/components/mission-card"
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


export const MISSION_NOW = new Date("2026-03-04T09:30:00Z").getTime()

const minutesBefore = (minutes: number) => MISSION_NOW - minutes * 60_000

export const MISSION_BOT: MissionBot = {
	name: "Ada Martin",
	animal: "owl",
	seed: "bot-ada-martin",
}

export const MISSION_TICKET: MissionTicket = {
	externalId: "OPE-30",
	title: "Mission thread screen and mission card in the origin",
}

export const MISSION_TOOLS = ["Repository", "Terminal", "Web search"]

export const MISSION_EVENTS: MissionEventModel[] = [
	{
		id: "event-opened",
		kind: "opened",
		source: "claude-code",
		createdAt: minutesBefore(48),
	},
	{
		id: "event-note",
		kind: "note",
		source: "claude-code",
		createdAt: minutesBefore(41),
		text: "Read the Rust contract and mirrored every kind and every state before touching a pixel.",
	},
	{
		id: "event-agent-asked",
		kind: "agent_asked",
		source: "claude-code",
		createdAt: minutesBefore(33),
	},
	{
		id: "event-answered",
		kind: "answered",
		source: "claude-code",
		createdAt: minutesBefore(30),
	},
	{
		id: "event-escalated",
		kind: "escalated",
		source: "claude-code",
		createdAt: minutesBefore(12),
		text: "The payload carries no field this design can trust yet. Which one names the ticket?",
	},
	{
		id: "event-ready",
		kind: "ready",
		source: "claude-code",
		createdAt: minutesBefore(6),
	},
	{
		id: "event-failed",
		kind: "failed",
		source: "claude-code",
		createdAt: minutesBefore(4),
	},
	{
		id: "event-closed",
		kind: "closed",
		source: "claude-code",
		createdAt: minutesBefore(1),
	},
]

export const WAITING_MISSION_CARD: MissionCardModel = {
	id: "mission-ope-30",
	bot: MISSION_BOT,
	objective:
		"Ship the mission thread and the card that summarises it in the conversation it came from.",
	ticket: MISSION_TICKET,
	state: "waiting_human",
	isClosed: false,
}

export const CLOSED_MISSION_CARD: MissionCardModel = {
	id: "mission-ope-25",
	bot: {
		name: "Noor Beltran",
		animal: "rabbit",
		seed: "bot-noor-beltran",
	},
	objective:
		"Store a mission, its thread, its events and the commands over them.",
	ticket: {
		externalId: "OPE-25",
		title: "Mission storage and its command surface",
	},
	state: "done",
	isClosed: true,
}
