import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeRunPort, type FakeRunPort } from "./fake-run-port"
import type { RunCause, RunRequested } from "./routine-contract"
import {
	LEASE_INTERVAL_MS,
	RUN_DEADLINE_MS,
	startRunDriver,
} from "./run-driver"

import type {
	AgentEvent,
	RuntimeScope,
	TransportError,
	TurnEnded,
} from "../agent/contract"
import { createChatController } from "../chat/chat-controller"
import type { ChatState } from "../chat/chat-state"
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

const THIRTY_MINUTES = 30 * 60_000

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
	soloRun: () => RunRequested
	state: () => ConversationState
	soloState: () => ChatState
	shown: () => [string | null, string][]
	emitAtRun: (event: AgentEvent) => Promise<void>
	endTurn: (ended: Partial<TurnEnded>) => Promise<void>
	openOnScreen: () => Promise<void>
	openSoloOnScreen: () => Promise<void>
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
	const mainChat = await store.mainChat(bot.id)
	const runtimes = createConversationRuntimes(driver, store)
	const chat = createChatController(driver, store)
	const runs = createFakeRunPort()
	const stop = startRunDriver({
		driver,
		store,
		runtimes,
		chat,
		runs,
		now: () => 7,
	})
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

	const emitAtRun = async (event: AgentEvent) => {
		const start = starts.at(-1)
		if (!start) {
			throw new Error("no run session was opened")
		}
		driver.emit(start.scope, event)
		await settled()
	}

	const endTurn = (ended: Partial<TurnEnded>) =>
		emitAtRun({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed", ...ended },
		})

	const openOnScreen = async () => {
		await runtimes.runtimeFor(conversation.id).open(conversation)
		await settled()
	}

	const openSoloOnScreen = async () => {
		await chat.open(bot.id)
		await settled()
	}

	const state = () => runtimes.runtimeFor(conversation.id).getState()

	const soloState = () => chat.stateFor(bot.id)

	const shown = () =>
		state().messages.map(
			({ authorBotId, content }) =>
				[authorBotId, content] as [string | null, string],
		)

	const soloRun = (): RunRequested => ({
		...requested(),
		conversationId: mainChat.id,
	})

	return {
		driver,
		store,
		runs,
		starts,
		conversation,
		botId: bot.id,
		stop,
		requested,
		soloRun,
		state,
		soloState,
		shown,
		emitAtRun,
		endTurn,
		openOnScreen,
		openSoloOnScreen,
	}
}

const reported = (report: string): Partial<TurnEnded> => ({
	structuredOutput: { outcome: "report", report },
})

const UNREPORTED_ENDINGS: [string, Partial<TurnEnded>][] = [
	["on nothing", reported("   ")],
	["cancelled", { outcome: "cancelled" }],
	["failed", { outcome: "failed" }],
]

const CRASHED: TransportError = {
	kind: "crashed",
	code: 1,
	detail: "the sidecar died",
}

const STALE: TransportError = {
	kind: "staleRuntimeSession",
	runtimeSessionId: "rs-9",
}

const ASKED: AgentEvent = {
	type: "questionRequested",
	request: {
		id: "q-1",
		questions: [
			{
				header: "Which board?",
				question: "Which board should I read?",
				options: [],
				multiSelect: false,
			},
		],
	},
}

const PERMITTED: AgentEvent = {
	type: "permissionRequested",
	request: {
		id: "p-1",
		toolName: "Bash",
		title: "Run a command",
		detail: null,
	},
}

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
					reportedTurnId: harness.state().messages[0].turnId,
				},
			},
		])
	})

	it("marks the reported turn with its routine while the conversation is open", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		const { turnId } = harness.state().messages[0]

		expect(harness.state().reportedCauses.get(turnId)).toEqual({
			turnId,
			routineTitle: "Nightly report",
			triggerSourceId: "schedule",
		})
	})

	it("closes a reported run with the turn id of the published report", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		expect(harness.runs.closings[0].closing.reportedTurnId).toBe(
			harness.state().messages[0].turnId,
		)
	})

	it.each(UNREPORTED_ENDINGS)(
		"closes a run that ended %s with no turn id",
		async (_ending, ended) => {
			harness.runs.request(harness.requested())
			await settled()
			await harness.endTurn(ended)

			expect(harness.runs.closings[0].closing.reportedTurnId).toBeUndefined()
		},
	)

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

	it("writes the report into the solo thread when the run is the main chat", async () => {
		await harness.openSoloOnScreen()
		harness.runs.request(harness.soloRun())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		expect(harness.soloState().messages).toEqual([
			expect.objectContaining({
				role: "assistant",
				authorBotId: harness.botId,
				content: "Two tickets closed.",
				completion: "complete",
			}),
		])
		expect(harness.state().messages).toEqual([])
	})

	it("marks the reported turn of a solo thread with its routine", async () => {
		await harness.openSoloOnScreen()
		harness.runs.request(harness.soloRun())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		const { turnId } = harness.soloState().messages[0]

		expect(harness.soloState().reportedCauses.get(turnId)).toEqual({
			turnId,
			routineTitle: "Nightly report",
			triggerSourceId: "schedule",
		})
	})

	it("closes a solo run with the turn id of the published report", async () => {
		await harness.openSoloOnScreen()
		harness.runs.request(harness.soloRun())
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		expect(harness.runs.closings[0].closing.reportedTurnId).toBe(
			harness.soloState().messages[0].turnId,
		)
	})

	it("settles a solo report in the store while its chat stays closed", async () => {
		const run = harness.soloRun()
		harness.runs.request(run)
		await settled()
		await harness.endTurn(reported("Two tickets closed."))

		const page = await harness.store.loadPage(run.conversationId, null)

		expect(harness.soloState().messages).toEqual([])
		expect(page.messages.map(({ content }) => content)).toEqual([
			"Two tickets closed.",
		])
	})

	it("leaves the solo transcript unchanged when a run reports nothing", async () => {
		await harness.openSoloOnScreen()
		harness.runs.request(harness.soloRun())
		await settled()
		await harness.endTurn(reported("   "))

		expect(harness.soloState().messages).toEqual([])
		expect(harness.runs.closings[0].closing.outcome).toBe("nothing")
	})

	it("leaves the bot idle in its solo thread while a run is in flight", async () => {
		await harness.openSoloOnScreen()
		const idle = harness.soloState()
		harness.runs.request(harness.soloRun())
		await settled()

		const running = harness.soloState()

		expect(running.turn).toBe(idle.turn)
		expect(running.messages).toEqual([])
		expect(running.activities).toEqual(idle.activities)
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

	it("closes the run failed naming a transport error that ends the session", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		await harness.emitAtRun({ type: "failed", error: CRASHED })

		expect(harness.driver.shutdowns).toEqual([harness.botId])
		expect(harness.runs.closings[0].closing).toEqual({
			outcome: "failed",
			reason: "the run's session failed with crashed: the sidecar died",
		})

		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 2)
		expect(harness.runs.renewals).toEqual([])
	})

	it("keeps the run live on a transport error that does not end the session", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		await harness.emitAtRun({ type: "failed", error: STALE })

		expect(harness.runs.closings).toEqual([])
		expect(harness.driver.shutdowns).toEqual([])

		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 2)
		expect(harness.runs.renewals).toEqual(["run-1", "run-1"])
	})

	it.each([
		[ASKED, "a run cannot be asked a question"],
		[PERMITTED, "a run cannot be asked for a permission"],
	])(
		"cancels the turn and closes the run failed when asked",
		async (asked, reason) => {
			await harness.openOnScreen()
			harness.runs.request(harness.requested())
			await settled()
			await harness.emitAtRun(asked)

			expect(harness.driver.cancelled).toEqual([harness.botId])
			expect(harness.driver.shutdowns).toEqual([harness.botId])
			expect(harness.shown()).toEqual([])
			expect(harness.runs.closings).toEqual([
				{ runId: "run-1", closing: { outcome: "failed", reason } },
			])
		},
	)

	it("closes the run once, whatever arrives after the closing", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		await harness.emitAtRun(ASKED)
		await harness.endTurn({ outcome: "cancelled" })
		await harness.emitAtRun({ type: "failed", error: CRASHED })

		expect(harness.runs.closings).toHaveLength(1)

		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 2)
		expect(harness.runs.renewals).toEqual([])
	})

	it("writes nothing and closes the run nothing on a blank report", async () => {
		await harness.openOnScreen()
		harness.runs.request(harness.requested())
		await settled()
		await harness.endTurn(reported("   "))

		expect(harness.shown()).toEqual([])
		expect(harness.runs.closings[0].closing).toMatchObject({
			outcome: "nothing",
		})
	})

	it("leaves an event untouched when no live run sits at its scope", async () => {
		harness.runs.request(harness.requested())
		await settled()
		harness.driver.emit(
			{
				conversationId: harness.conversation.id,
				botId: harness.botId,
				runtimeSessionId: "rs-other",
				epoch: 1,
			},
			{ type: "failed", error: CRASHED },
		)
		await settled()

		expect(harness.runs.closings).toEqual([])
		expect(harness.driver.shutdowns).toEqual([])
	})

	it("bounds a run at thirty minutes", () => {
		expect(RUN_DEADLINE_MS).toBe(THIRTY_MINUTES)
	})

	it("cancels, shuts down and closes a run that outlives its deadline", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)

		await vi.advanceTimersByTimeAsync(THIRTY_MINUTES - 1)
		expect(harness.runs.closings).toEqual([])

		await vi.advanceTimersByTimeAsync(1)
		expect(harness.driver.cancelled).toEqual([harness.botId])
		expect(harness.driver.shutdowns).toEqual([harness.botId])
		expect(harness.runs.closings).toEqual([
			{
				runId: "run-1",
				closing: {
					outcome: "failed",
					reason: "the run outlived its deadline",
				},
			},
		])

		const renewed = harness.runs.renewals.length
		await vi.advanceTimersByTimeAsync(LEASE_INTERVAL_MS * 2)
		expect(harness.runs.renewals).toHaveLength(renewed)
	})

	it("never closes a run by its deadline once its turn has ended", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		await harness.endTurn(reported("All quiet."))

		expect(vi.getTimerCount()).toBe(0)

		await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS * 2)

		expect(harness.runs.closings).toEqual([
			{
				runId: "run-1",
				closing: { outcome: "ok", reportedTurnId: expect.any(String) },
			},
		])
		expect(harness.driver.cancelled).toEqual([])
	})

	it("leaves no timer alive once the driver has stopped", async () => {
		vi.useFakeTimers()
		harness.runs.request(harness.requested())
		await vi.advanceTimersByTimeAsync(0)
		harness.stop()

		await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS * 2)

		expect(vi.getTimerCount()).toBe(0)
		expect(harness.runs.closings).toEqual([])
	})
})
