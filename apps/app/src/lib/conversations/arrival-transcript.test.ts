import { describe, expect, it } from "vitest"

import { placeArrivals } from "./arrival-transcript"
import type { CompanionArrival } from "./transcript-contract"
import { message } from "./transcript-fixtures"

import { type TranscriptRow, toTranscriptRows } from "@/lib/chat/screen-model"
import { BEFORE_FIRST_RUN } from "@/lib/missions/mission-transcript"

const said = (seq: number) => message({ id: `m-${seq}`, seq, content: "said" })

const runOf = (...seqs: number[]): TranscriptRow[] =>
	toTranscriptRows(seqs.map(said))

const arrivalOf = (id: string, lastMessageSeq: number): CompanionArrival => ({
	id,
	conversationId: "c-1",
	botId: "bot-2",
	invitedByBotId: null,
	lastMessageSeq,
	createdAt: 0,
})

const MESSAGES = [said(3), said(4), said(5), said(6)]

const RUNS = [runOf(3, 4), runOf(5), runOf(6)]

const placedOf = (arrivals: CompanionArrival[], hasOlder = false) =>
	placeArrivals({ runs: RUNS, messages: MESSAGES, arrivals, hasOlder }).map(
		({ arrival, runIndex }) => [arrival.id, runIndex],
	)

describe("placeArrivals", () => {
	it("places an arrival after the last run whose newest message it follows", () => {
		expect(placedOf([arrivalOf("a-1", 4), arrivalOf("a-2", 5)])).toEqual([
			["a-1", 0],
			["a-2", 1],
		])
	})

	it("keeps an arrival sitting inside a run after that run's predecessor", () => {
		expect(placedOf([arrivalOf("a-1", 3)])).toEqual([["a-1", BEFORE_FIRST_RUN]])
	})

	it("places an arrival no run precedes before the first run", () => {
		expect(placedOf([arrivalOf("a-1", 0)])).toEqual([["a-1", BEFORE_FIRST_RUN]])
	})

	it("places an arrival past every run after the last run", () => {
		expect(placedOf([arrivalOf("a-1", 9)])).toEqual([["a-1", 2]])
	})

	it("keeps the order the conversation holds for arrivals after the same run", () => {
		expect(placedOf([arrivalOf("b", 5), arrivalOf("a", 5)])).toEqual([
			["b", 1],
			["a", 1],
		])
	})

	it("leaves out an arrival below the oldest message while older ones are unloaded", () => {
		expect(placedOf([arrivalOf("a-1", 2), arrivalOf("a-2", 3)], true)).toEqual([
			["a-2", BEFORE_FIRST_RUN],
		])
	})

	it("places an arrival of a conversation holding no message before the first run", () => {
		expect(
			placeArrivals({
				runs: [],
				messages: [],
				arrivals: [arrivalOf("a-1", 0)],
				hasOlder: false,
			}),
		).toEqual([{ arrival: arrivalOf("a-1", 0), runIndex: BEFORE_FIRST_RUN }])
	})
})
