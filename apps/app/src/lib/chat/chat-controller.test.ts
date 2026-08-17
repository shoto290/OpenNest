import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"
import { ASKED_FOR, NEARING_THE_BOUND, REFUSED, STOPPED } from "./rotation"

import type {
	ChatMessage,
	ClaudeEvent,
	RuntimeScope,
	ScopedEvent,
} from "../claude/contract"
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

/** A whole turn, from a process that is still talking. Everything a late frame
 * could move is in it: the turn state, a reply of its own, words for it, the
 * provider's id and an ending. */
const STALE_TURN: ClaudeEvent[] = [
	{ type: "turnChanged", state: "running" },
	{ type: "sessionReady", sessionId: "dead", resumed: false },
	{
		type: "messageStarted",
		message: { ...STREAMING_MESSAGE, id: "ghost" },
	},
	{ type: "messageDelta", id: "ghost", seq: 1, text: "phantom" },
	{
		type: "activity",
		activity: {
			id: "ghost-act",
			title: "Read",
			kind: "tool",
			status: "running",
		},
	},
	{ type: "turnEnded", ended: { sessionId: "dead", outcome: "failed" } },
]

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
	promptsPerRun?: number
	botId?: string
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
	const base = options.store ?? createFakeTranscriptStore()
	const store = options.botId
		? {
				...base,
				defaultBot: () =>
					Promise.resolve({
						id: options.botId ?? "",
						name: "Second",
						model: "sonnet",
						createdAt: 0,
					}),
			}
		: base
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
		promptsPerRun: options.promptsPerRun,
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

/** The run the launch is holding, for a test that has to name it the way the host
 * does. Refuses rather than narrows: a controller with no run is a test that never
 * got as far as what it is about. */
const runOf = (controller: ChatController): RuntimeScope => {
	const runtime = controller.getState().runtime
	if (!runtime) {
		throw new Error("the launch holds no run")
	}
	return runtime
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

		// Submitted, and the turn still on its way: the driver answers on a timer.
		await controller.send("hello")
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
				submitPrompt: (scope, text) => {
					order.push("submitted")
					return fake.submitPrompt(scope, text)
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

	// The whole point of scoping the stream. A replaced session keeps streaming
	// until its child is gone, and the host delivers on one channel — so these
	// frames reach the live subscription, under the run that produced them. Not one
	// of them may reach the transcript or the screen, and the run this launch does
	// hold has to go on working right after.
	it("lets nothing from a replaced run touch the transcript or the screen", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const replaced = controller.getState().runtime

		await controller.restart()
		await vi.runAllTimersAsync()
		const live = controller.getState().runtime
		const restarted = controller.getState().messages
		expect(replaced).not.toBeNull()
		expect(live?.runtimeSessionId).not.toBe(replaced?.runtimeSessionId)
		expect(live?.epoch).toBe((replaced?.epoch ?? 0) + 1)

		for (const late of STALE_TURN) {
			driver.pushEvent(late, replaced)
		}
		await vi.runAllTimersAsync()

		expect(controller.getState().messages).toEqual(restarted)
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().activities).toEqual([])
		expect(controller.getState().sessionId).not.toBe("dead")
		expect(spoken(await reload(store))).toEqual(spoken(restarted))

		await controller.send("and now?")
		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.turn).toBe("idle")
		expect(spoken(state.messages).slice(-2)).toEqual([
			["user", "and now?", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	// The dangerous half: a replaced run reporting while the run that took its place
	// is mid-turn. Its words are addressed to a row that really is open and its
	// ending really would settle it, so nothing but the run it names keeps it off
	// the transcript.
	it("lets a replaced run end nothing of the turn running in its place", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const replaced = runOf(controller)

		await controller.restart()
		await vi.runAllTimersAsync()
		await controller.send("again")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		const streaming = controller.getState().messages.at(-1)
		expect(streaming?.completion).toBe("streaming")

		driver.pushEvent(
			{
				type: "messageDelta",
				id: streaming?.id ?? "",
				seq: 99,
				text: " phantom",
			},
			replaced,
		)
		driver.pushEvent(
			{ type: "turnEnded", ended: { sessionId: "dead", outcome: "failed" } },
			replaced,
		)
		await vi.advanceTimersByTimeAsync(0)

		const interfered = controller.getState()
		expect(interfered.turn).toBe("running")
		expect(interfered.messages.at(-1)?.content).not.toContain("phantom")
		expect(interfered.messages.at(-1)?.completion).toBe("streaming")

		await vi.runAllTimersAsync()
		const settled = controller.getState()
		expect(settled.turn).toBe("idle")
		expect(spoken(settled.messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
		expect(spoken(await reload(store))).toEqual(spoken(settled.messages))
	})

	// The same frames under the run this launch holds: they are taken. Without
	// this, the test above would pass on a controller that ignores everything.
	it("still takes the same frames when they come from the run it holds", async () => {
		const { driver, controller } = await bootedHarness()
		vi.spyOn(driver, "submitPrompt").mockResolvedValue()
		await controller.send("hello")
		const live = controller.getState().runtime

		for (const event of STALE_TURN) {
			driver.pushEvent(event, live)
		}
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.turn).toBe("failed")
		expect(state.sessionId).toBe("dead")
		expect(spoken(state.messages).at(-1)).toEqual([
			"assistant",
			"phantom",
			"failed",
		])
	})

	it("marks the prompt Claude refused without touching the row it stored", async () => {
		const store = createFakeTranscriptStore()
		let failNext = true
		const { controller } = await bootedHarness({
			store,
			replyFor: () => "one two three",
			driver: (fake) => ({
				...fake,
				submitPrompt: (scope, text) => {
					if (failNext) {
						failNext = false
						return Promise.reject({
							kind: "writeFailed",
							detail: "network down",
						})
					}
					return fake.submitPrompt(scope, text)
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
		const { driver, controller } = await bootedHarness()
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

	// A process nothing can attribute is a process whose every event is a guess, so
	// a launch with no conversation opens no run and asks for no child.
	it("starts nothing at all while there is no conversation to scope it by", async () => {
		const store = createFakeTranscriptStore()
		const { driver, controller } = createHarness({
			store: {
				...store,
				mainChat: () => Promise.reject({ kind: "unavailable" }),
			},
		})
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		expect(await controller.boot()).toBeNull()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).not.toHaveBeenCalled()
		expect(state.runtime).toBeNull()
		expect(state.sessionOpen).toBe(false)
		expect(state.errors.at(-1)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (unavailable)",
		})
	})

	// The run is a durable row, and a store that cannot open one has not given this
	// launch a scope: starting anyway would put a child behind an epoch nobody wrote.
	it("starts nothing when the store cannot open the run", async () => {
		const store = createFakeTranscriptStore()
		const { driver, controller } = createHarness({
			store: {
				...store,
				openRuntimeSession: () =>
					Promise.reject({
						kind: "storage",
						failure: { kind: "poisonedConnection" },
					}),
			},
		})
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		expect(await controller.boot()).toBeNull()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).not.toHaveBeenCalled()
		expect(state.runtime).toBeNull()
		expect(state.conversationId).toBe(FAKE_CHAT_ID)
		expect(state.errors.at(-1)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (storage)",
		})
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
		let listener: ((event: ScopedEvent) => void) | null = null
		const { controller } = createHarness({
			driver: (fake) => ({
				...fake,
				startOrResumeSession: (scope) => {
					listener?.({
						scope,
						event: { type: "sessionReady", sessionId: "s-1", resumed: false },
					})
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

		await controller.boot()

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
		expect(startSpy).toHaveBeenCalledWith(state.runtime, undefined)
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

	// The id carries over, the run does not: a restart is a new process, so it takes
	// the next row of the lineage and every command after it names that one.
	it("resumes the id this launch learned under a run of its own", async () => {
		const { driver, controller } = await bootedHarness()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const sessionId = controller.getState().sessionId
		const replaced = controller.getState().runtime
		expect(sessionId).not.toBeNull()
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		const submitSpy = vi.spyOn(driver, "submitPrompt")

		await controller.restart()
		await vi.runAllTimersAsync()
		await controller.send("again")
		await vi.runAllTimersAsync()

		const live = controller.getState().runtime
		expect(startSpy).toHaveBeenCalledWith(live, sessionId)
		expect(submitSpy).toHaveBeenCalledWith(live, "again")
		expect(live?.runtimeSessionId).not.toBe(replaced?.runtimeSessionId)
	})

	// Stopping, dying and shutting down all end a run, and none of them may end the
	// one that came after. The refusals are the host's — the fake holds the same
	// rule — and a shutdown asked for twice stays a shutdown.
	it("keeps a stop and a shutdown from reaching the run that replaced them", async () => {
		const { driver, controller, store } = await bootedHarness()
		await controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 5)
		expect(controller.getState().turn).toBe("running")

		await controller.stop()
		await vi.runAllTimersAsync()
		expect(controller.getState().turn).toBe("idle")
		expect(controller.getState().messages.at(-1)?.completion).toBe("cancelled")
		const replaced = runOf(controller)

		await controller.restart()
		await vi.runAllTimersAsync()
		const live = runOf(controller)

		const staleStop = driver.cancelTurn(replaced)
		const staleShutdown = driver.shutdown(replaced)

		await expect(staleStop).rejects.toEqual({
			kind: "staleRuntimeSession",
			runtimeSessionId: replaced.runtimeSessionId,
		})
		await expect(staleShutdown).rejects.toEqual({
			kind: "staleRuntimeSession",
			runtimeSessionId: replaced.runtimeSessionId,
		})

		await controller.send("still there?")
		await vi.runAllTimersAsync()
		expect(runOf(controller)).toEqual(live)
		expect(controller.getState().turn).toBe("idle")
		expect(spoken(controller.getState().messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])

		await controller.shutdown()
		await controller.shutdown()

		expect(
			controller.getState().errors.map((entry) => entry.error.kind),
		).toEqual([])
		expect(spoken(await reload(store))).toEqual(
			spoken(controller.getState().messages),
		)
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

describe("a run replaced under a conversation that carries on", () => {
	/** Long enough that a checkpoint has something to fold under the tail, and that
	 * the tail cannot reach the beginning of the chat. */
	const HISTORY = 30
	const REFUSAL = {
		kind: "storage",
		failure: { kind: "poisonedConnection" },
	}

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const withHistory = () =>
		createFakeTranscriptStore({ messages: seeded(HISTORY) })

	const occurrences = (text: string, needle: string) =>
		text.split(needle).length - 1

	/** A store that answers as the host would until it is told to refuse one of the
	 * two calls a reconstruction is made of. The switch is the point: the same
	 * conversation is shown before the refusal, under it, and after it, which is the
	 * only way to prove a refusal cost nothing the recovery could not put back. */
	const refusingStoreAt = (
		member: "captureCheckpoint" | "boundedContext",
	): TranscriptStore & { refuse: (on: boolean) => void } => {
		const base = withHistory()
		let refusing = false
		const refused = () => Promise.reject(REFUSAL)
		return {
			...base,
			refuse: (on: boolean) => {
				refusing = on
			},
			captureCheckpoint: (conversationId, botId, runtimeSessionId, at) =>
				refusing && member === "captureCheckpoint"
					? refused()
					: base.captureCheckpoint(conversationId, botId, runtimeSessionId, at),
			boundedContext: (conversationId, botId, promptMessageId) =>
				refusing && member === "boundedContext"
					? refused()
					: base.boundedContext(conversationId, botId, promptMessageId),
		}
	}

	/** Everything the chat has ever said, in a context made of a summary and a tail
	 * alone. What the tail cannot reach has to have been folded, so a message in
	 * neither is a stretch of the conversation the reconstruction lost — which is
	 * exactly what a refused fold would take with it if a run were replaced anyway. */
	const expectWholeChat = (context: string, alsoSaid: string[]) => {
		for (let index = 1; index <= HISTORY; index += 1) {
			expect(context).toContain(`stored ${index}\n`)
		}
		for (const said of alsoSaid) {
			expect(context).toContain(`${said}\n`)
		}
	}

	/** What the run was really told, which is not what the reader typed: the first
	 * prompt of a run carries the whole context rebuilt for it. */
	const told = (submitted: { mock: { calls: unknown[][] } }) =>
		String(submitted.mock.calls.at(-1)?.[1] ?? "")

	/** Every run this bot opened, in order, and why it replaced the one before it.
	 * The first is always `null`: it replaces nothing. */
	const reasons = (opened: { mock: { calls: unknown[][] } }, botId: string) =>
		opened.mock.calls
			.filter((call) => call[1] === botId)
			.map((call) => call[3] ?? null)

	// The preventive rotation: the run is replaced while it still answers, and the
	// prompt that triggered it is written once, submitted once, and carried into the
	// new process with everything it needs to answer.
	it("replaces a run that has carried its share and hands the new one the conversation", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const captured = vi.spyOn(store, "captureCheckpoint")
		const { controller, driver } = await bootedHarness({
			store,
			promptsPerRun: 1,
		})
		const submitted = vi.spyOn(driver, "submitPrompt")
		const first = runOf(controller)
		const before = controller.getState().messages

		await controller.send("first")
		await vi.runAllTimersAsync()
		const carried = runOf(controller)
		await controller.send("second")
		await vi.runAllTimersAsync()

		expect(carried).toEqual(first)
		expect(reasons(opened, "default")).toEqual([null, NEARING_THE_BOUND])
		expect(captured.mock.calls.map((call) => call[2])).toContain(
			first.runtimeSessionId,
		)
		expect(runOf(controller).epoch).toBe(first.epoch + 1)
		expect(told(submitted)).toContain("The new message:\nsecond")
		expect(occurrences(told(submitted), "second")).toBe(1)

		const state = controller.getState()
		expect(state.messages.slice(0, before.length)).toEqual(before)
		expect(spoken(state.messages).slice(-4)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(spoken(await reload(store)).slice(-4)).toEqual(
			spoken(state.messages).slice(-4),
		)
	})

	// A provider session refused: the host put a fresh child behind the same run, so
	// the conversation has to reach it some other way. The next prompt is what
	// rotates, and what it carries is the transcript rebuilt from the store.
	it("replaces a run whose provider session was refused, on the next prompt", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")
		const refused = runOf(controller)

		driver.pushEvent({
			type: "failed",
			error: { kind: "resumeFailed", forgotSessionId: true },
		})
		await vi.runAllTimersAsync()
		expect(runOf(controller)).toEqual(refused)

		await controller.send("where were we?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "default")).toEqual([null, REFUSED])
		expect(runOf(controller).runtimeSessionId).not.toBe(
			refused.runtimeSessionId,
		)
		expect(told(submitted)).toContain(`stored ${HISTORY}`)
		expect(occurrences(told(submitted), "where were we?")).toBe(1)
		expect(controller.getState().messages.at(-1)?.completion).toBe("complete")
	})

	// The child exited, which is what a provider refusing to carry a session any
	// further looks like from here — the CLI ends the process rather than the turn.
	// The run is spent, and the next prompt is answered by its replacement.
	it("replaces a run the provider stopped answering in", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")

		await controller.send("hello")
		await vi.runAllTimersAsync()
		const spent = runOf(controller)
		driver.pushEvent({
			type: "failed",
			error: { kind: "crashed", code: 9, detail: "claude exited unexpectedly" },
		})
		await vi.runAllTimersAsync()

		await controller.send("still there?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "default")).toEqual([null, STOPPED])
		expect(runOf(controller).runtimeSessionId).not.toBe(spent.runtimeSessionId)
		expect(told(submitted)).toContain("The new message:\nstill there?")
		expect(told(submitted)).toContain("user: hello")
		expect(controller.getState().turn).toBe("idle")
		expect(spoken(controller.getState().messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
	})

	// Asked for by hand, with nothing wrong: the fold lands, the run is closed out
	// under the reason, and the reader sees the same transcript before and after.
	it("replaces a run on request without moving anything the reader can see", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller } = await bootedHarness({ store })
		const replaced = runOf(controller)
		const before = controller.getState()

		await controller.rotate()
		await vi.runAllTimersAsync()

		expect(reasons(opened, "default")).toEqual([null, ASKED_FOR])
		expect(runOf(controller).epoch).toBe(replaced.epoch + 1)
		expect(controller.getState().messages).toEqual(before.messages)
		expect(controller.getState().hasOlder).toBe(before.hasOlder)
		expect(controller.getState().errors).toEqual([])
	})

	// A handover the store cannot fold for is not a handover. The run answering the
	// conversation is the only place it is still whole — a successor would be told
	// the summary that did land and the tail, and everything between them would be
	// gone from the answer while staying on the reader's screen. So the run stays,
	// keeps answering the prompts it can, and is replaced once the fold lands.
	it("retires no run while the fold its successor needs is refused", async () => {
		const store = refusingStoreAt("captureCheckpoint")
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver } = await bootedHarness({
			store,
			promptsPerRun: 1,
		})
		const submitted = vi.spyOn(driver, "submitPrompt")

		await controller.send("first")
		await vi.runAllTimersAsync()
		const holding = runOf(controller)
		store.refuse(true)
		await controller.send("second")
		await vi.runAllTimersAsync()

		// Nothing retired, nothing opened, and the run that holds the conversation
		// answered the prompt itself — it needs no context to be rebuilt for it.
		expect(runOf(controller)).toEqual(holding)
		expect(reasons(opened, "default")).toEqual([null])
		expect(told(submitted)).toBe("second")
		expect(controller.getState().errors.at(-1)?.error).toEqual({
			kind: "writeFailed",
			detail: "the transcript store refused it (storage)",
		})
		expect(spoken(controller.getState().messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])

		store.refuse(false)
		await controller.send("third")
		await vi.runAllTimersAsync()

		// The handover the refusal held back, once the store answers: the successor is
		// told the whole chat, the stretch no tail could reach included.
		expect(reasons(opened, "default")).toEqual([null, NEARING_THE_BOUND])
		expect(runOf(controller).epoch).toBe(holding.epoch + 1)
		expectWholeChat(told(submitted), ["first", "second"])
		expect(occurrences(told(submitted), "third")).toBe(1)
	})

	// The other half of the same rule, on the two calls a reconstruction is made of.
	// A run that was told nothing and cannot be told the conversation is given no
	// prompt at all: answered on its own, in the middle of a chat, it would reply as
	// if none of it had happened and nothing on the screen would say why. The prompt
	// stays on the record, and sending it again once the store answers carries the
	// whole of it, once.
	it.each(["captureCheckpoint", "boundedContext"] as const)(
		"gives a run that was told nothing no prompt of its own when %s is refused",
		async (member) => {
			const store = refusingStoreAt(member)
			const { controller, driver } = await bootedHarness({ store })
			const submitted = vi.spyOn(driver, "submitPrompt")
			store.refuse(true)

			await controller.send("where were we?")
			await vi.runAllTimersAsync()

			const refused = controller.getState()
			expect(submitted).not.toHaveBeenCalled()
			expect(refused.turn).toBe("failed")
			expect(refused.errors.at(-1)?.error).toEqual({
				kind: "writeFailed",
				detail: "the transcript store refused it (storage)",
			})
			// Written, shown, and the one the reader may send again.
			expect(spoken(refused.messages).at(-1)).toEqual([
				"user",
				"where were we?",
				"complete",
			])
			expect(refused.rejectedPromptId).toBe(refused.messages.at(-1)?.id)

			store.refuse(false)
			await controller.retry(refused.rejectedPromptId ?? "")
			await vi.runAllTimersAsync()

			expect(submitted).toHaveBeenCalledTimes(1)
			expectWholeChat(told(submitted), [])
			expect(occurrences(told(submitted), "where were we?")).toBe(1)
			const state = controller.getState()
			expect(state.turn).toBe("idle")
			expect(spoken(state.messages).slice(-2)).toEqual([
				["user", "where were we?", "complete"],
				["assistant", REPLY, "complete"],
			])
			expect(spoken(await reload(store)).slice(-2)).toEqual(
				spoken(state.messages).slice(-2),
			)
		},
	)

	// The dangerous one: a refused resume leaves a fresh child answering under the
	// same run, alive and knowing none of the chat. The run cannot be replaced while
	// the fold is refused, and that child must not be handed the question anyway.
	it("never lets a spent run answer on its own while the fold is refused", async () => {
		const store = refusingStoreAt("captureCheckpoint")
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")

		await controller.send("first")
		await vi.runAllTimersAsync()
		const spent = runOf(controller)
		driver.pushEvent({
			type: "failed",
			error: { kind: "resumeFailed", forgotSessionId: true },
		})
		await vi.runAllTimersAsync()
		store.refuse(true)
		submitted.mockClear()

		await controller.send("where were we?")
		await vi.runAllTimersAsync()

		expect(runOf(controller)).toEqual(spent)
		expect(reasons(opened, "default")).toEqual([null])
		expect(submitted).not.toHaveBeenCalled()
		expect(controller.getState().rejectedPromptId).toBe(
			controller.getState().messages.at(-1)?.id,
		)

		store.refuse(false)
		await controller.send("and now?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "default")).toEqual([null, REFUSED])
		expect(runOf(controller).epoch).toBe(spent.epoch + 1)
		expect(submitted).toHaveBeenCalledTimes(1)
		expectWholeChat(told(submitted), ["first", "where were we?"])
		expect(occurrences(told(submitted), "and now?")).toBe(1)
	})

	// A chat longer than any tail, on a launch that never rotated: what the tail
	// cannot reach is folded before the context is built, so the reconstruction is
	// the summary and the tail with nothing between them left out.
	it("leaves no stretch of the chat between the summary and the tail", async () => {
		const store = withHistory()
		const { controller, driver } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")

		await controller.send("where were we?")
		await vi.runAllTimersAsync()

		expect(told(submitted)).toContain("stored 1\n")
		expect(told(submitted)).toContain(`stored ${HISTORY}`)
		for (let index = 1; index <= HISTORY; index += 1) {
			expect(told(submitted)).toContain(`stored ${index}\n`)
		}
		expect(occurrences(told(submitted), "where were we?")).toBe(1)
	})

	// A launch that never saw any of it. The run it opens is told nothing by the
	// process it starts, so the first prompt of that run carries the conversation —
	// summary, tail and question — out of the file the previous launch left.
	it("carries the stored conversation into the first prompt of a cold launch", async () => {
		const store = withHistory()
		const first = await bootedHarness({ store })
		await first.controller.rotate()
		await vi.runAllTimersAsync()
		first.detach()

		const second = await bootedHarness({ store })
		const submitted = vi.spyOn(second.driver, "submitPrompt")
		await second.controller.send("where were we?")
		await vi.runAllTimersAsync()

		expect(told(submitted)).toContain("The conversation so far:")
		expect(told(submitted)).toContain(`stored ${HISTORY}`)
		expect(told(submitted)).toContain("The new message:\nwhere were we?")
		expect(occurrences(told(submitted), "where were we?")).toBe(1)
		second.detach()
	})

	// Two bots in one chat keep two lineages and two recovery points. One rotating
	// numbers its own runs and folds its own history; the other is left exactly
	// where it was, and is rebuilt from what it has itself.
	it("keeps two bots' runs and recovery points apart in one chat", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const captured = vi.spyOn(store, "captureCheckpoint")
		const first = await bootedHarness({ store })
		const second = await bootedHarness({ store, botId: "second" })
		const spoke = vi.spyOn(second.driver, "submitPrompt")
		const replaced = runOf(first.controller)

		await first.controller.rotate()
		await vi.runAllTimersAsync()
		await second.controller.send("and me?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "default")).toEqual([null, ASKED_FOR])
		expect(reasons(opened, "second")).toEqual([null])
		expect(runOf(first.controller).epoch).toBe(2)
		expect(runOf(second.controller).epoch).toBe(1)
		expect(runOf(second.controller).botId).toBe("second")
		// Each bot folds its own recovery point, naming a run of its own: one bot
		// rotating leaves the other exactly where it was.
		expect(captured.mock.calls.map((call) => [call[1], call[2]])).toEqual([
			["default", replaced.runtimeSessionId],
			["second", runOf(second.controller).runtimeSessionId],
		])
		expect(told(spoke)).toContain(`stored ${HISTORY}`)
		expect(occurrences(told(spoke), "and me?")).toBe(1)

		first.detach()
		second.detach()
	})
})

describe("a turn Claude answered with tools", () => {
	/** How many tool-only assistant messages one live prompt was measured to
	 * produce before the message that answered it. */
	const ROUNDS = 14

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	/** What the host reports for a tool call: an assistant message of its own,
	 * announced and never spoken in, and the tool it ran. */
	const toolRounds = (rounds: number): ClaudeEvent[] =>
		Array.from({ length: rounds }, (_, index) => index + 1).flatMap(
			(round): ClaudeEvent[] => [
				{
					type: "messageStarted",
					message: { ...STREAMING_MESSAGE, id: `msg-tool-${round}` },
				},
				{
					type: "activity",
					activity: {
						id: `tool-${round}`,
						title: "Read",
						kind: "tool",
						status: "running",
					},
				},
				{
					type: "activity",
					activity: {
						id: `tool-${round}`,
						title: "Read",
						kind: "tool",
						status: "succeeded",
					},
				},
			],
		)

	/** The message that does say something, streamed word by word the way the
	 * transport numbers its deltas. */
	const spokenAnswer = (text: string): ClaudeEvent[] => [
		{
			type: "messageStarted",
			message: { ...STREAMING_MESSAGE, id: "msg-answer" },
		},
		...text.split(" ").map(
			(word, index): ClaudeEvent => ({
				type: "messageDelta",
				id: "msg-answer",
				seq: index + 1,
				text: index === 0 ? word : ` ${word}`,
			}),
		),
		{
			type: "messageCompleted",
			message: {
				...STREAMING_MESSAGE,
				id: "msg-answer",
				text,
				completion: "complete",
			},
		},
	]

	const ended = (
		outcome: "completed" | "cancelled" | "failed",
	): ClaudeEvent => ({
		type: "turnEnded",
		ended: { sessionId: "s-1", outcome },
	})

	const streamed = async (harness: Harness, events: ClaudeEvent[]) => {
		vi.spyOn(harness.driver, "submitPrompt").mockResolvedValue()
		await harness.controller.send("hello")
		harness.driver.pushEvent({ type: "turnChanged", state: "running" })
		for (const event of events) {
			harness.driver.pushEvent(event)
		}
		await vi.runAllTimersAsync()
	}

	// The defect this covers: every tool-only message was opened, left empty, and
	// closed as complete by the turn ending — fourteen rows taking fourteen places in
	// the transcript, in its pages and in every context rebuilt from it.
	it("stores the answer alone, and nothing for the tools before it", async () => {
		const harness = await bootedHarness()
		await streamed(harness, [
			...toolRounds(ROUNDS),
			...spokenAnswer(REPLY),
			ended("completed"),
		])

		const state = harness.controller.getState()
		expect(spoken(state.messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", REPLY, "complete"],
		])
		const stored = await reload(harness.store)
		expect(spoken(stored)).toEqual(spoken(state.messages))
		// Two rows, two places: nothing empty took a seq, a page slot or a tail place.
		expect(stored.map((message) => message.seq)).toEqual([1, 2])
		expect(
			state.activities.filter((entry) => entry.status === "succeeded"),
		).toHaveLength(ROUNDS)
		harness.detach()
	})

	it("stores nothing at all for a turn that ends well without a word", async () => {
		const harness = await bootedHarness()
		await streamed(harness, [...toolRounds(3), ended("completed")])

		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
		])
		expect(spoken(await reload(harness.store))).toEqual([
			["user", "hello", "complete"],
		])
		harness.detach()
	})

	// Honesty is the other half: a reply cut off before it said anything is still the
	// reader's to see, and the row that says so is the only one the turn leaves.
	it.each(["cancelled", "failed"] as const)(
		"keeps one honest row for a turn that %s before a word",
		async (outcome) => {
			const harness = await bootedHarness()
			await streamed(harness, [
				...toolRounds(3),
				{
					type: "messageStarted",
					message: { ...STREAMING_MESSAGE, id: "msg-cut" },
				},
				{
					type: "messageCompleted",
					message: { ...STREAMING_MESSAGE, id: "msg-cut", completion: outcome },
				},
				ended(outcome),
			])

			const state = harness.controller.getState()
			expect(spoken(state.messages)).toEqual([
				["user", "hello", "complete"],
				["assistant", "", outcome],
			])
			expect(spoken(await reload(harness.store))).toEqual(
				spoken(state.messages),
			)
			harness.detach()
		},
	)

	// The process went away between two tools, so nothing observed the reply fail and
	// nobody stopped it. It is still an answer that stopped, and it is written down.
	it("keeps one honest row when the session dies between two tools", async () => {
		const harness = await bootedHarness()
		await streamed(harness, toolRounds(2))

		await harness.controller.restart()
		await vi.runAllTimersAsync()

		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "", "interrupted"],
		])
		harness.detach()
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
