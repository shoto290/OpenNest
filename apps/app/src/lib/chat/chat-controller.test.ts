import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"

import type { ChatMessage, ClaudeEvent } from "../claude/contract"
import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import type {
	TranscriptCompletion,
	TranscriptMessage,
} from "../conversations/transcript-contract"
import { message as storedMessage } from "../conversations/transcript-fixtures"
import { isTerminalCompletion } from "../conversations/transcript-state"

const STEP_MS = 10
const REPLY = "one two three four five six"

const STREAMING_MESSAGE: ChatMessage = {
	id: "msg-1",
	role: "assistant",
	text: "",
	completion: "streaming",
	timestamp: 0,
}

type Harness = {
	driver: FakeChatDriver
	store: TranscriptStore
	controller: ChatController
	detach: () => void
}

type HarnessOptions = {
	store?: TranscriptStore
	replyFor?: (prompt: string) => string
	driver?: (fake: FakeChatDriver) => ChatDriver
}

let launches = 0

/** One controller over one store, with ids of its own so a second launch on the
 * same store can never mint an id the first one already wrote. */
const createHarness = (options: HarnessOptions = {}): Harness => {
	launches += 1
	const launch = launches
	let minted = 0
	let clock = 1000
	const fake = createFakeChatDriver({
		stepMs: STEP_MS,
		replyFor: options.replyFor ?? (() => REPLY),
	})
	const store = options.store ?? createFakeTranscriptStore()
	const driver = options.driver ? options.driver(fake) : fake
	const controller = createChatController(driver, store, {
		newId: () => {
			minted += 1
			return `launch-${launch}-${minted}`
		},
		now: () => {
			clock += 1
			return clock
		},
	})
	return { driver: fake, store, controller, detach: controller.attach() }
}

const bootedHarness = async (
	options: HarnessOptions = {},
): Promise<Harness> => {
	const harness = createHarness(options)
	await harness.controller.boot()
	await vi.runAllTimersAsync()
	return harness
}

/** What a cold start paints: a controller that has only ever read the store. */
const reload = async (store: TranscriptStore): Promise<TranscriptMessage[]> => {
	const harness = await bootedHarness({ store })
	const { messages } = harness.controller.getState()
	harness.detach()
	return messages
}

const spoken = (messages: TranscriptMessage[]) =>
	messages.map((message) => [message.role, message.content, message.completion])

const seeded = (count: number): TranscriptMessage[] =>
	Array.from({ length: count }, (_, index) =>
		storedMessage({
			id: `stored-${index + 1}`,
			conversationId: FAKE_CHAT_ID,
			seq: index + 1,
			role: index % 2 === 0 ? "user" : "assistant",
			content: `stored ${index + 1}`,
		}),
	)

describe("createChatController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("runs a happy-path turn and stores everything the reader can see", async () => {
		const { controller, store, detach } = await bootedHarness()

		const sending = controller.send("hello")
		await sending
		expect(controller.getState().turn).toBe("submitting")

		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(spoken(state.messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(state.activities.at(-1)?.status).toBe("succeeded")
		expect(state.errors).toEqual([])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
		detach()
	})

	// The prompt is on the record before Claude is asked anything: an answer to a
	// question no reload could show is worse than a prompt that never left.
	it("writes the prompt down before it submits it", async () => {
		const order: string[] = []
		const store = createFakeTranscriptStore()
		const { controller } = await bootedHarness({
			store: {
				...store,
				appendUserMessage: (message) => {
					order.push("stored")
					return store.appendUserMessage(message)
				},
			},
			driver: (fake) => ({
				...fake,
				submitPrompt: (text) => {
					order.push("submitted")
					return fake.submitPrompt(text)
				},
			}),
		})

		await controller.send("hello")

		expect(order).toEqual(["stored", "submitted"])
	})

	it.each(["startTurn", "appendUserMessage"] as const)(
		"never submits a prompt the store refused at %s",
		async (member) => {
			const store = createFakeTranscriptStore()
			const refusal = {
				kind: "storage",
				failure: { kind: "poisonedConnection" },
			}
			const { controller, driver } = await bootedHarness({
				store: { ...store, [member]: () => Promise.reject(refusal) },
			})
			const submitSpy = vi.spyOn(driver, "submitPrompt")

			await controller.send("hello")
			await vi.runAllTimersAsync()

			const state = controller.getState()
			expect(submitSpy).not.toHaveBeenCalled()
			expect(state.messages).toEqual([])
			expect(state.turn).toBe("failed")
			expect(state.errors.at(-1)?.error).toEqual({
				kind: "writeFailed",
				detail: "the transcript store refused it (storage)",
			})
			expect(await reload(store)).toEqual([])
		},
	)

	/** The reader may be shown less than the store holds — a write still in flight
	 * is not a lie — but never more: no id, no word and no ending on screen that a
	 * relaunch would fail to bring back. */
	const neverAheadOfStorage = (
		visible: TranscriptMessage[],
		stored: TranscriptMessage[],
	) => {
		expect(visible.map((message) => message.id)).toEqual(
			stored.map((message) => message.id),
		)
		expect(visible.map((message) => message.content)).toEqual(
			stored.map((message) => message.content),
		)
		for (const [index, message] of visible.entries()) {
			if (isTerminalCompletion(message.completion)) {
				expect(message.completion).toBe(stored[index].completion)
			}
		}
	}

	const refusingStore = (
		member: "openAssistantMessage" | "appendText" | "finalizeMessage",
	) => {
		const store = createFakeTranscriptStore()
		return {
			...store,
			[member]: () =>
				Promise.reject({
					kind: "storage",
					failure: { kind: "poisonedConnection" },
				}),
		}
	}

	// A reply the store never took has nothing on screen to lose: the row is not
	// shown, and the deltas and the ending that follow it find nothing to move.
	it("shows no reply at all when the store refuses to open it", async () => {
		const store = refusingStore("openAssistantMessage")
		const { controller } = await bootedHarness({ store })

		await controller.send("hello")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(spoken(state.messages)).toEqual([["user", "hello", "complete"]])
		expect(state.errors.at(-1)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (storage)",
		})
		neverAheadOfStorage(state.messages, await reload(store))
	})

	// The words are the write. One the store refused is one the reader must not be
	// reading, however far the stream got.
	it("shows no word of a reply the store refused to write", async () => {
		const store = refusingStore("appendText")
		const { controller } = await bootedHarness({ store })

		await controller.send("hello")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: "",
		})
		expect(state.errors.at(-1)?.error.kind).toBe("writeFailed")
		neverAheadOfStorage(state.messages, await reload(store))
	})

	// An ending the store refused leaves the message open on disk. The screen says
	// the same: still unfinished, which is what the next launch reads back.
	it("never settles a reply the store refused to close", async () => {
		const store = refusingStore("finalizeMessage")
		const { controller } = await bootedHarness({ store })

		await controller.send("hello")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		const answer = state.messages.at(-1)
		expect(answer).toMatchObject({ content: REPLY, completion: "streaming" })
		expect(state.errors.at(-1)?.error.kind).toBe("writeFailed")

		const stored = await reload(store)
		expect(stored.at(-1)).toMatchObject({
			content: REPLY,
			completion: "interrupted",
		})
		neverAheadOfStorage(state.messages, stored)
	})

	it("refuses a second prompt while a turn is running", async () => {
		const { controller } = await bootedHarness()
		await controller.send("first")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await controller.send("second")

		const state = controller.getState()
		expect(
			state.messages.filter((message) => message.role === "user"),
		).toHaveLength(1)
		expect(state.errors.at(-1)?.error.kind).toBe("turnAlreadyRunning")
	})

	it("stores a stopped turn as cancelled, with the words it had", async () => {
		const { controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		await vi.runAllTimersAsync()

		const answer = controller.getState().messages.at(-1)
		expect(controller.getState().turn).toBe("idle")
		expect(answer?.completion).toBe("cancelled")
		expect(answer?.content.length).toBeGreaterThan(0)
		expect(answer?.content.length).toBeLessThan(REPLY.length)
		expect(spoken(await reload(store))).toEqual(
			spoken(controller.getState().messages),
		)
	})

	it("stores a failed turn as failed, with the words it had", async () => {
		const { controller, store } = await bootedHarness()

		await controller.send("explain /fail")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.errors.at(-1)?.error.kind).toBe("crashed")
		expect(state.messages.at(-1)?.completion).toBe("failed")
		expect(state.messages.at(-1)?.content.length).toBeGreaterThan(0)
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	// The process went away under the stream. Nothing observed it fail and nobody
	// stopped it, so it is neither failed nor cancelled.
	it("stores a reply the session died under as interrupted", async () => {
		const { driver, controller, store } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })
		driver.pushEvent({
			type: "messageDelta",
			id: "msg-1",
			seq: 1,
			text: "Half",
		})

		await controller.restart()
		await vi.runAllTimersAsync()

		expect(spoken(controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half", "interrupted"],
		])
		expect(spoken(await reload(store))).toEqual(
			spoken(controller.getState().messages),
		)
	})

	// Nothing on disk can resume a stream, so a launch that finds one reads it as
	// the interruption it is, rather than as a message still being written.
	it("reads a reply left mid-stream by a dead host back as interrupted", async () => {
		const store = createFakeTranscriptStore({
			messages: [
				storedMessage({
					id: "m-1",
					conversationId: FAKE_CHAT_ID,
					seq: 1,
					role: "user",
					content: "hello",
				}),
				storedMessage({
					id: "m-2",
					conversationId: FAKE_CHAT_ID,
					seq: 2,
					content: "Half an ans",
					completion: "streaming",
				}),
			],
		})

		expect(spoken(await reload(store))).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half an ans", "interrupted"],
		])
	})

	it("keeps a replayed start, a late delta and a second ending harmless", async () => {
		const { driver, controller, store } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")

		driver.pushEvent({ type: "turnChanged", state: "running" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })
		driver.pushEvent({ type: "messageDelta", id: "msg-1", seq: 1, text: "Hel" })
		driver.pushEvent({ type: "messageStarted", message: STREAMING_MESSAGE })
		driver.pushEvent({ type: "messageDelta", id: "msg-1", seq: 2, text: "lo" })
		driver.pushEvent({ type: "messageDelta", id: "msg-1", seq: 1, text: "Hel" })
		driver.pushEvent({
			type: "turnEnded",
			ended: { sessionId: "s-1", outcome: "completed" },
		})
		driver.pushEvent({
			type: "messageDelta",
			id: "msg-1",
			seq: 9,
			text: " late",
		})
		driver.pushEvent({
			type: "turnEnded",
			ended: { sessionId: "s-1", outcome: "failed" },
		})
		driver.pushEvent({
			type: "messageCompleted",
			message: { ...STREAMING_MESSAGE, text: "", completion: "cancelled" },
		})
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(spoken(state.messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "Hello", "complete"],
		])
		expect(state.errors).toEqual([])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	// A restart re-subscribes, so a frame the dead session emits late reaches the
	// listener it was registered with, which still carries the old epoch.
	it("writes nothing for events from the session that died", async () => {
		const listeners: Array<(event: ClaudeEvent) => void> = []
		const { controller, store } = await bootedHarness({
			driver: (fake) => ({
				...fake,
				subscribe: (onEvent) => {
					listeners.push(onEvent)
					return fake.subscribe(onEvent)
				},
			}),
		})
		await controller.send("hello")
		await vi.runAllTimersAsync()

		await controller.restart()
		await vi.runAllTimersAsync()
		const restarted = controller.getState().messages
		const deadListener = listeners[0]

		deadListener({ type: "turnChanged", state: "running" })
		deadListener({
			type: "messageStarted",
			message: { ...STREAMING_MESSAGE, id: "ghost" },
		})
		deadListener({
			type: "messageDelta",
			id: "msg-1",
			seq: 99,
			text: "phantom",
		})
		deadListener({
			type: "turnEnded",
			ended: { sessionId: "dead", outcome: "failed" },
		})
		await vi.runAllTimersAsync()

		expect(controller.getState().messages).toEqual(restarted)
		expect(controller.getState().turn).toBe("idle")
		expect(spoken(await reload(store))).toEqual(spoken(restarted))
	})

	it("marks the prompt Claude refused without touching the row it stored", async () => {
		const store = createFakeTranscriptStore()
		let failNext = true
		const { controller } = await bootedHarness({
			store,
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				submitPrompt: (text) => {
					if (failNext) {
						failNext = false
						return Promise.reject({
							kind: "writeFailed",
							detail: "network down",
						})
					}
					return fake.submitPrompt(text)
				},
			}),
		})

		await controller.send("hello")
		const failed = controller.getState()
		expect(failed.turn).toBe("failed")
		expect(failed.rejectedPromptId).toBe(failed.messages[0].id)
		expect(failed.messages[0].completion).toBe("complete")
		expect(failed.errors.at(-1)?.error.kind).toBe("writeFailed")

		await controller.retry(failed.messages[0].id)
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(state.rejectedPromptId).toBeNull()
		expect(spoken(state.messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "one two three", "complete"],
		])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("retries nothing but the prompt that was refused", async () => {
		const { controller } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const settled = controller.getState()

		await controller.retry(settled.messages[0].id)

		expect(controller.getState()).toBe(settled)
	})

	it("leaves stopping deterministically when cancelTurn is rejected", async () => {
		const { controller } = await bootedHarness({
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				cancelTurn: () =>
					Promise.reject({ kind: "writeFailed", detail: "pipe closed" }),
			}),
		})
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		const rejected = controller.getState()
		expect(rejected.turn).toBe("failed")
		expect(rejected.errors.at(-1)?.error.kind).toBe("writeFailed")

		await vi.runAllTimersAsync()
		expect(controller.getState().turn).not.toBe("stopping")

		await controller.send("here we go again")
		await vi.runAllTimersAsync()
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().messages.at(-1)?.completion).toBe("complete")
	})

	it("pauses on a permission request and resumes on allowOnce", async () => {
		const { controller } = await bootedHarness()
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

	it("cancels the turn when the permission is denied", async () => {
		const { controller, store } = await bootedHarness()
		await controller.send("delete everything /permission")
		await vi.runAllTimersAsync()

		const paused = controller.getState()
		await controller.respond(paused.permission?.id ?? "", "deny")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.permission).toBeNull()
		expect(state.turn).toBe("idle")
		expect(state.messages.at(-1)?.completion).toBe("cancelled")
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("leaves no permission activity pending after either decision", async () => {
		for (const decision of ["allowOnce", "deny"] as const) {
			const { controller } = await bootedHarness()
			await controller.send("list the files /permission")
			await vi.runAllTimersAsync()

			const paused = controller.getState()
			expect(paused.permission).not.toBeNull()

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

	it("rejects a prompt sent before the session starts", async () => {
		const harness = createHarness()
		await harness.controller.boot()
		vi.spyOn(harness.driver, "submitPrompt").mockRejectedValue({
			kind: "notStarted",
		})

		await harness.controller.send("hello")

		const state = harness.controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.errors.at(-1)?.error.kind).toBe("notStarted")
		// It was written down all the same: the reader wrote it, and the store took it.
		expect(spoken(state.messages)).toEqual([["user", "hello", "complete"]])
	})

	it("says so instead of writing when the store never opened the conversation", async () => {
		const store = createFakeTranscriptStore()
		const { controller, driver } = createHarness({
			store: {
				...store,
				mainChat: () => Promise.reject({ kind: "unavailable" }),
			},
		})
		const submitSpy = vi.spyOn(driver, "submitPrompt")
		await controller.boot()
		await vi.runAllTimersAsync()

		await controller.send("hello")

		expect(controller.getState().conversationId).toBeNull()
		expect(controller.getState().errors.at(0)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (unavailable)",
		})
		expect(submitSpy).not.toHaveBeenCalled()
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

	// Tauri registers event listeners over IPC, so a subscription is not live the
	// moment `subscribe()` is called. A session that emits from inside
	// `startOrResumeSession` is exactly the window this guards.
	it("waits for the subscription before starting, so startup events are not lost", async () => {
		let listener: ((event: ClaudeEvent) => void) | null = null
		const { controller } = createHarness({
			driver: (fake) => ({
				...fake,
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
			}),
		})

		await controller.preflight()

		expect(controller.getState().sessionId).toBe("s-1")
	})

	// The transcript is durable; the session that produced it is not. Resuming a
	// provider session across launches is a runtime concern this no longer keeps.
	it("boots on the stored transcript without resuming anything", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(4) })
		const { driver, controller } = createHarness({ store })
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.boot()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).toHaveBeenCalledWith(undefined)
		expect(state.conversationId).toBe(FAKE_CHAT_ID)
		expect(state.messages.map((message) => message.id)).toEqual([
			"stored-1",
			"stored-2",
			"stored-3",
			"stored-4",
		])
		expect(state.hasOlder).toBe(false)
		expect(isSessionReady(state)).toBe(true)
	})

	it("still opens a session when the stored transcript cannot be read", async () => {
		const store = createFakeTranscriptStore()
		const { controller } = createHarness({
			store: { ...store, loadPage: () => Promise.reject({ kind: "storage" }) },
		})

		await controller.boot()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.messages).toEqual([])
		expect(state.errors.at(-1)?.error.kind).toBe("writeFailed")
		expect(isSessionReady(state)).toBe(true)
	})

	it("resumes the id this launch learned when the restart affordance is used", async () => {
		const { driver, controller } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const sessionId = controller.getState().sessionId
		expect(sessionId).not.toBeNull()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.restart()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith(sessionId)
	})

	it("stops notifying detached listeners", async () => {
		const { controller, detach } = await bootedHarness()
		detach()
		await vi.runAllTimersAsync()

		await controller.send("hello")
		await vi.runAllTimersAsync()

		expect(spoken(controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
		])
	})
})

describe("history above the transcript", () => {
	const HISTORY = 250

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("walks back through a history far longer than one page, once each", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(HISTORY) })
		const { controller } = await bootedHarness({ store })

		const tail = controller.getState()
		expect(tail.messages).toHaveLength(20)
		expect(tail.messages.at(-1)?.id).toBe(`stored-${HISTORY}`)
		expect(tail.hasOlder).toBe(true)

		let pages = 0
		while (controller.getState().hasOlder && pages < HISTORY) {
			pages += 1
			await controller.loadOlder()
		}

		const state = controller.getState()
		const ids = state.messages.map((message) => message.id)
		expect(state.hasOlder).toBe(false)
		expect(state.loadingOlder).toBe(false)
		expect(ids).toHaveLength(HISTORY)
		expect(new Set(ids).size).toBe(HISTORY)
		expect(state.messages.map((message) => message.seq)).toEqual(
			Array.from({ length: HISTORY }, (_, index) => index + 1),
		)
		expect(ids[0]).toBe("stored-1")
	})

	it("asks for nothing more once the beginning has been reached", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(4) })
		let reads = 0
		const { controller } = await bootedHarness({
			store: {
				...store,
				loadPage: (conversationId, cursor) => {
					reads += 1
					return store.loadPage(conversationId, cursor)
				},
			},
		})
		expect(reads).toBe(1)

		await controller.loadOlder()
		await controller.loadOlder()

		expect(reads).toBe(1)
		expect(controller.getState().messages).toHaveLength(4)
	})

	it("keeps a prompt sent after paging at the end of the transcript", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(HISTORY) })
		const { controller } = await bootedHarness({ store })
		await controller.loadOlder()

		await controller.send("and then?")
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.messages).toHaveLength(42)
		expect(spoken(state.messages).slice(-2)).toEqual([
			["user", "and then?", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(
			state.messages.every(
				(message, index) =>
					index === 0 || message.seq > state.messages[index - 1].seq,
			),
		).toBe(true)
	})

	it("reads one page at a time, however often it is asked", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(HISTORY) })
		let inFlight = 0
		let overlapped = false
		const { controller } = await bootedHarness({
			store: {
				...store,
				loadPage: async (conversationId, cursor) => {
					inFlight += 1
					overlapped ||= inFlight > 1
					const page = await store.loadPage(conversationId, cursor)
					inFlight -= 1
					return page
				},
			},
		})

		await Promise.all([
			controller.loadOlder(),
			controller.loadOlder(),
			controller.loadOlder(),
		])

		expect(overlapped).toBe(false)
		expect(controller.getState().messages).toHaveLength(40)
	})
})

describe("every ending survives a launch", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const endings: [string, string, TranscriptCompletion][] = [
		["a turn that finished", "hello", "complete"],
		["a turn that crashed", "explain /fail", "failed"],
	]

	it.each(endings)(
		"brings %s back as it ended",
		async (_name, prompt, ending) => {
			const { controller, store } = await bootedHarness()

			await controller.send(prompt)
			await vi.runAllTimersAsync()

			const live = controller.getState().messages
			expect(live.at(-1)?.completion).toBe(ending)
			expect(spoken(await reload(store))).toEqual(spoken(live))
		},
	)
})
