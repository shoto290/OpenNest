import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"

import type {
	ChatMessage,
	ClaudeEvent,
	SessionSnapshot,
} from "../claude/contract"

const STEP_MS = 10
const PERSIST_MS = 1000

const STREAMING_MESSAGE: ChatMessage = {
	id: "msg-1",
	role: "assistant",
	text: "",
	completion: "streaming",
	timestamp: 0,
}

const EMPTY_SNAPSHOT: SessionSnapshot = {
	sessionId: null,
	messages: [],
	activities: [],
}

const STORED_SNAPSHOT: SessionSnapshot = {
	sessionId: "s-stored",
	messages: [
		{
			id: "local-3",
			role: "user",
			text: "bonjour",
			completion: "complete",
			timestamp: 0,
		},
		{
			id: "fake-msg-9",
			role: "assistant",
			text: "salut",
			completion: "complete",
			timestamp: 0,
		},
	],
	activities: [
		{ id: "act-1", title: "Lecture", kind: "tool", status: "succeeded" },
	],
}

type Harness = {
	driver: FakeChatDriver
	controller: ChatController
	detach: () => void
}

type StoredHarness = Harness & {
	saved: SessionSnapshot[]
}

function createHarness(): Harness {
	const driver = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: () => "un deux trois quatre cinq six",
	})
	const controller = createChatController(driver)
	const detach = controller.attach()
	return { driver, controller, detach }
}

function storedHarness(snapshot: SessionSnapshot): StoredHarness {
	const fake = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: () => "un deux trois",
	})
	const saved: SessionSnapshot[] = []
	const driver: FakeChatDriver = {
		...fake,
		loadSession: () => Promise.resolve(snapshot),
		saveSession: (next) => {
			saved.push(next)
			return Promise.resolve()
		},
	}
	const controller = createChatController(driver)
	return { driver, controller, detach: controller.attach(), saved }
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
		expect(optimistic.messages[0]).toMatchObject({
			role: "user",
			text: "bonjour",
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
		expect(
			state.messages.filter((message) => message.role === "user"),
		).toHaveLength(1)
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
		expect(assistant?.text.length).toBeLessThan(
			"un deux trois quatre cinq six".length,
		)
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

	it("leaves no permission activity pending after either decision", async () => {
		for (const decision of ["allowOnce", "deny"] as const) {
			const { controller } = await startedHarness()
			await controller.send("liste les fichiers /permission")
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
		const fake = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "un deux trois",
		})
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
		expect(state.messages[0]).toMatchObject({
			text: "bonjour",
			completion: "complete",
		})
		expect(state.messages.at(-1)).toMatchObject({
			role: "assistant",
			completion: "complete",
		})
	})

	it("keeps the transcript across a restart that succeeds", async () => {
		const { controller } = await startedHarness()
		await controller.send("bonjour")
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
		await controller.send("bonjour")
		await vi.runAllTimersAsync()
		const before = controller.getState()
		vi.spyOn(driver, "startOrResumeSession").mockRejectedValue({
			kind: "spawnFailed",
			detail: "binaire introuvable",
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
		await controller.send("bonjour")
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
			text: "fantôme",
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
		await controller.send("bonjour")
		await vi.runAllTimersAsync()
		expect(controller.getState().messages.length).toBeGreaterThan(1)

		controller.clearConversation()

		const state = controller.getState()
		expect(state.messages).toHaveLength(0)
		expect(state.activities).toHaveLength(0)
		expect(isSessionReady(state)).toBe(true)
	})

	// Clearing a sensitive conversation has to reach the disk: what is only dropped
	// in memory comes straight back on the next boot.
	it("writes the cleared transcript instead of leaving it on disk", async () => {
		const { controller, saved } = storedHarness(STORED_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		expect(saved).toHaveLength(0)

		controller.clearConversation()

		expect(saved.at(-1)).toMatchObject({ messages: [], activities: [] })
	})

	it("leaves stopping deterministically when cancelTurn is rejected", async () => {
		const fake = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "un deux trois",
		})
		const brokenCancel: ChatDriver = {
			...fake,
			cancelTurn: () =>
				Promise.reject({ kind: "writeFailed", detail: "pipe fermé" }),
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

	it("restores the stored transcript and resumes its session on boot", async () => {
		const { driver, controller } = storedHarness(STORED_SNAPSHOT)
		const loadSpy = vi.spyOn(driver, "loadSession")
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.boot()
		await vi.runAllTimersAsync()

		expect(loadSpy).toHaveBeenCalledTimes(1)
		expect(startSpy).toHaveBeenCalledWith("s-stored")
		const state = controller.getState()
		expect(state.sessionId).toBe("s-stored")
		expect(state.messages).toEqual(STORED_SNAPSHOT.messages)
		expect(state.activities).toEqual(STORED_SNAPSHOT.activities)
		expect(isSessionReady(state)).toBe(true)
	})

	// The id comes back from the child on the first prompt, never on the resume
	// itself, so the write that precedes that prompt is the one that used to erase
	// it — and a crash right there boots the next launch amnesiac.
	it("never writes a null session id over the one it just resumed", async () => {
		const { controller, saved } = storedHarness(STORED_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()

		await controller.send("et après ?")

		expect(saved.map((snapshot) => snapshot.sessionId)).toEqual(["s-stored"])
	})

	// The host forgets the id on disk the moment the child refuses it, so keeping
	// it here would write it back and retry a dead session on every launch.
	it("stops carrying a stored id the child refused to resume", async () => {
		const { driver, controller } = storedHarness(STORED_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		expect(controller.getState().sessionId).toBe("s-stored")

		driver.pushEvent({ type: "failed", error: { kind: "resumeFailed" } })

		expect(controller.getState().sessionId).toBeNull()
	})

	it("resumes the stored session when the restart affordance is used", async () => {
		const { driver, controller } = storedHarness(STORED_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.restart()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith("s-stored")
		expect(controller.getState().sessionId).toBe("s-stored")
	})

	it("boots without a resume id when nothing was stored", async () => {
		const { driver, controller } = storedHarness(EMPTY_SNAPSHOT)
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.boot()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith(undefined)
		expect(controller.getState().messages).toHaveLength(0)
		expect(isSessionReady(controller.getState())).toBe(true)
	})

	it("still opens a session when the stored transcript cannot be read", async () => {
		const { driver, controller } = storedHarness(STORED_SNAPSHOT)
		vi.spyOn(driver, "loadSession").mockRejectedValue({
			kind: "writeFailed",
			detail: "disque illisible",
		})

		await controller.boot()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.messages).toHaveLength(0)
		expect(isSessionReady(state)).toBe(true)
	})

	it("persists the prompt on the way out, then the settled turn", async () => {
		const { controller, saved } = storedHarness(EMPTY_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		expect(saved).toHaveLength(0)

		const sending = controller.send("bonjour")
		expect(saved).toHaveLength(1)
		expect(saved[0].messages).toEqual([
			expect.objectContaining({ role: "user", text: "bonjour" }),
		])

		await sending
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(saved).toHaveLength(2)
		expect(saved[1].messages).toEqual(state.messages)
		expect(saved[1].activities).toEqual(state.activities)
	})

	// Quitting while Claude answers used to lose the prompt and the partial reply
	// alike, since nothing was written before the turn ended.
	it("keeps the prompt and the partial answer of a turn that never ends", async () => {
		const { driver, controller, saved } = storedHarness(EMPTY_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()

		await controller.send("bonjour")
		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })
		driver.pushEvent({ type: "messageDelta", id: "msg-1", seq: 1, text: "Bon" })
		driver.pushEvent({ type: "messageDelta", id: "msg-1", seq: 2, text: "jour" })
		await vi.advanceTimersByTimeAsync(PERSIST_MS)

		expect(controller.getState().turn).toBe("running")
		expect(saved.at(-1)?.messages).toEqual([
			expect.objectContaining({ role: "user", text: "bonjour" }),
			expect.objectContaining({ text: "Bonjour", completion: "cancelled" }),
		])
	})

	it("throttles the streaming write to once a second, not once per delta", async () => {
		const { driver, controller, saved } = storedHarness(EMPTY_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()

		await controller.send("bonjour")
		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })

		const deltas = 40
		for (let seq = 1; seq <= deltas; seq += 1) {
			driver.pushEvent({ type: "messageDelta", id: "msg-1", seq, text: "x" })
			await vi.advanceTimersByTimeAsync(PERSIST_MS / 20)
		}

		expect(controller.getState().messages.at(-1)?.text).toHaveLength(deltas)
		expect(saved).toHaveLength(3)
	})

	// The persisted snapshot is what a cold start paints, so a message left
	// mid-stream would come back as a failed bubble the reader never saw fail.
	it("persists a settled transcript, never a message mid-stream", async () => {
		const { driver, controller, saved } = storedHarness(EMPTY_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()

		driver.pushEvent({ type: "turnChanged", state: "submitting" })
		driver.pushEvent({
			type: "messageStarted",
			message: {
				id: "msg-1",
				role: "assistant",
				text: "Bonjour",
				completion: "streaming",
				timestamp: 0,
			},
		})
		driver.pushEvent({
			type: "turnEnded",
			ended: { sessionId: "s-live", outcome: "completed" },
		})

		expect(saved).toHaveLength(1)
		expect(saved[0].sessionId).toBe("s-live")
		expect(saved[0].messages).toEqual([
			expect.objectContaining({ id: "msg-1", completion: "complete" }),
		])
	})

	it("never reuses a restored message id on the next prompt", async () => {
		const { controller } = storedHarness(STORED_SNAPSHOT)
		await controller.boot()
		await vi.runAllTimersAsync()

		await controller.send("et après ?")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(
			state.messages
				.filter((message) => message.role === "user")
				.map((message) => message.id),
		).toEqual(["local-3", "local-4"])
	})

	it("stops notifying detached listeners", async () => {
		const { controller, detach } = await startedHarness()
		detach()
		await vi.runAllTimersAsync()
		const before = controller.getState()
		await controller.send("bonjour")
		await vi.runAllTimersAsync()
		expect(controller.getState().messages).toHaveLength(
			before.messages.length + 1,
		)
		expect(controller.getState().messages.at(-1)?.role).toBe("user")
	})
})
