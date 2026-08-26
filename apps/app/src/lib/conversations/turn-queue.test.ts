import { describe, expect, it } from "vitest"

import {
	closedSpeaker,
	emptyQueue,
	type Handover,
	handedOver,
	loopingPairIn,
	reopenedFor,
	type Summons,
	startedNext,
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

const handover = (from: string, to: string): Handover => ({ from, to })

describe("startedNext", () => {
	it("takes the bot at the head of the queue", () => {
		const queue = startedNext(opened(["ada", "nyx"]))
		expect(queue.speaking?.botId).toBe("ada")
		expect(waitingIn(queue)).toEqual(["nyx"])
	})

	it("leaves the queue alone while a bot is speaking", () => {
		const running = startedNext(opened(["ada", "nyx"]))
		expect(startedNext(running)).toBe(running)
	})
})

describe("handedOver", () => {
	it("puts the bot named at the end of the same turn, pointed at the message that named it", () => {
		const queue = handedOver(
			startedNext(opened(["ada"])),
			"ada",
			summons("nyx", "m-said-by-ada"),
		)
		expect(queue.waiting).toEqual([{ botId: "nyx", promptId: "m-said-by-ada" }])
	})

	it("leaves a bot already waiting where it is", () => {
		const queue = handedOver(opened(["ada", "nyx"]), "ada", summons("nyx"))
		expect(waitingIn(queue)).toEqual(["ada", "nyx"])
		expect(queue.handovers).toEqual([])
	})

	it("ignores a bot naming itself", () => {
		const queue = handedOver(opened([]), "ada", summons("ada"))
		expect(queue.waiting).toEqual([])
	})
})

describe("reopenedFor", () => {
	it("drops those waiting and leaves the one in flight", () => {
		const running = startedNext(opened(["ada", "nyx", "iris"]))
		const queue = reopenedFor(running, [])
		expect(queue.speaking?.botId).toBe("ada")
		expect(queue.waiting).toEqual([])
	})

	it("keeps the bot in flight and queues the ones newly named", () => {
		const running = startedNext(opened(["ada", "nyx"]))
		const queue = reopenedFor(running, [summons("iris")])
		expect(queue.speaking?.botId).toBe("ada")
		expect(waitingIn(queue)).toEqual(["iris"])
		expect(queue.handovers).toEqual([])
	})
})

describe("closedSpeaker", () => {
	it("lets go of the bot that stopped writing", () => {
		expect(closedSpeaker(startedNext(opened(["ada"]))).speaking).toBeNull()
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
