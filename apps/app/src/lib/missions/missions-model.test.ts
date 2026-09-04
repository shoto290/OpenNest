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
	drivingMissions,
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
	openedAt: NOW - 2 * HOUR_MS,
	closedAt: null,
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

const drivenIds = (board: MissionOnBoard[]) =>
	Object.entries(drivingMissions(board)).map(([botId, held]) => [
		botId,
		held.id,
	])

describe("drivingMissions", () => {
	it("keeps the mission whose state ranks first", () => {
		expect(
			drivenIds([
				onBoard({ id: "m-working", state: "working" }),
				onBoard({ id: "m-ready", state: "ready_to_merge" }),
				onBoard({ id: "m-waiting", state: "waiting_human" }),
				onBoard({ id: "m-failed", state: "failed" }),
			]),
		).toEqual([["b-1", "m-waiting"]])
	})

	it("ranks failed over ready to merge and ready to merge over working", () => {
		expect(
			drivenIds([
				onBoard({ id: "m-working", state: "working" }),
				onBoard({ id: "m-ready", state: "ready_to_merge" }),
				onBoard({ id: "m-failed", state: "failed" }),
			]),
		).toEqual([["b-1", "m-failed"]])

		expect(
			drivenIds([
				onBoard({ id: "m-waiting-bot", state: "waiting_bot" }),
				onBoard({ id: "m-ready", state: "ready_to_merge" }),
			]),
		).toEqual([["b-1", "m-ready"]])
	})

	it("drives every bot of every space from its own mission", () => {
		expect(
			drivenIds([
				onBoard({ id: "m-one", botId: "b-1" }),
				onBoard({ id: "m-two", botId: "b-2" }),
			]),
		).toEqual([
			["b-1", "m-one"],
			["b-2", "m-two"],
		])
	})
})

describe("withMissions", () => {
	const lineFor = (state: MissionState) =>
		withMissions([row({})], { "b-1": mission({ state }) }, NOW)[0]

	it("fills the pill, the preview and the timestamp from the mission", () => {
		expect(lineFor("waiting_human")).toMatchObject({
			title: "OPE-29",
			lastMessage: "Drive every roster line from its mission.",
			timestamp: "2h",
		})
	})

	it("carries the badge its mission state calls for", () => {
		expect(lineFor("waiting_human").badge).toBe("attention")
		expect(lineFor("ready_to_merge").badge).toBe("done")
		expect(lineFor("failed").badge).toBe("failed")
		expect(lineFor("working").badge).toBeUndefined()
		expect(lineFor("waiting_bot").badge).toBeUndefined()
	})

	const badgeUnder = (state: MissionState, held: AppSidebarBot["badge"]) =>
		withMissions([row({ badge: held })], { "b-1": mission({ state }) }, NOW)[0]
			.badge

	it("keeps the chat badge when its mission carries none", () => {
		expect(badgeUnder("working", "attention")).toBe("attention")
		expect(badgeUnder("waiting_bot", "done")).toBe("done")
	})

	it("shows the stronger of the chat badge and the mission badge", () => {
		expect(badgeUnder("waiting_human", "done")).toBe("attention")
		expect(badgeUnder("ready_to_merge", "attention")).toBe("attention")
		expect(badgeUnder("failed", "done")).toBe("failed")
	})

	it("shows the mission badge when the chat carries none", () => {
		expect(badgeUnder("waiting_human", undefined)).toBe("attention")
		expect(badgeUnder("working", undefined)).toBeUndefined()
	})

	it("shimmers the line its mission still moves", () => {
		expect(lineFor("working").status).toBe("onMission")
		expect(lineFor("waiting_bot").status).toBe("onMission")
		expect(lineFor("waiting_human").status).toBe("idle")
	})

	it("leaves a line without a mission exactly as it reads", () => {
		const held = row({ id: "b-2", status: "working", badge: "done" })

		expect(withMissions([held], {}, NOW)).toEqual([held])
	})

	it("raises a line waiting for a human above the lines without a mission", () => {
		const rows = [row({ id: "b-2" }), row({ id: "b-1" }), row({ id: "b-3" })]

		expect(
			withMissions(
				rows,
				{ "b-1": mission({ state: "waiting_human" }) },
				NOW,
			).map((held) => held.id),
		).toEqual(["b-1", "b-2", "b-3"])
	})

	it("leaves the order of the pinned lines untouched", () => {
		const rows = [
			row({ id: "b-2", pinPosition: 0 }),
			row({ id: "b-1", pinPosition: 1 }),
			row({ id: "b-3", pinPosition: 2 }),
		]

		expect(
			withMissions(
				rows,
				{ "b-1": mission({ state: "waiting_human" }) },
				NOW,
			).map((held) => held.id),
		).toEqual(["b-2", "b-1", "b-3"])
	})
})
