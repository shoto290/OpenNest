import { describe, expect, it } from "vitest"

import {
	emptyQueue,
	type Handover,
	handedOver,
	loopingPairIn,
	openedWave,
	reopenedFor,
	type Summons,
} from "./turn-queue"

const SAID = "m-1"

const summons = (botId: string, promptId = SAID): Summons => ({
	botId,
	promptId,
})

const opened = (botIds: string[]) =>
	reopenedFor(
		emptyQueue,
		botIds.map((botId) => summons(botId)),
	)

const waitingIn = (queue: { waiting: Summons[] }) =>
	queue.waiting.map(({ botId }) => botId)

const waveIn = (queue: { wave: Summons[] }) =>
	queue.wave.map(({ botId }) => botId)

const handover = (from: string, to: string): Handover => ({ from, to })

describe("openedWave", () => {
	it("takes every bot held, in the order they were named", () => {
		const queue = openedWave(opened(["ada", "nyx"]))
		expect(waveIn(queue)).toEqual(["ada", "nyx"])
		expect(queue.waiting).toEqual([])
	})

	it("leaves the queue alone when no bot is held", () => {
		const running = openedWave(opened(["ada"]))
		expect(openedWave(running)).toBe(running)
	})
})

describe("handedOver", () => {
	it("holds the bot named for the next wave, pointed at the message that named it", () => {
		const queue = handedOver(
			openedWave(opened(["ada"])),
			"ada",
			summons("nyx", "m-said-by-ada"),
		)
		expect(queue.waiting).toEqual([{ botId: "nyx", promptId: "m-said-by-ada" }])
	})

	it("leaves a bot already held where it is", () => {
		const queue = handedOver(opened(["ada", "nyx"]), "ada", summons("nyx"))
		expect(waitingIn(queue)).toEqual(["ada", "nyx"])
		expect(queue.handovers).toEqual([])
	})

	it("ignores a bot already running in the open wave", () => {
		const queue = handedOver(
			openedWave(opened(["ada", "nyx"])),
			"ada",
			summons("nyx"),
		)
		expect(queue.waiting).toEqual([])
		expect(queue.handovers).toEqual([])
	})

	it("ignores a bot naming itself", () => {
		const queue = handedOver(openedWave(opened(["ada"])), "ada", summons("ada"))
		expect(queue.waiting).toEqual([])
	})
})

describe("reopenedFor", () => {
	it("drops those held and leaves the open wave in flight", () => {
		const running = openedWave(opened(["ada", "nyx", "iris"]))
		const queue = reopenedFor(running, [])
		expect(waveIn(queue)).toEqual(["ada", "nyx", "iris"])
		expect(queue.waiting).toEqual([])
	})

	it("keeps the open wave and holds the ones newly named", () => {
		const running = openedWave(opened(["ada", "nyx"]))
		const queue = reopenedFor(running, [summons("iris")])
		expect(waveIn(queue)).toEqual(["ada", "nyx"])
		expect(waitingIn(queue)).toEqual(["iris"])
		expect(queue.handovers).toEqual([])
	})
})

describe("loopingPairIn", () => {
	it("names the two bots that kept handing the turn to each other", () => {
		expect(
			loopingPairIn([
				handover("ada", "nyx"),
				handover("nyx", "ada"),
				handover("ada", "nyx"),
			]),
		).toEqual(["ada", "nyx"])
	})

	it("stays quiet below the count", () => {
		expect(
			loopingPairIn([handover("ada", "nyx"), handover("nyx", "ada")]),
		).toBeNull()
	})

	it("stays quiet when a third bot broke the run", () => {
		expect(
			loopingPairIn([
				handover("ada", "nyx"),
				handover("nyx", "iris"),
				handover("iris", "ada"),
			]),
		).toBeNull()
	})

	it("counts only the run that reaches the end", () => {
		expect(
			loopingPairIn([
				handover("ada", "nyx"),
				handover("nyx", "ada"),
				handover("ada", "iris"),
				handover("iris", "ada"),
			]),
		).toBeNull()
	})
})
