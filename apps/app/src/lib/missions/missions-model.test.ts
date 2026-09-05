import { describe, expect, it } from "vitest"

import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"

import type {
	Mission,
	MissionEvent,
	MissionOnBoard,
	MissionState,
} from "./mission-contract"
import {
	missionRingBadges,
	missionsByBot,
	toMissionEventModels,
	toMissionRows,
	withMissions,
} from "./missions-model"

import type { Bot } from "@/lib/conversations/store-contract"

const missionIn = (state: MissionState): Mission => ({
	id: `m-${state}`,
	originConversationId: "c-1",
	botId: "b-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read", "Write"],
	state,
	openedAt: 1_700_000_000_000,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
})

describe("toMissionRows", () => {
	it("reads a mission as the ticket, the tools and the time its row shows", () => {
		expect(toMissionRows([missionIn("working")])).toEqual([
			{
				id: "m-working",
				objective: "Rewrite the changelog parser",
				ticketId: "OPE-42",
				tools: ["Read", "Write"],
				openedAt: 1_700_000_000_000,
				badge: null,
			},
		])
	})

	it("badges only the missions a reader has something to do about", () => {
		const badges = (
			[
				"working",
				"waiting_bot",
				"waiting_human",
				"ready_to_merge",
				"failed",
				"done",
			] as const
		).map((state) => toMissionRows([missionIn(state)])[0]?.badge)

		expect(badges).toEqual([null, null, "attention", "done", "failed", null])
	})
})

const EVENT: MissionEvent = {
	id: "e-1",
	missionId: "m-1",
	kind: "note",
	source: "claude-code",
	payload: null,
	createdAt: 1_700_000_000_000,
}

it("lets an event speak when its payload holds a text string", () => {
	const [model] = toMissionEventModels([
		{ ...EVENT, payload: { text: "The branch is pushed." } },
	])

	expect(model?.text).toBe("The branch is pushed.")
})

it("keeps an event silent when its payload holds no text", () => {
	const models = toMissionEventModels([
		EVENT,
		{ ...EVENT, id: "e-2", payload: {} },
		{ ...EVENT, id: "e-3", payload: { text: 42 } },
		{ ...EVENT, id: "e-4", payload: "The branch is pushed." },
	])

	expect(models.map(({ text }) => text)).toEqual([
		undefined,
		undefined,
		undefined,
		undefined,
	])
})

it("carries the kind, the source and the time of every event", () => {
	expect(toMissionEventModels([EVENT])).toEqual([
		{
			id: "e-1",
			kind: "note",
			source: "claude-code",
			createdAt: 1_700_000_000_000,
			text: undefined,
		},
	])
})

const mission = (over: Partial<Mission>): Mission => ({
	id: "m-1",
	originConversationId: "c-1",
	botId: "b-1",
	threadConversationId: "t-1",
	objective: "Drive every roster line from its mission.",
	ticket: {
		platform: "linear",
		externalId: "OPE-29",
		url: "https://linear.app/ope-29",
		title: "Roster line driven by mission state",
	},
	tools: [],
	state: "working",
	openedAt: 1,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	...over,
})

const bot = (id: string): Bot => ({
	id,
	name: "Atlas",
	title: "",
	model: "sonnet",
	avatarAnimal: "owl",
	avatarBlot: "blue",
	avatarImagePath: null,
	workingDir: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

const onBoard = (over: Partial<Mission>): MissionOnBoard => {
	const held = mission(over)
	return { mission: held, bot: bot(held.botId) }
}

const row = (over: Partial<AppSidebarBot>): AppSidebarBot => ({
	id: "b-1",
	name: "Atlas",
	title: "Research",
	lastMessage: "Pulled the three papers.",
	timestamp: "3m",
	...over,
})

const chipFor = (...states: MissionState[]) =>
	missionsByBot(states.map((state) => onBoard({ state })))["b-1"]

describe("missionsByBot", () => {
	it("counts every open mission a bot carries", () => {
		expect(chipFor("working")).toEqual({ state: "working", count: 1 })
		expect(chipFor("working", "working", "ready_to_merge")).toEqual({
			state: "ready",
			count: 3,
		})
	})

	it("shows the most urgent state of the bot", () => {
		expect(chipFor("working", "failed", "waiting_human").state).toBe("waiting")
		expect(chipFor("working", "ready_to_merge", "failed").state).toBe("failed")
		expect(chipFor("working", "ready_to_merge").state).toBe("ready")
	})

	it("reads waiting for its bot as working", () => {
		expect(chipFor("waiting_bot")).toEqual({ state: "working", count: 1 })
	})

	it("gives every bot its own chip", () => {
		expect(
			missionsByBot([
				onBoard({ botId: "b-1", state: "failed" }),
				onBoard({ botId: "b-2", state: "working" }),
				onBoard({ botId: "b-2", state: "working" }),
			]),
		).toEqual({
			"b-1": { state: "failed", count: 1 },
			"b-2": { state: "working", count: 2 },
		})
	})
})

describe("withMissions", () => {
	const held = row({ badge: "attention", status: "working", pose: "writing" })

	it("leaves the chat signals of the row untouched", () => {
		const carried = withMissions([held], {
			"b-1": { state: "waiting", count: 2 },
		})[0]

		expect(carried).toMatchObject({
			badge: "attention",
			title: "Research",
			lastMessage: "Pulled the three papers.",
			timestamp: "3m",
			status: "working",
			mission: { state: "waiting", count: 2 },
		})
	})

	it("leaves a row without a mission exactly as it reads", () => {
		expect(withMissions([held], {})).toEqual([held])
	})
})

const MISSION_STATES: MissionState[] = [
	"working",
	"waiting_bot",
	"waiting_human",
	"ready_to_merge",
	"failed",
	"done",
]

describe("mission badges", () => {
	it("says the same thing on a roster ring as on a panel row", () => {
		for (const state of MISSION_STATES) {
			const chip = missionsByBot([onBoard({ state })])["b-1"]
			const ring = chip
				? missionRingBadges({ work: [row({ mission: chip })] }).work[0].badge
				: undefined

			expect(ring ?? null).toBe(toMissionRows([mission({ state })])[0].badge)
		}
	})
})

describe("missionRingBadges", () => {
	const ringOf = (mission?: AppSidebarBot["mission"]) =>
		missionRingBadges({ work: [row({ mission })] }).work[0].badge

	it("lights the ring for a mission a person has to answer", () => {
		expect(ringOf({ state: "waiting", count: 1 })).toBe("attention")
		expect(ringOf({ state: "failed", count: 1 })).toBe("failed")
		expect(ringOf({ state: "ready", count: 1 })).toBe("done")
	})

	it("leaves the ring dark for a mission that is still moving", () => {
		expect(ringOf({ state: "working", count: 1 })).toBeUndefined()
		expect(ringOf(undefined)).toBeUndefined()
	})
})
