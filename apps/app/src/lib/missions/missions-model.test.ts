import { describe, expect, it } from "vitest"

import type {
	Mission,
	MissionEvent,
	MissionState,
} from "./mission-contract"
import { toMissionEventModels, toMissionRows } from "./missions-model"

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
