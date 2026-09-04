import { describe, expect, it } from "vitest"

import type { Mission } from "./mission-contract"
import { placeMissions } from "./mission-transcript"

import type { TranscriptRow } from "@/lib/chat/screen-model"

const rowOf = (
	authorBotId: string | null,
	timestamp: number,
): TranscriptRow => ({
	messageId: `m-${timestamp}`,
	turnId: `t-${timestamp}`,
	blockIndex: 0,
	quotedMessageId: null,
	authorBotId,
	role: authorBotId ? "assistant" : "user",
	text: "said",
	timestamp,
	completion: "complete",
})

const missionOf = (id: string, openedAt: number, botId = "bot-1"): Mission => ({
	id,
	originConversationId: "c-1",
	botId,
	threadConversationId: `c-${id}`,
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "working",
	openedAt,
	closedAt: null,
})

const PROMPT = [rowOf(null, 0)]
const ANSWER = [rowOf("bot-1", 100)]
const LATER_PROMPT = [rowOf(null, 400)]

describe("placeMissions", () => {
	it("places a mission after the run of the bot that opened it", () => {
		expect(
			placeMissions([PROMPT, ANSWER, LATER_PROMPT], [missionOf("m-1", 200)]),
		).toEqual([{ mission: missionOf("m-1", 200), runIndex: 1 }])
	})

	it("orders the missions opened in the same run by the time they were opened", () => {
		const placed = placeMissions(
			[PROMPT, ANSWER],
			[missionOf("m-late", 300), missionOf("m-early", 200)],
		)

		expect(placed.map(({ mission }) => mission.id)).toEqual([
			"m-early",
			"m-late",
		])
	})

	it("holds a mission whose run has published no block yet", () => {
		expect(placeMissions([PROMPT], [missionOf("m-1", 200)])).toEqual([])
	})

	it("holds a mission opened by a bot that did not speak last", () => {
		expect(
			placeMissions([PROMPT, ANSWER], [missionOf("m-1", 200, "bot-2")]),
		).toEqual([])
	})

	it("holds every mission of a transcript with no run", () => {
		expect(placeMissions([], [missionOf("m-1", 200)])).toEqual([])
	})
})
