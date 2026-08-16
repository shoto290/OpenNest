import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"

import type { ClaudeEvent } from "../claude/contract"

const STEP_MS = 10

type Harness = {
	driver: FakeChatDriver
	controller: ChatController
	detach: () => void
}

function createHarness(): Harness {
	const driver = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: () => "one two three four five six",
	})
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

		const sending = controller.send("hello")
		const optimistic = controller.getState()
		expect(optimistic.messages).toHaveLength(1)
		expect(optimistic.messages[0]).toMatchObject({
			role: "user",
			text: "hello",
		})
		expect(optimistic.turn).toBe("submitting")

		await sending
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages).toHaveLength(2)
		expect(state.messages[1]).toMatchObject({
			role: "assistant",
			completion: "complete",
			text: "one two three four five six",
		})
		expect(state.activities.at(-1)?.status).toBe("succeeded")
		expect(state.errors).toHaveLength(0)
		detach()
	})

	it("refuses a second prompt while a turn is running", async () => {
		const { controller } = await startedHarness()
		await controller.send("first")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await controller.send("second")

		const state = controller.getState()
		expect(
			state.messages.filter((message) => message.role === "user"),
		).toHaveLength(1)
		expect(state.errors.at(-1)?.error.kind).toBe("turnAlreadyRunning")
	})

	it("stops a streaming turn and marks the message cancelled", async () => {
		const { controller } = await startedHarness()
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		const assistant = state.messages.at(-1)
		expect(assistant?.completion).toBe("cancelled")
		expect(assistant?.text.length).toBeLessThan(
			"one two three four five six".length,
		)
	})

	it("surfaces a failed turn and keeps partial text", async () => {
		const { controller } = await startedHarness()
		await controller.send("explain /fail")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.errors.at(-1)?.error.kind).toBe("crashed")
		expect(state.messages.at(-1)?.completion).toBe("failed")
		expect(state.activities.at(-1)?.status).toBe("failed")
	})

	it("pauses on a permission request and resumes on allowOnce", async () => {
		const { controller } = await startedHarness()
		await controller.send("list the files /permission")
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

	it("leaves no permission activity pending after either decision", async () => {
		for (const decision of ["allowOnce", "deny"] as const) {
			const { controller } = await startedHarness()
			await controller.send("list the files /permission")
			await vi.runAllTimersAsync()

			const paused = controller.getState()
			expect(paused.permission).not.toBeNull()
			expect(
				paused.activities.some((entry) => entry.status === "pending"),
			).toBe(true)

			await controller.respond(paused.permission?.id ?? "", decision)
			await vi.runAllTimersAsync()

			const state = controller.getState()
			expect(state.permission).toBeNull()
			expect(
				state.activities.filter((entry) => entry.status === "pending"),
			).toEqual([])
			expect(
				state.activities.find((entry) => entry.id === paused.permission?.id)
					?.status,
			).toBe(decision === "allowOnce" ? "succeeded" : "failed")
		}
	})

	// The tool comes back with an error and Claude keeps answering, so a denial
	// marks its own step and lets the turn finish.
	it("finishes the turn when the permission is denied", async () => {
		const { controller } = await startedHarness()
		await controller.send("delete everything /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		const permissionId = paused.permission?.id ?? ""
		await controller.respond(permissionId, "deny")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("complete")
		expect(
			state.activities.find((activity) => activity.id === permissionId)?.status,
		).toBe("failed")
	})

	it("rejects a prompt sent before the session starts", async () => {
		const { controller } = createHarness()
		await controller.send("hello")

		const failed = controller.getState()
		expect(failed.turn).toBe("failed")
		expect(failed.messages[0].completion).toBe("failed")
		expect(failed.errors.at(-1)?.error.kind).toBe("notStarted")
	})

	it("retries a rejected optimistic message with the same text", async () => {
		const fake = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "one two three",
		})
		let failNext = true
		const flaky: ChatDriver = {
			...fake,
			submitPrompt: (text) => {
				if (failNext) {
					failNext = false
					return Promise.reject({ kind: "writeFailed", detail: "network down" })
				}
				return fake.submitPrompt(text)
			},
		}
		const controller = createChatController(flaky)
		controller.attach()
		await controller.start()

		await controller.send("hello")
		const failed = controller.getState()
		expect(failed.turn).toBe("failed")
		expect(failed.messages[0].completion).toBe("failed")
		expect(failed.errors.at(-1)?.error.kind).toBe("writeFailed")

		await controller.retry(failed.messages[0].id)
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages[0]).toMatchObject({
			text: "hello",
			completion: "complete",
		})
		expect(state.messages.at(-1)).toMatchObject({
			role: "assistant",
			completion: "complete",
		})
	})

	it("keeps the transcript across a restart that succeeds", async () => {
		const { controller } = await startedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const before = controller.getState()
		expect(before.messages.length).toBeGreaterThan(1)

		await controller.preflight()
		await vi.runAllTimersAsync()

		const after = controller.getState()
		expect(after.messages).toEqual(before.messages)
		expect(after.activities).toEqual(before.activities)
		expect(isSessionReady(after)).toBe(true)
		expect(after.turn).toBe("idle")
	})

	it("keeps the transcript when the restart itself fails", async () => {
		const { driver, controller } = await startedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const before = controller.getState()
		vi.spyOn(driver, "startOrResumeSession").mockRejectedValue({
			kind: "spawnFailed",
			detail: "binary not found",
		})

		await controller.preflight()
		await vi.runAllTimersAsync()

		const after = controller.getState()
		expect(after.messages).toEqual(before.messages)
		expect(after.activities).toEqual(before.activities)
		expect(after.errors.at(-1)?.error.kind).toBe("spawnFailed")
		expect(isSessionReady(after)).toBe(false)
	})

	// A restart re-subscribes, so a frame the dead session emits late reaches the
	// listener it was registered with, which still carries the old epoch.
	it("ignores late events from the session that died", async () => {
		const fake = createFakeChatDriver({ stepMs: STEP_MS })
		const listeners: Array<(event: ClaudeEvent) => void> = []
		const driver: ChatDriver = {
			...fake,
			subscribe: (onEvent) => {
				listeners.push(onEvent)
				return fake.subscribe(onEvent)
			},
		}
		const controller = createChatController(driver)
		controller.attach()
		await controller.preflight()
		await controller.send("hello")
		await vi.runAllTimersAsync()

		await controller.preflight()
		await vi.runAllTimersAsync()
		const restarted = controller.getState()
		const deadListener = listeners[0]

		deadListener({ type: "turnChanged", state: "running" })
		deadListener({
			type: "messageDelta",
			id: "fake-msg-1",
			seq: 99,
			text: "ghost",
		})
		deadListener({
			type: "messageStarted",
			message: {
				id: "ghost",
				role: "assistant",
				text: "",
				completion: "streaming",
				timestamp: 0,
			},
		})
		deadListener({
			type: "turnEnded",
			ended: { sessionId: "dead", outcome: "failed" },
		})

		const state = controller.getState()
		expect(state.messages).toEqual(restarted.messages)
		expect(state.turn).toBe("idle")
	})

	it("drops the transcript only when the conversation is cleared", async () => {
		const { controller } = await startedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		expect(controller.getState().messages.length).toBeGreaterThan(1)

		controller.clearConversation()

		const state = controller.getState()
		expect(state.messages).toHaveLength(0)
		expect(state.activities).toHaveLength(0)
		expect(isSessionReady(state)).toBe(true)
	})

	it("leaves stopping deterministically when cancelTurn is rejected", async () => {
		const fake = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "one two three",
		})
		const brokenCancel: ChatDriver = {
			...fake,
			cancelTurn: () =>
				Promise.reject({ kind: "writeFailed", detail: "pipe closed" }),
		}
		const controller = createChatController(brokenCancel)
		controller.attach()
		await controller.start()
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		const rejected = controller.getState()
		expect(rejected.turn).toBe("failed")
		expect(rejected.errors.at(-1)?.error.kind).toBe("writeFailed")

		await vi.runAllTimersAsync()
		expect(controller.getState().turn).not.toBe("stopping")

		await controller.send("restart")
		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)).toMatchObject({
			role: "assistant",
			completion: "complete",
		})
	})

	it("resumes the same session with a clean slate", async () => {
		const { controller } = await startedHarness()
		const first = controller.getState().sessionId
		await controller.start(first ?? undefined)
		const state = controller.getState()
		expect(state.sessionId).toBe(first)
		expect(state.messages).toHaveLength(0)
	})

	it("opens a session on preflight and collapses concurrent calls into one", async () => {
		const { driver, controller } = createHarness()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		const [first, second] = await Promise.all([
			controller.preflight(),
			controller.preflight(),
		])
		await vi.runAllTimersAsync()

		expect(first).toBe(second)
		expect(startSpy).toHaveBeenCalledTimes(1)
		const state = controller.getState()
		expect(state.connection).toBe("ready")
		expect(state.binaryVersion).toBe("fake-0.0.1")
		// The CLI reports its session id on the first prompt, so the composer must
		// open on `sessionOpen` alone or the first prompt could never be sent.
		expect(state.sessionOpen).toBe(true)
		expect(state.sessionId).toBeNull()
	})

	it("reports an unavailable binary on preflight without opening a session", async () => {
		const { driver, controller } = createHarness()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		vi.spyOn(driver, "check").mockResolvedValue({
			connection: "unavailable",
			binaryVersion: null,
			authenticated: false,
			error: { kind: "notAuthenticated" },
		})

		expect(await controller.preflight()).toBeNull()
		expect(startSpy).not.toHaveBeenCalled()
		const state = controller.getState()
		expect(state.connection).toBe("unavailable")
		expect(state.sessionOpen).toBe(false)
		expect(state.errors.at(-1)?.error.kind).toBe("notAuthenticated")
	})

	it("runs a fresh preflight once the previous one settled", async () => {
		const { driver, controller } = createHarness()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.preflight()
		await controller.preflight()

		expect(startSpy).toHaveBeenCalledTimes(2)
	})

	// Tauri registers event listeners over IPC, so a subscription is not live the
	// moment `subscribe()` is called. A session that emits from inside
	// `startOrResumeSession` is exactly the window this guards.
	it("waits for the subscription before starting, so startup events are not lost", async () => {
		let listener: ((event: ClaudeEvent) => void) | null = null
		const driver: ChatDriver = {
			...createFakeChatDriver({ stepMs: STEP_MS }),
			startOrResumeSession: () => {
				listener?.({ type: "sessionReady", sessionId: "s-1", resumed: false })
				return Promise.resolve({ resumed: false })
			},
			subscribe: (onEvent) =>
				Promise.resolve()
					.then(() => undefined)
					.then(() => {
						listener = onEvent
						return () => {
							listener = null
						}
					}),
		}
		const controller = createChatController(driver)
		controller.attach()

		await controller.preflight()

		expect(controller.getState().sessionId).toBe("s-1")
	})

	it("stops notifying detached listeners", async () => {
		const { controller, detach } = await startedHarness()
		detach()
		await vi.runAllTimersAsync()
		const before = controller.getState()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		expect(controller.getState().messages).toHaveLength(
			before.messages.length + 1,
		)
		expect(controller.getState().messages.at(-1)?.role).toBe("user")
	})
})
