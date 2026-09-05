import type {
	Mission,
	MissionEvent,
	MissionEventKind,
} from "./mission-contract"

const A_MISSION: Mission = {
	id: "mission-1",
	originConversationId: "room-1",
	botId: "bot-1",
	threadConversationId: "thread-1",
	objective: "Ship the walls",
	ticket: {
		platform: "github",
		externalId: "OPE-32",
		url: "https://example.test/OPE-32",
		title: "Wake the bot",
	},
	tools: ["claude-code"],
	state: "working",
	openedAt: 1,
	closedAt: null,
}

export const aMission = (held: Partial<Mission> = {}): Mission => ({
	...A_MISSION,
	...held,
})

type MissionEventSeed = {
	kind: MissionEventKind
	source: string
	payload?: unknown
}

const aMissionEvent = (
	{ kind, source, payload = {} }: MissionEventSeed,
	position = 0,
): MissionEvent => ({
	id: `event-${position + 1}`,
	missionId: A_MISSION.id,
	kind,
	source,
	payload,
	createdAt: position + 1,
})

export const missionEvents = (seeds: MissionEventSeed[]): MissionEvent[] =>
	seeds.map(aMissionEvent)
