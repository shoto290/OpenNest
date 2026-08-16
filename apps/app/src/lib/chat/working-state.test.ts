import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { createFakeChatDriver } from "./fake-driver"
import { type SidebarActivity, sidebarActivityFor } from "./screen-model"

import type { TurnState } from "../claude/contract"

const STEP_MS = 10
const TURN_STEPS = 12
const REPLY = "un deux trois"

type SidebarPhase = SidebarActivity & { turn: TurnState }

const startedHarness = async (): Promise<ChatController> => {
	const driver = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: () => REPLY,
	})
	const controller = createChatController(driver)
	controller.attach()
	await controller.start()
	await vi.runAllTimersAsync()
	return controller
}

const phaseOf = (controller: ChatController): SidebarPhase => {
	const state = controller.getState()
	return { turn: state.turn, ...sidebarActivityFor(state) }
}

const isSamePhase = (left: SidebarPhase, right: SidebarPhase): boolean =>
	left.turn === right.turn &&
	left.isWorking === right.isWorking &&
	left.kind === right.kind

const stepThroughTurn = async (
	controller: ChatController,
	steps: number,
): Promise<SidebarPhase[]> => {
	let latest = phaseOf(controller)
	const phases = [latest]
	for (let step = 0; step < steps; step += 1) {
		await vi.advanceTimersByTimeAsync(STEP_MS)
		const next = phaseOf(controller)
		if (isSamePhase(latest, next)) {
			continue
		}
		latest = next
		phases.push(next)
	}
	return phases
}

const recordPhases = (controller: ChatController): SidebarPhase[] => {
	let latest = phaseOf(controller)
	const phases: SidebarPhase[] = []
	controller.subscribe(() => {
		const next = phaseOf(controller)
		if (isSamePhase(latest, next)) {
			return
		}
		latest = next
		phases.push(next)
	})
	return phases
}

describe("sidebar working state over a turn", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("stays quiet on a session that has been sent nothing", async () => {
		const controller = await startedHarness()

		expect(phaseOf(controller)).toEqual({ turn: "idle", isWorking: false })
	})

	it("works through every phase of a turn, then settles for good", async () => {
		const controller = await startedHarness()

		await controller.send("bonjour")

		expect(await stepThroughTurn(controller, TURN_STEPS)).toEqual([
			{ turn: "submitting", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "running", isWorking: true, kind: "writing" },
			{ turn: "idle", isWorking: false },
		])
	})

	it("keeps working while the turn is stopping, then settles", async () => {
		const controller = await startedHarness()
		await controller.send("bonjour")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)

		expect(phaseOf(controller)).toEqual({
			turn: "running",
			isWorking: true,
			kind: "working",
		})

		const stopped = recordPhases(controller)
		await controller.stop()

		expect(stopped).toEqual([
			{ turn: "stopping", isWorking: true, kind: "working" },
			{ turn: "idle", isWorking: false },
		])
		expect(await stepThroughTurn(controller, TURN_STEPS)).toEqual([
			{ turn: "idle", isWorking: false },
		])
	})

	it("goes quiet once the turn has failed", async () => {
		const controller = await startedHarness()

		await controller.send("explique /fail")

		expect(await stepThroughTurn(controller, TURN_STEPS)).toEqual([
			{ turn: "submitting", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "running", isWorking: true, kind: "writing" },
			{ turn: "failed", isWorking: false },
		])
	})
})
