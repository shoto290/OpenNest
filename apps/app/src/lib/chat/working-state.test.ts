import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { createFakeChatDriver } from "./fake-driver"
import { type SidebarActivity, sidebarActivityFor } from "./screen-model"

import type { TurnState } from "../claude/contract"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"

const STEP_MS = 10
const TURN_STEPS = 12
const REPLY = "one two three"
const PERMISSION_PROMPT = "list the files /permission"

type SidebarPhase = SidebarActivity & { turn: TurnState }

const startedHarness = async (): Promise<ChatController> => {
	const driver = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: () => REPLY,
	})
	const controller = createChatController(driver, createFakeTranscriptStore())
	controller.attach()
	await controller.open("default")
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

/** Every phase the sidebar renders from here on. Reading state per dispatch is
 * what the screen does, so a phase opened and closed inside one task is caught
 * here rather than slipping between two timer samples. */
const collectPhases = (controller: ChatController): SidebarPhase[] => {
	let latest = phaseOf(controller)
	const phases = [latest]
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

const advanceSteps = async (steps: number): Promise<void> => {
	await vi.advanceTimersByTimeAsync(STEP_MS * steps)
}

const stepThroughTurn = async (
	controller: ChatController,
	steps: number,
): Promise<SidebarPhase[]> => {
	const phases = collectPhases(controller)
	await advanceSteps(steps)
	return phases
}

const pendingPermissionIdOf = (controller: ChatController): string => {
	const { permission } = controller.getState()
	if (!permission) {
		throw new Error("the turn is not waiting on a permission")
	}
	return permission.id
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

		await controller.send("hello")

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
		await controller.send("hello")
		await advanceSteps(5)

		const stopped = collectPhases(controller)
		await controller.stop()

		expect(stopped).toEqual([
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "stopping", isWorking: true, kind: "working" },
			{ turn: "idle", isWorking: false },
		])
		expect(await stepThroughTurn(controller, TURN_STEPS)).toEqual([
			{ turn: "idle", isWorking: false },
		])
	})

	it("goes quiet once the turn has failed", async () => {
		const controller = await startedHarness()

		await controller.send("explain /fail")

		expect(await stepThroughTurn(controller, TURN_STEPS)).toEqual([
			{ turn: "submitting", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "running", isWorking: true, kind: "writing" },
			{ turn: "failed", isWorking: false },
		])
	})

	it("waits on the reader for as long as the permission stands, then works on once allowed", async () => {
		const controller = await startedHarness()
		await controller.send(PERMISSION_PROMPT)

		const phases = collectPhases(controller)
		await advanceSteps(TURN_STEPS)

		expect(phaseOf(controller)).toEqual({
			turn: "running",
			isWorking: true,
			kind: "waiting",
		})

		await controller.respond(pendingPermissionIdOf(controller), "allowOnce")
		await advanceSteps(TURN_STEPS)

		expect(phases).toEqual([
			{ turn: "submitting", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "thinking" },
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "running", isWorking: true, kind: "waiting" },
			{ turn: "running", isWorking: true, kind: "working" },
			{ turn: "running", isWorking: true, kind: "writing" },
			{ turn: "idle", isWorking: false },
		])
	})

	it("settles once the reader denies the permission", async () => {
		const controller = await startedHarness()
		await controller.send(PERMISSION_PROMPT)
		await advanceSteps(TURN_STEPS)

		expect(phaseOf(controller)).toEqual({
			turn: "running",
			isWorking: true,
			kind: "waiting",
		})

		await controller.respond(pendingPermissionIdOf(controller), "deny")
		await advanceSteps(TURN_STEPS)

		expect(phaseOf(controller)).toEqual({ turn: "idle", isWorking: false })
	})
})
