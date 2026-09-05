import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeMissions, type FakeMissions } from "./fake-missions"
import type { Mission, MissionEvent, MissionState } from "./mission-contract"
import { aMission, missionEvents } from "./mission-fixtures"
import {
	MISSION_TRIGGER_SOURCE,
	RUN_DEADLINE_MS,
	startMissionRunDriver,
} from "./mission-run-driver"

import type { AgentEvent, RuntimeScope, TurnEnded } from "../agent/contract"
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

const AGENT_ASKED = missionEvents([
	{ kind: "opened", source: "human" },
	{
		kind: "agent_asked",
		source: "agent-hook",
		payload: { event: "Notification", message: "Which branch should I cut?" },
	},
])

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
	missions: FakeMissions
	starts: Started[]
	agentCalls: string[]
	thread: Conversation
	mission: Mission
	reportFailure: ReturnType<typeof vi.fn>
	stop: () => void
	hold: (state: MissionState, events?: MissionEvent[]) => void
	enter: (state: MissionState, events?: MissionEvent[]) => Promise<void>
	emitAtRun: (event: AgentEvent) => Promise<void>
	endTurn: (ended: Partial<TurnEnded>) => Promise<void>
	tail: () => ConversationState
}

type HarnessSeed = {
	store?: Partial<TranscriptStore>
	open?: MissionState
	openEvents?: MissionEvent[]
	stalled?: boolean
	boardFails?: boolean
}

const createHarness = async ({
	store: overrides = {},
	open,
	openEvents = AGENT_ASKED,
	stalled = false,
	boardFails = false,
}: HarnessSeed = {}): Promise<Harness> => {
	const scripted = createScriptedDriver()
	const starts: Started[] = []
	const agentCalls: string[] = []
	const driver: ScriptedDriver = {
		...scripted,
		startOrResumeSession: (scope, resume, cwd, outputSchema) => {
			starts.push({ scope, outputSchema })
			return scripted.startOrResumeSession(scope, resume, cwd, outputSchema)
		},
		cancelTurn: (scope) => {
			agentCalls.push("cancelTurn")
			return scripted.cancelTurn(scope)
		},
		shutdown: (scope) => {
			agentCalls.push("shutdown")
			return scripted.shutdown(scope)
		},
	}
	const base = createFakeTranscriptStore()
	const store = { ...base, ...overrides }
	const [bot] = await seatBots(store, SPACE, ["Ada"])
	const thread = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Ship the walls",
		botIds: [bot.id],
	})
	const runtimes = createConversationRuntimes(driver, store)
	const missions = createFakeMissions()
	const reportFailure = vi.fn()
	const mission = aMission({
		botId: bot.id,
		threadConversationId: thread.id,
	})

	if (open) {
		missions.hold({ mission: { ...mission, state: open }, events: openEvents })
		missions.place([{ ...mission, state: open }])
	}

	if (stalled) {
		missions.stall()
	}

	if (boardFails) {
		missions.refuseBoard()
	}

	const stop = startMissionRunDriver({
		driver,
		store,
		runtimes,
		missions,
		reportFailure,
		now: () => 7,
	})
	await settled()

	const hold = (state: MissionState, events = AGENT_ASKED) => {
		missions.hold({ mission: { ...mission, state }, events })
	}

	const enter = async (state: MissionState, events = AGENT_ASKED) => {
		hold(state, events)
		missions.change({ missionId: mission.id, state })
		await settled()
	}

	const emitAtRun = async (event: AgentEvent) => {
		const start = starts.at(-1)
		if (!start) {
			throw new Error("no mission run session was opened")
		}
		driver.emit(start.scope, event)
		await settled()
	}

	const endTurn = (ended: Partial<TurnEnded>) =>
		emitAtRun({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed", ...ended },
		})

	const reader = runtimes.runtimeFor(thread.id)
	await reader.open(thread)
	await settled()

	const tail = () => reader.getState()

	return {
		driver,
		missions,
		starts,
		agentCalls,
		thread,
		mission,
		reportFailure,
		stop,
		hold,
		enter,
		emitAtRun,
		endTurn,
		tail,
	}
}

const spoken = ({ messages }: ConversationState) =>
	messages.map(({ authorBotId, content }) => [authorBotId, content] as const)

const reported = (report: string): Partial<TurnEnded> => ({
	structuredOutput: { outcome: "report", report },
})

const closedBy = (source: string) =>
	missionEvents([
		{ kind: "opened", source: "human" },
		{ kind: "closed", source, payload: { pull: 12 } },
	])

describe("startMissionRunDriver", () => {
	let harness: Harness

	const restart = async (seed: HarnessSeed) => {
		harness.stop()
		harness = await createHarness(seed)
	}

	beforeEach(async () => {
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("opens a session of its own on the mission thread for the owning bot", async () => {
		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(1)
		expect(harness.starts[0].scope).toMatchObject({
			conversationId: harness.thread.id,
			botId: harness.mission.botId,
		})
		expect(harness.starts[0].outputSchema).toMatchObject({
			properties: { outcome: { enum: ["report", "nothing"] } },
		})
	})

	it("fences the mission events and the agent last message under the instruction", async () => {
		await harness.enter("waiting_bot")

		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("blocked and waiting on you")
		expect(prompt).toContain("Which branch should I cut?")
		expect(prompt).toContain('"agentLastMessage"')
		expect(prompt).toMatch(/never instructions to follow/)
		expect(prompt.indexOf("blocked and waiting on you")).toBeLessThan(
			prompt.indexOf("<untrusted-data>"),
		)
	})

	it("runs the bot once while its run is live", async () => {
		await harness.enter("waiting_bot")
		await harness.enter("working")
		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(1)
		expect(harness.driver.submissions).toHaveLength(1)
	})

	it("keeps the state of a change it dropped for being busy", async () => {
		await harness.enter("done", closedBy("github"))
		await harness.enter("waiting_bot")
		expect(harness.starts).toHaveLength(1)

		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })
		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(2)
	})

	it("cancels the turn of a refused run before it shuts its session down", async () => {
		await harness.enter("waiting_bot")

		await harness.emitAtRun({
			type: "permissionRequested",
			request: { id: "p-1", toolName: "Bash", title: "Run it", detail: null },
		})

		expect(harness.agentCalls).toEqual(["cancelTurn", "shutdown"])
		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
	})

	it("ends a run that outlived its deadline and takes the mission again", async () => {
		vi.useFakeTimers()
		await harness.enter("waiting_bot")

		await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS)

		expect(harness.agentCalls).toEqual(["cancelTurn", "shutdown"])
		expect(harness.reportFailure).toHaveBeenCalledTimes(1)

		vi.useRealTimers()
		await harness.enter("working")
		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(2)
	})

	it("runs the bot again once the run has ended", async () => {
		await harness.enter("waiting_bot")
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })
		await harness.enter("working")
		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(2)
	})

	it("tells the bot to report the merge when github closed the mission", async () => {
		await harness.enter("done", closedBy("github"))

		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("merged on GitHub")
		expect(prompt).toContain("take your next ticket")
	})

	it("leaves the bot alone when the mission was closed by anyone else", async () => {
		await harness.enter("done", closedBy("human"))

		expect(harness.starts).toEqual([])
	})

	it("lights no working row in the mission thread while the run is live", async () => {
		await harness.enter("waiting_bot")

		expect(harness.tail().speakers).toEqual([])
		expect(harness.tail().waitingBotIds).toEqual([])
		expect(spoken(harness.tail())).toEqual([])
	})

	it("writes the report as a bot turn in the mission thread", async () => {
		await harness.enter("waiting_bot")
		await harness.endTurn(reported("I cut the branch from main."))

		expect(spoken(harness.tail())).toEqual([
			[harness.mission.botId, "I cut the branch from main."],
		])
	})

	it("carries the cause of the mission run on that turn", async () => {
		await harness.enter("waiting_bot")
		await harness.endTurn(reported("I cut the branch from main."))

		expect([...harness.tail().reportedCauses.values()]).toEqual([
			{
				turnId: expect.any(String),
				routineTitle: harness.mission.ticket.externalId,
				triggerSourceId: MISSION_TRIGGER_SOURCE,
			},
		])
	})

	it("writes no turn when the run has nothing to report", async () => {
		await harness.enter("waiting_bot")
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(spoken(harness.tail())).toEqual([])
	})

	it("raises a failure notice and writes nothing when the session cannot open", async () => {
		await restart({
			store: {
				openRuntimeSession: () => Promise.reject(new Error("no runtime")),
			},
		})

		await harness.enter("waiting_bot")

		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
		expect(spoken(harness.tail())).toEqual([])
	})

	it("raises a failure notice when the run's turn ends without a report", async () => {
		await harness.enter("waiting_bot")
		await harness.endTurn({ outcome: "failed" })

		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
		expect(spoken(harness.tail())).toEqual([])
	})

	it("takes an open mission that waits on the bot at start", async () => {
		await restart({ open: "waiting_bot" })

		expect(harness.starts).toHaveLength(1)
		expect(harness.driver.submissions).toHaveLength(1)
	})

	it("leaves an open mission that github merged before the start", async () => {
		await restart({ open: "done", openEvents: closedBy("github") })

		expect(harness.starts).toEqual([])
	})

	it("leaves an open mission that is already working at start", async () => {
		await restart({ open: "working" })

		expect(harness.starts).toEqual([])
	})

	it("runs once when a change arrives while the start read is in flight", async () => {
		await restart({ open: "waiting_bot", stalled: true })

		await harness.enter("waiting_bot")
		harness.missions.release()
		await settled()

		expect(harness.starts).toHaveLength(1)
	})

	it("runs no second time on a change carrying the state read at start", async () => {
		await restart({ open: "waiting_bot" })
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(1)
	})

	it("keeps listening to mission changes when the open missions cannot be read", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await restart({ boardFails: true })

		await harness.enter("waiting_bot")

		expect(harness.starts).toHaveLength(1)
		expect(logged).toHaveBeenCalledWith(
			"mission run driver: the open missions could not be read",
			expect.any(Error),
		)
	})

	it("starts no run when it is stopped before the start read resolves", async () => {
		await restart({ open: "waiting_bot", stalled: true })

		harness.stop()
		harness.missions.release()
		await settled()

		expect(harness.starts).toEqual([])
	})

	it("raises a failure notice when the mission cannot be read", async () => {
		harness.missions.refuse(harness.mission.id)
		await harness.enter("waiting_bot")

		expect(harness.starts).toEqual([])
		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
	})
})
