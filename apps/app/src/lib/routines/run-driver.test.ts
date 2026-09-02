import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeRunPort, type FakeRunPort } from "./fake-run-port"
import type { RunCause, RunRequested } from "./routine-contract"
import { LEASE_INTERVAL_MS, startRunDriver } from "./run-driver"

import type { RuntimeScope, TurnEnded } from "../agent/contract"
import type { ConversationState } from "../conversations/conversation-controller"
import { createConversationRuntimes } from "../conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "../conversations/scripted-driver"
import type { Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { seatBots } from "../conversations/transcript-fixtures"

const SPACE = "personal"

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

type Started = {
	scope: RuntimeScope
	outputSchema?: Record<string, unknown>
}

type Harness = {
	driver: ScriptedDriver
	store: TranscriptStore
	runs: FakeRunPort
	starts: Started[]
	conversation: Conversation
	botId: string
	stop: () => void
	requested: (cause?: RunCause) => RunRequested
	state: () => ConversationState
	shown: () => [string | null, string][]
	endTurn: (ended: Partial<TurnEnded>) => Promise<void>
	openOnScreen: () => Promise<void>
}

const createHarness = async (
	overrides: Partial<TranscriptStore> = {},
): Promise<Harness> => {
	const scripted = createScriptedDriver()
	const starts: Started[] = []
	const driver: ScriptedDriver = {
		...scripted,
		startOrResumeSession: (scope, resume, cwd, outputSchema) => {
			starts.push({ scope, outputSchema })
			return scripted.startOrResumeSession(scope, resume, cwd, outputSchema)
		},
	}
	const store: TranscriptStore = {
		...createFakeTranscriptStore(),
		...overrides,
	}
	const [bot] = await seatBots(store, SPACE, ["Ada"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [bot.id],
	})
	const runtimes = createConversationRuntimes(driver, store)
	const runs = createFakeRunPort()
	const stop = startRunDriver({ driver, store, runtimes, runs, now: () => 7 })
	await settled()

	const requested = (cause: RunCause = "trigger"): RunRequested => ({
		cause,
		title: "Nightly report",
		instruction: "Read the shift log and report what changed.",
		routineId: "r-1",
		runId: "run-1",
		botId: bot.id,
		conversationId: conversation.id,
		triggerSourceId: "schedule",
		payload: { issue: "PROJ-12", state: "closed" },
	})

	const endTurn = async (ended: Partial<TurnEnded>) => {
		const start = starts.at(-1)
		if (!start) {
			throw new Error("no run session was opened")
		}
		driver.emit(start.scope, {
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed", ...ended },
		})
		await settled()
	}

	const openOnScreen = async () => {
		await runtimes.runtimeFor(conversation.id).open(conversation)
		await settled()
	}

	const state = () => runtimes.runtimeFor(conversation.id).getState()

	const shown = () =>
		state().messages.map(
			({ authorBotId, content }) =>
				[authorBotId, content] as [string | null, string],
		)

	return {
		driver,
		store,
		runs,
		starts,
		conversation,
		botId: bot.id,
		stop,
		requested,
		state,
		shown,
		endTurn,
		openOnScreen,
	}
}

const reported = (report: string): Partial<TurnEnded> => ({
	structuredOutput: { outcome: "report", report },
})

describe("startRunDriver", () => {
	let harness: Harness

	beforeEach(async () => {
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
	})

	it("opens a fresh session for the run's conversation and bot", async () => {
		harness.runs.request(harness.requested())
		await settled()

		expect(harness.starts).toHaveLength(1)
		expect(harness.starts[0].scope).toMatchObject({
			conversationId: harness.conversation.id,
			botId: harness.botId,
		})
	})

	it("asks that session for a report or nothing shape", async () => {
		harness.runs.request(harness.requested())
		await settled()

		expect(harness.starts[0].outputSchema).toMatchObject({
			properties: {
				outcome: { enum: ["report", "nothing"] },
				report: { type: "string" },
			},
		})
	})

	it("submits the instruction and the payload as untrusted data, once", async () => {
		harness.runs.request(harness.requested())
		await settled()

		expect(harness.driver.submissions).toHaveLength(1)
		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("Read the shift log and report what changed.")
		expect(prompt).toContain("<untrusted-data>")
		expect(prompt).toContain("PROJ-12")
		expect(prompt).toMatch(/never instructions to follow/)
		expect(prompt.indexOf("Read the shift log")).toBeLessThan(
			prompt.indexOf("<untrusted-data>"),
		)
	})

	it("never asks the store for the conversation's bounded context", async () => {
		const contexts: string[] = []
		harness.stop()
		harness = await createHarness({
			boundedContext: (_conversationId, botId) => {
				contexts.push(botId)
				return Promise.resolve("context")
			},
		})
		harness.runs.request(harness.requested())
		await settled()

		expect(contexts).toEqual([])
	})

	it("renews the lease every 60 seconds while the run is in flight", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)

		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 3)

		expect(harness.runs.renewals).toEqual(["run-1", "run-1", "run-1"])
	})

	it("stops renewing the lease and ends the session when the turn ends", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS)
		await harness.endTurn(reported("All quiet."))

		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 2)

		expect(harness.runs.renewals).toEqual(["run-1"])
		expect(harness.driver.shutdowns).toEqual([harness.botId])
	})

	it("writes one bot turn holding the report and closes the run ok", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn({
			...reported("Two tickets closed."),
			totalCostUsd: 0.42,
			modelUsage: { sonnet: 12 },
		})

		expect(harness.state().messages).toEqual([
			expect.objectContaining({
				role: "assistant",
				authorBotId: harness.botId,
				content: "Two tickets closed.",
				completion: "complete",
			}),
		])
		expect(harness.runs.closings).toEqual([
			{
				runId: "run-1",
				closing: {
					outcome: "ok",
					costUsd: 0.42,
					modelUsage: { sonnet: 12 },
				},
			},
		])
	})

	it("settles the report in the store so a reload still holds it", async () => {
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		const page = await harness.store.loadPage(harness.conversation.id, null)

		expect(
			page.messages.map(({ role, content, completion }) => [
				role,
				content,
				completion,
			]),
		).toEqual([["assistant", "Two tickets closed.", "complete"]])
	})

	it("shows the report with no reload when the conversation is on screen", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()

		expect(harness.shown()).toEqual([])

		await harness.endTurn(reported("Two tickets closed."))

		expect(harness.shown()).toEqual([[harness.botId, "Two tickets closed."]])
	})

	it.each<RunCause>(["trigger", "runNow"])(
		"leaves the tail of the conversation unchanged while a %s run is in flight",
		async (cause) => {
			await harness.openOnScreen()
			harness.runs.request(harness.requested(cause))
			await settled()

			const tail = harness.state()
			expect(tail.messages).toEqual([])
			expect(tail.speakers).toEqual([])
			expect(tail.waitingBotIds).toEqual([])
		},
	)

	it("writes nothing and closes the run nothing on an empty outcome", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(harness.shown()).toEqual([])
		expect(harness.runs.closings).toEqual([
			{ runId: "run-1", closing: { outcome: "nothing" } },
		])
	})

	it("closes the run failed naming a missing structured output", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn({ structuredOutput: undefined })

		expect(harness.shown()).toEqual([])
		expect(harness.runs.closings[0].closing).toMatchObject({
			outcome: "failed",
			reason: "the run's turn ended with no structured output",
		})
	})

	it.each([
		["cancelled", "the run's turn was cancelled"],
		["failed", "the run's turn failed"],
	] as const)(
		"closes the run failed naming a %s turn",
		async (outcome, reason) => {
			await harness.openOnScreen()
			harness.runs.request(harness.requested())
			await settled()
			await harness.endTurn({ outcome })

			expect(harness.shown()).toEqual([])
			expect(harness.runs.closings[0].closing).toMatchObject({
				outcome: "failed",
				reason,
			})
		},
	)
})
