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
	reportedAt: null,
	reportedTurnId: null,
})

const PROMPT = [rowOf(null, 0)]
const ANSWER = [rowOf("bot-1", 100)]
const LATER_PROMPT = [rowOf(null, 400)]
const LATER_ANSWER = [rowOf("bot-1", 500)]

describe("placeMissions", () => {
	const RUNS = [PROMPT, ANSWER, LATER_PROMPT, LATER_ANSWER]

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

	it("places a mission on the run of its bot opening nearest to it", () => {
		expect(placeMissions(RUNS, [missionOf("m-1", 50)])).toEqual([
			{ mission: missionOf("m-1", 50), runIndex: 1 },
		])
	})

	it("places a mission opened shortly before a later run of its bot on that run", () => {
		expect(placeMissions(RUNS, [missionOf("m-1", 450)])).toEqual([
			{ mission: missionOf("m-1", 450), runIndex: 3 },
		])
	})

	it("places a mission opened halfway between two runs of its bot on the later one", () => {
		expect(placeMissions(RUNS, [missionOf("m-1", 300)])).toEqual([
			{ mission: missionOf("m-1", 300), runIndex: 3 },
		])
	})

	it("holds a mission of a bot the transcript carries no run of", () => {
		expect(
			placeMissions([PROMPT, ANSWER], [missionOf("m-1", 200, "bot-2")]),
		).toEqual([])
	})

	it("holds every mission of a transcript with no run at all", () => {
		expect(placeMissions([], [missionOf("m-1", 200)])).toEqual([])
	})
})
