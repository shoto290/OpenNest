import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"

const STEP_MS = 10

type Harness = {
	driver: FakeChatDriver
	controller: ChatController
	detach: () => void
}

function createHarness(): Harness {
	const driver = createFakeChatDriver({ stepMs: STEP_MS, replyFor: () => "un deux trois quatre cinq six" })
	const controller = createChatController(driver)
	const detach = controller.attach()
	return { driver, controller, detach }
}

async function startedHarness(): Promise<Harness> {
	const harness = createHarness()
	await harness.controller.start()
	await vi.runAllTimersAsync()
	return harness
}

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("runs a happy-path turn with an optimistic user message", async () => {
		const { controller, detach } = await startedHarness()

		const sending = controller.send("bonjour")
		const optimistic = controller.getState()
		expect(optimistic.messages).toHaveLength(1)
		expect(optimistic.messages[0]).toMatchObject({ role: "user", text: "bonjour" })
		expect(optimistic.turn).toBe("submitting")

		await sending
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages).toHaveLength(2)
		expect(state.messages[1]).toMatchObject({
			role: "assistant",
			completion: "complete",
			text: "un deux trois quatre cinq six",
		})
		expect(state.activities.at(-1)?.status).toBe("succeeded")
		expect(state.errors).toHaveLength(0)
		detach()
	})

	it("refuses a second prompt while a turn is running", async () => {
		const { controller } = await startedHarness()
		await controller.send("premier")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await controller.send("deuxième")

		const state = controller.getState()
		expect(state.messages.filter((message) => message.role === "user")).toHaveLength(1)
		expect(state.errors.at(-1)?.error.kind).toBe("turnAlreadyRunning")
	})

	it("stops a streaming turn and marks the message cancelled", async () => {
		const { controller } = await startedHarness()
		await controller.send("bonjour")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		const assistant = state.messages.at(-1)
		expect(assistant?.completion).toBe("cancelled")
		expect(assistant?.text.length).toBeLessThan("un deux trois quatre cinq six".length)
	})

	it("surfaces a failed turn and keeps partial text", async () => {
		const { controller } = await startedHarness()
		await controller.send("explique /fail")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.errors.at(-1)?.error.kind).toBe("crashed")
		expect(state.messages.at(-1)?.completion).toBe("failed")
		expect(state.activities.at(-1)?.status).toBe("failed")
	})

	it("pauses on a permission request and resumes on allowOnce", async () => {
		const { controller } = await startedHarness()
		await controller.send("liste les fichiers /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		expect(paused.permission?.toolName).toBe("Bash")
		expect(paused.turn).toBe("running")

		await controller.respond(paused.permission?.id ?? "", "allowOnce")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("complete")
	})

	it("cancels the turn when the permission is denied", async () => {
		const { controller } = await startedHarness()
		await controller.send("supprime tout /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		await controller.respond(paused.permission?.id ?? "", "deny")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("cancelled")
	})

	it("rejects a prompt sent before the session starts", async () => {
		const { controller } = createHarness()
		await controller.send("bonjour")

		const failed = controller.getState()
		expect(failed.turn).toBe("failed")
		expect(failed.messages[0].completion).toBe("failed")
		expect(failed.errors.at(-1)?.error.kind).toBe("notStarted")
	})

	it("retries a rejected optimistic message with the same text", async () => {
		const fake = createFakeChatDriver({ stepMs: STEP_MS, replyFor: () => "un deux trois" })
		let failNext = true
		const flaky: ChatDriver = {
			...fake,
			submitPrompt: (text) => {
				if (failNext) {
					failNext = false
					return Promise.reject({ kind: "writeFailed", detail: "réseau coupé" })
				}
				return fake.submitPrompt(text)
			},
		}
		const controller = createChatController(flaky)
		controller.attach()
		await controller.start()

		await controller.send("bonjour")
		const failed = controller.getState()
		expect(failed.turn).toBe("failed")
		expect(failed.messages[0].completion).toBe("failed")
		expect(failed.errors.at(-1)?.error.kind).toBe("writeFailed")

		await controller.retry(failed.messages[0].id)
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages[0]).toMatchObject({ text: "bonjour", completion: "complete" })
		expect(state.messages.at(-1)).toMatchObject({ role: "assistant", completion: "complete" })
	})

	it("resets state on reconnect and drops stale events from the old session", async () => {
		const { driver, controller } = await startedHarness()
		await controller.send("bonjour")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		const firstSession = controller.getState().sessionId
		expect(controller.getState().messages.length).toBeGreaterThan(0)

		await controller.start()
		const reset = controller.getState()
		expect(reset.messages).toHaveLength(0)
		expect(reset.turn).toBe("idle")
		expect(reset.sessionId).not.toBe(firstSession)

		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageDelta", id: "fake-msg-1", seq: 99, text: "fantôme" })
		driver.pushEvent({ type: "turnEnded", ended: { sessionId: firstSession, outcome: "failed" } })

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages).toHaveLength(0)
		expect(state.sessionId).not.toBe(firstSession)
	})

	it("leaves stopping deterministically when cancelTurn is rejected", async () => {
		const fake = createFakeChatDriver({ stepMs: STEP_MS, replyFor: () => "un deux trois" })
		const brokenCancel: ChatDriver = {
			...fake,
			cancelTurn: () => Promise.reject({ kind: "writeFailed", detail: "pipe fermé" }),
		}
		const controller = createChatController(brokenCancel)
		controller.attach()
		await controller.start()
		await controller.send("bonjour")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		const rejected = controller.getState()
		expect(rejected.turn).toBe("failed")
		expect(rejected.errors.at(-1)?.error.kind).toBe("writeFailed")

		await vi.runAllTimersAsync()
		expect(controller.getState().turn).not.toBe("stopping")

		await controller.send("on repart")
		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)).toMatchObject({ role: "assistant", completion: "complete" })
	})

	it("resumes the same session with a clean slate", async () => {
		const { controller } = await startedHarness()
		const first = controller.getState().sessionId
		await controller.start(first ?? undefined)
		const state = controller.getState()
		expect(state.sessionId).toBe(first)
		expect(state.messages).toHaveLength(0)
	})

	it("stops notifying detached listeners", async () => {
		const { controller, detach } = await startedHarness()
		detach()
		await vi.runAllTimersAsync()
		const before = controller.getState()
		await controller.send("bonjour")
		await vi.runAllTimersAsync()
		expect(controller.getState().messages).toHaveLength(before.messages.length + 1)
		expect(controller.getState().messages.at(-1)?.role).toBe("user")
	})
})
