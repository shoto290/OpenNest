import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady, isTurnBusy } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"
import {
	ASKED_FOR,
	NEARING_THE_BOUND,
	REDESCRIBED,
	REFUSED,
	STOPPED,
} from "./rotation"

import type {
	AgentCommand,
	AgentEvent,
	ChatMessage,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"
import {
	createFakeTranscriptStore,
	FAKE_CHAT_ID,
} from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import type {
	TranscriptCompletion,
	TranscriptMessage,
} from "../conversations/transcript-contract"
import {
	botIdentity,
	named,
	message as storedMessage,
} from "../conversations/transcript-fixtures"
import {
	isTerminalCompletion,
	lastWordIn,
} from "../conversations/transcript-state"

const STEP_MS = 10
const REPLY = "one two three four five six"
/** The bot every launch below opens on: the one the fake store already holds, and
 * the only one a test names when it does not care which bot is speaking. */
const BOT = "default"

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
const STALE_TURN: AgentEvent[] = [
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

/** How many tool-only assistant messages one live prompt was measured to produce
 * before the message that answered it. */
const ROUNDS = 14

/** The name the child gives itself, announced once and repeated by the ending of
 * every turn it answers. */
const ANNOUNCED = "s-1"

/** What the host reports for a tool call: an assistant message of its own,
 * announced and never spoken in, and the tool it ran. */
const toolRounds = (rounds: number): AgentEvent[] =>
	Array.from({ length: rounds }, (_, index) => index + 1).flatMap(
		(round): AgentEvent[] => [
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
const spokenAnswer = (text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: { ...STREAMING_MESSAGE, id: "msg-answer" },
	},
	...text.split(" ").map(
		(word, index): AgentEvent => ({
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

const ended = (outcome: "completed" | "cancelled" | "failed"): AgentEvent => ({
	type: "turnEnded",
	ended: { sessionId: ANNOUNCED, outcome },
})

/** The store, and every provider session it was asked to write down as the pair a
 * lineage is made of: the run named, and the id named for it. The write itself is
 * the real one — what the store does with a replay or a disagreement is the store's
 * to answer, here as anywhere. */
const recordingStore = (base: TranscriptStore) => {
	const recorded: [string, string][] = []
	const store: TranscriptStore = {
		...base,
		recordProviderSession: (
			conversationId,
			botId,
			runtimeSessionId,
			providerSessionId,
		) => {
			recorded.push([runtimeSessionId, providerSessionId])
			return base.recordProviderSession(
				conversationId,
				botId,
				runtimeSessionId,
				providerSessionId,
			)
		},
	}
	return { store, recorded }
}

/** A promise a test releases by hand. The window a race lives in is only ever a
 * few microtasks wide, so it is held open here instead of waited for. */
const deferred = () => {
	let release: () => void = () => undefined
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, release: () => release() }
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
		promptsPerRun: options.promptsPerRun,
	})
	return { driver: fake, store, controller, detach: controller.attach() }
}

const bootedHarness = async (
	options: HarnessOptions = {},
): Promise<Harness> => {
	const harness = createHarness(options)
	await harness.controller.open(options.botId ?? BOT)
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

/** The line a roster row would preview for a bot, read where the sidebar reads it:
 * off the bot's own state, whether the reader is on it or not. */
const previewFor = (controller: ChatController, botId: string) =>
	lastWordIn(controller.stateFor(botId).messages)

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
		await harness.controller.open(BOT)
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
		await controller.open(BOT)
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

		expect(await controller.open(BOT)).toBeNull()
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

		expect(await controller.open(BOT)).toBeNull()
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

		// The bot is opened first: what a preflight reports is reported about a bot,
		// and before one is selected there is no screen for it to land on.
		await controller.open(BOT)
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

		await controller.open(BOT)

		expect(controller.getState().sessionId).toBe("s-1")
	})

	// The transcript is durable; the session that produced it is not. Resuming a
	// provider session across launches is a runtime concern this no longer keeps.
	it("boots on the stored transcript without resuming anything", async () => {
		const store = createFakeTranscriptStore({ messages: seeded(4) })
		const { driver, controller } = createHarness({ store })
		const startSpy = vi.spyOn(driver, "startOrResumeSession")

		await controller.open(BOT)
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

	// Selecting a bot is the same three steps a launch takes: the other bot's
	// transcript is painted, and the one process this build runs is put behind it.
	// Coming back finds the first conversation exactly where it was left, because the
	// switch moved the screen and the run rather than the record.
	it("switches the visible conversation and the run to the bot it is opened on", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("hello")
		await vi.runAllTimersAsync()
		const before = spoken(harness.controller.getState().messages)
		expect(before.length).toBe(2)

		await harness.controller.open(other.id)
		await vi.runAllTimersAsync()

		const switched = harness.controller.getState()
		expect(switched.conversationId).toBe((await store.mainChat(other.id)).id)
		expect(switched.messages).toEqual([])
		expect(runOf(harness.controller).botId).toBe(other.id)

		await harness.controller.open(BOT)
		await vi.runAllTimersAsync()
		expect(spoken(harness.controller.getState().messages)).toEqual(before)
		expect(runOf(harness.controller).botId).toBe(BOT)
		harness.detach()
	})

	// The one thing a switch may never do: put a bot's words in another bot's
	// transcript — and the one thing it may never cost: the answer a bot was in the
	// middle of. The bot the reader leaves keeps its process, goes on streaming into
	// the conversation it was started for, and is found finished there on the way
	// back.
	it("keeps a bot streaming into its own conversation after the reader switches", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		vi.spyOn(harness.driver, "submitPrompt").mockResolvedValue()
		await harness.controller.send("hello")
		harness.driver.pushEvent({ type: "turnChanged", state: "running" })
		harness.driver.pushEvent({
			type: "messageStarted",
			message: STREAMING_MESSAGE,
		})
		harness.driver.pushEvent({
			type: "messageDelta",
			id: "msg-1",
			seq: 1,
			text: "Half",
		})
		await vi.runAllTimersAsync()
		const leaving = runOf(harness.controller)

		await harness.controller.open(other.id)
		await vi.runAllTimersAsync()
		for (const event of [
			{ type: "messageDelta", id: "msg-1", seq: 2, text: " an answer" },
			{
				type: "messageCompleted",
				message: {
					...STREAMING_MESSAGE,
					text: "Half an answer",
					completion: "complete",
				},
			},
			{
				type: "turnEnded",
				ended: { sessionId: ANNOUNCED, outcome: "completed" },
			},
		] satisfies AgentEvent[]) {
			harness.driver.pushEvent(event, leaving)
		}
		await vi.runAllTimersAsync()

		expect(harness.controller.getState().messages).toEqual([])
		const left = await store.loadPage((await store.mainChat(BOT)).id, null)
		expect(
			left.messages.map((row) => [row.role, row.content, row.completion]),
		).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half an answer", "complete"],
		])

		await harness.controller.open(BOT)
		await vi.runAllTimersAsync()
		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half an answer", "complete"],
		])
		expect(runOf(harness.controller)).toEqual(leaving)
		harness.detach()
	})

	// The way back re-reads the tail of a conversation the bot never stopped writing
	// into, so the page carries words whose deltas have not reached the screen yet.
	// Read and write go through the one queue for that reason: every delta the store
	// has taken has been shown by the time the page merges, so the tail is never
	// counted twice.
	it("re-reads a streaming transcript on the way back without doubling its tail", async () => {
		const base = createFakeTranscriptStore()
		const other = await base.createBot(botIdentity({ name: "Second" }))
		const stored = deferred()
		let holdsTheWrite = false
		const store: TranscriptStore = {
			...base,
			appendText: async (id, text) => {
				const written = await base.appendText(id, text)
				if (holdsTheWrite) {
					await stored.promise
				}
				return written
			},
		}
		const harness = await bootedHarness({ store })
		vi.spyOn(harness.driver, "submitPrompt").mockResolvedValue()
		await harness.controller.send("hello")
		harness.driver.pushEvent({
			type: "messageStarted",
			message: STREAMING_MESSAGE,
		})
		harness.driver.pushEvent({
			type: "messageDelta",
			id: "msg-1",
			seq: 1,
			text: "Half",
		})
		await vi.runAllTimersAsync()
		const leaving = runOf(harness.controller)

		await harness.controller.open(other.id)
		await vi.runAllTimersAsync()

		// The store takes the rest of the answer and nothing shows it yet: this is the
		// moment a re-read of the tail would see more than the screen holds.
		holdsTheWrite = true
		harness.driver.pushEvent(
			{ type: "messageDelta", id: "msg-1", seq: 2, text: " an answer" },
			leaving,
		)
		await vi.runAllTimersAsync()

		const returning = harness.controller.open(BOT)
		stored.release()
		await returning
		await vi.runAllTimersAsync()

		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", "Half an answer", "streaming"],
		])
		harness.detach()
	})

	// Two bots, two processes, one reader. Neither turn is refused because the other
	// is running, and each answer lands in the conversation of the bot that gave it.
	it("lets two bots answer at once, each into its own conversation", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })

		await harness.controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 4)
		expect(isTurnBusy(harness.controller.getState().turn)).toBe(true)

		await harness.controller.open(other.id)
		await harness.controller.send("salut")
		expect(isTurnBusy(harness.controller.getState().turn)).toBe(true)
		expect(harness.controller.getState().errors).toEqual([])
		await vi.runAllTimersAsync()

		const first = await store.loadPage((await store.mainChat(BOT)).id, null)
		const second = await store.loadPage(
			(await store.mainChat(other.id)).id,
			null,
		)
		expect(spoken(first.messages)).toEqual([
			["user", "hello", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(spoken(second.messages)).toEqual([
			["user", "salut", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	// What the roster reads while the reader is somewhere else: the bot left behind
	// is still answering, and its own state is where that shows.
	it("reports a bot answering in the background as busy", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 4)

		await harness.controller.open(other.id)

		expect(isTurnBusy(harness.controller.getState().turn)).toBe(false)
		expect(isTurnBusy(harness.controller.stateFor(BOT).turn)).toBe(true)
		expect(harness.controller.stateFor("nobody").turn).toBe("idle")

		await vi.runAllTimersAsync()
		expect(isTurnBusy(harness.controller.stateFor(BOT).turn)).toBe(false)
		harness.detach()
	})

	// The other half of what the roster reads from here: the row of the bot the
	// reader walked away from previews what it went on to say, so a reply that lands
	// while they are elsewhere is on the row it belongs to.
	it("holds the last word of a bot answering in the background", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 4)

		await harness.controller.open(other.id)

		// The prompt is settled the moment it is written, so the row previews it while
		// the answer to it is still being streamed into the same conversation.
		expect(previewFor(harness.controller, BOT)).toMatchObject({
			text: "hello",
		})
		expect(previewFor(harness.controller, other.id)).toBeUndefined()

		await vi.runAllTimersAsync()
		expect(previewFor(harness.controller, BOT)).toMatchObject({ text: REPLY })
		harness.detach()
	})

	// A bot holds one process at a time. Selecting it again — which is what the app
	// does on every switch — shows the one it has rather than replacing it, because
	// a second process would leave the first answering with nobody holding it.
	it("opens no second process for a bot that already holds one", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		const held = runOf(harness.controller)
		const startSpy = vi.spyOn(harness.driver, "startOrResumeSession")

		expect(await harness.controller.open(BOT)).toBeNull()
		await harness.controller.open(other.id)
		await harness.controller.open(BOT)
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledTimes(1)
		expect(startSpy).toHaveBeenCalledWith(
			expect.objectContaining({ botId: other.id }),
			undefined,
		)
		expect(runOf(harness.controller)).toEqual(held)
		harness.detach()
	})

	// A bot that is going away takes its process with it: one left running would go
	// on answering into a conversation the delete is about to remove.
	it("ends the runtime of a bot that is deleted while it streams", async () => {
		const harness = await bootedHarness()
		const shutdownSpy = vi.spyOn(harness.driver, "shutdown")
		await harness.controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 4)
		const running = runOf(harness.controller)

		await harness.controller.close(BOT)

		expect(shutdownSpy).toHaveBeenCalledWith(running)
		expect(harness.controller.getState().conversationId).toBeNull()
		await expect(
			harness.driver.submitPrompt(running, "anybody there?"),
		).rejects.toEqual({ kind: "notStarted" })
		harness.detach()
	})

	it("still opens a session when the stored transcript cannot be read", async () => {
		const store = createFakeTranscriptStore()
		const { controller } = createHarness({
			store: { ...store, loadPage: () => Promise.reject({ kind: "storage" }) },
		})

		await controller.open(BOT)
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

	// The bot was described again while a process was answering for it. A child is
	// given its system prompt and its directory at spawn and there is no frame that
	// changes either, so the run is spent from there and the next prompt is carried
	// by a process started as the bot reads now. The reader sees none of it.
	it("replaces the run of a bot that was described again, on the next prompt", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver, detach } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")
		const started = vi.spyOn(driver, "startOrResumeSession")
		const described = runOf(controller)
		const before = controller.getState().messages

		controller.redescribe(BOT)
		await vi.runAllTimersAsync()

		// Nothing yet: a reader still typing into the settings would otherwise spend a
		// process per keystroke, and nothing is waiting on the one it would spawn.
		expect(started).not.toHaveBeenCalled()
		expect(reasons(opened, BOT)).toEqual([null])

		await controller.send("and now?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, BOT)).toEqual([null, REDESCRIBED])
		expect(runOf(controller).epoch).toBe(described.epoch + 1)
		expectWholeChat(told(submitted), [])
		expect(told(submitted)).toContain("The new message:\nand now?")
		expect(occurrences(told(submitted), "and now?")).toBe(1)
		expect(controller.getState().messages.slice(0, before.length)).toEqual(
			before,
		)
		expect(spoken(controller.getState().messages).slice(-2)).toEqual([
			["user", "and now?", "complete"],
			["assistant", REPLY, "complete"],
		])
		detach()
	})

	// Every bot holds a runtime of its own, so being told one bot is not what its
	// process was started as says nothing about any other — and a bot with no
	// process at all has nothing to retire.
	it("retires the run of the bot that was described and no other", async () => {
		const store = withHistory()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, detach } = await bootedHarness({ store })
		await controller.open(other.id)
		await vi.runAllTimersAsync()

		// A bot this launch never opened, and one that is not the bot being edited.
		controller.redescribe("nobody")
		controller.redescribe(BOT)
		await controller.send("and me?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "nobody")).toEqual([])
		expect(reasons(opened, other.id)).toEqual([null])

		// Back to the bot that was described: the process answering for it is replaced
		// under the reason it was retired for, and the run it takes is the next of its
		// own lineage.
		await controller.open(BOT)
		await vi.runAllTimersAsync()

		expect(reasons(opened, BOT)).toEqual([null, REDESCRIBED])
		expect(reasons(opened, other.id)).toEqual([null])
		detach()
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
		// The chat two bots share. A bot holds a chat of its own today — the store
		// names a thread after the bot that was seated in it — so the one conversation
		// both of these are spoken to in is arranged here rather than assumed, and what
		// is left telling their runs apart is the participant and nothing else.
		const held = withHistory()
		const store: TranscriptStore = {
			...held,
			mainChat: () => held.mainChat(BOT),
		}
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
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const streamed = async (harness: Harness, events: AgentEvent[]) => {
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

	// Both halves of the same turn, which is the only place they can disagree: the
	// tools leave the transcript alone, and the run still comes out of it holding the
	// name of the process that ran them. A held reply that was never written must not
	// cost the announcement its write, and the announcement must not put a row back.
	it("records the session it answered under while keeping the tools out of the transcript", async () => {
		const base = createFakeTranscriptStore()
		const { store, recorded } = recordingStore(base)
		const harness = await bootedHarness({ store })
		const run = runOf(harness.controller)

		await streamed(harness, [
			{ type: "sessionReady", sessionId: ANNOUNCED, resumed: false },
			...toolRounds(ROUNDS),
			...spokenAnswer(REPLY),
			ended("completed"),
		])

		const state = harness.controller.getState()
		expect(recorded).toEqual([[run.runtimeSessionId, ANNOUNCED]])
		expect(state.sessionId).toBe(ANNOUNCED)
		expect(state.errors).toEqual([])
		expect(
			state.activities.filter((entry) => entry.status === "succeeded"),
		).toHaveLength(ROUNDS)
		// The run holds the id durably: a row that took none would take any. Asked
		// before the reload below, which replaces the run and would refuse either way.
		await expect(
			base.recordProviderSession(
				run.conversationId,
				run.botId,
				run.runtimeSessionId,
				"a-second-process",
			),
		).rejects.toEqual({ kind: "storage", failure: { kind: "staleWrite" } })

		const stored = await reload(harness.store)
		expect(spoken(stored)).toEqual([
			["user", "hello", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(stored.map((message) => message.seq)).toEqual([1, 2])
		expect(
			stored.filter(
				(message) => message.role === "assistant" && message.content === "",
			),
		).toEqual([])
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

/** The name Claude gives the process answering in a run, on the record beside the
 * run rather than instead of it. Everything here is composed: the driver announces
 * the id the way the CLI does, the controller writes it down, and the store holds
 * it under the rules the file holds it under. */
describe("the provider session a run answered under", () => {
	const REFUSED_BY_THE_STORE = {
		kind: "writeFailed",
		detail: "the transcript store refused it (storage)",
	}

	const STALE_WRITE = { kind: "storage", failure: { kind: "staleWrite" } }

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const announced = (sessionId: string): AgentEvent => ({
		type: "sessionReady",
		sessionId,
		resumed: false,
	})

	// The defect this locks: a real turn ran, a real child answered, and the run it
	// answered in kept no word of the process it was holding.
	it("writes the id the child announces against the run it is answering in", async () => {
		const base = createFakeTranscriptStore()
		const { store, recorded } = recordingStore(base)
		const { controller } = await bootedHarness({ store })

		await controller.send("hello")
		await vi.runAllTimersAsync()

		const run = runOf(controller)
		const state = controller.getState()
		expect(state.sessionId).not.toBeNull()
		expect(recorded).toEqual([[run.runtimeSessionId, state.sessionId]])
		expect(state.errors).toEqual([])
		// The row holds it: one that did not would take any id at all.
		await expect(
			base.recordProviderSession(
				run.conversationId,
				run.botId,
				run.runtimeSessionId,
				"a-second-process",
			),
		).rejects.toEqual(STALE_WRITE)
	})

	it("takes the same announcement twice as the one write it is", async () => {
		const base = createFakeTranscriptStore()
		const { store, recorded } = recordingStore(base)
		const { controller, driver } = await bootedHarness({ store })
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const run = runOf(controller)
		const sessionId = controller.getState().sessionId ?? ""

		driver.pushEvent(announced(sessionId), run)
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(recorded).toEqual([
			[run.runtimeSessionId, sessionId],
			[run.runtimeSessionId, sessionId],
		])
		expect(state.errors).toEqual([])
		expect(state.sessionId).toBe(sessionId)
		expect(state.runtime).toEqual(run)
	})

	// One run answers under one provider session. A second, different id is a
	// disagreement the store settles, and the reader is told it was not written.
	it("reports a second, different id without moving the run it holds", async () => {
		const base = createFakeTranscriptStore()
		const { store } = recordingStore(base)
		const { controller, driver } = await bootedHarness({ store })
		await controller.send("hello")
		await vi.runAllTimersAsync()
		const run = runOf(controller)

		driver.pushEvent(announced("a-second-process"), run)
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(state.errors.at(-1)?.error).toEqual(REFUSED_BY_THE_STORE)
		expect(state.runtime).toEqual(run)
		expect(state.turn).toBe("idle")
	})

	// The write is issued under the run that announced and lands after that run has
	// been replaced. The row it names is the one it was announced in, whatever the
	// controller holds by the time the store answers.
	it("cannot write a replaced run's id onto the run that took its place", async () => {
		const base = createFakeTranscriptStore()
		const { store: recording, recorded } = recordingStore(base)
		const settled = deferred()
		const store: TranscriptStore = {
			...recording,
			recordProviderSession: async (
				conversationId,
				botId,
				runtimeSessionId,
				providerSessionId,
			) => {
				await settled.promise
				return recording.recordProviderSession(
					conversationId,
					botId,
					runtimeSessionId,
					providerSessionId,
				)
			},
		}
		const { controller, driver } = await bootedHarness({ store })
		const replaced = runOf(controller)

		driver.pushEvent(announced("stale-process"), replaced)
		await vi.advanceTimersByTimeAsync(0)
		await controller.restart()
		await vi.runAllTimersAsync()
		const replacement = runOf(controller)
		settled.release()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(replacement.runtimeSessionId).not.toBe(replaced.runtimeSessionId)
		expect(recorded).toEqual([[replaced.runtimeSessionId, "stale-process"]])
		expect(state.runtime).toEqual(replacement)
		expect(state.errors.at(-1)?.error).toEqual(REFUSED_BY_THE_STORE)
		// The replacement never took the replaced run's word for it: its own id
		// still lands, which a row already holding one would refuse.
		await expect(
			base.recordProviderSession(
				replacement.conversationId,
				replacement.botId,
				replacement.runtimeSessionId,
				"its-own-process",
			),
		).resolves.toBeUndefined()
	})
})

/** The slash commands a session announces, held where the next one can find them.
 * A child names them once as it comes up and nowhere else, and no child exists until
 * a prompt has started one — so a bot just opened, and every bot after a restart,
 * has nothing of its own to ask. */
describe("the commands a bot last announced", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	/** A driver whose sessions come up saying nothing, the way a real one that has
	 * not been prompted yet does: what the screen offers is then what was held for
	 * the bot and nothing else. */
	const silentDriver = (fake: FakeChatDriver): ChatDriver => ({
		...fake,
		startOrResumeSession: () => Promise.resolve({ resumed: false }),
	})

	it("holds what a session announced against the bot it answered for", async () => {
		const store = createFakeTranscriptStore()
		const { controller, detach } = await bootedHarness({ store })

		const announced = controller.getState().commands

		expect(announced.length).toBeGreaterThan(0)
		expect(await store.botCommands(BOT)).toEqual(announced)
		detach()
	})

	it("offers what was last held before a session of its own has started", async () => {
		const store = createFakeTranscriptStore()
		const first = await bootedHarness({ store })
		const announced = first.controller.getState().commands
		first.detach()

		const next = await bootedHarness({ store, driver: silentDriver })

		expect(next.controller.getState().commands).toEqual(announced)
		next.detach()
	})

	it("replaces what it holds with what the next session named", async () => {
		const store = createFakeTranscriptStore()
		const { controller, driver, detach } = await bootedHarness({ store })

		driver.pushEvent(
			{ type: "commandsListed", commands: named("status") },
			runOf(controller),
		)
		await vi.runAllTimersAsync()

		expect(controller.getState().commands).toEqual(named("status"))
		expect(await store.botCommands(BOT)).toEqual(named("status"))
		detach()
	})

	it("offers no command for a bot no session has announced anything for", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Ada" }))
		const { controller, detach } = await bootedHarness({
			store,
			driver: silentDriver,
			botId: other.id,
		})

		expect(controller.getState().commands).toEqual([])
		expect(await store.botCommands(other.id)).toEqual([])
		detach()
	})

	// The read is off the write queue, so nothing orders it against the session that
	// may answer while it is out. The child that just named its own list is the
	// authority on what it takes, whenever the older answer comes back.
	it("keeps what the session named over a recall still in flight", async () => {
		const base = createFakeTranscriptStore()
		await base.recordBotCommands(BOT, named("from-the-record"))
		const read = deferred()
		const store: TranscriptStore = {
			...base,
			// Read before the session spoke, answered after it: the window the recall
			// is the older of the two lists in.
			botCommands: async (botId: string) => {
				const held = await base.botCommands(botId)
				await read.promise
				return held
			},
		}
		const { controller, detach } = await bootedHarness({ store })
		const announced = controller.getState().commands

		read.release()
		await vi.runAllTimersAsync()

		expect(announced).not.toEqual(named("from-the-record"))
		expect(controller.getState().commands).toEqual(announced)
		detach()
	})

	it("writes nothing for a session announcing what the store already holds", async () => {
		const base = createFakeTranscriptStore()
		let written = 0
		const store: TranscriptStore = {
			...base,
			recordBotCommands: (botId: string, commands: AgentCommand[]) => {
				written += 1
				return base.recordBotCommands(botId, commands)
			},
		}
		const { controller, driver, detach } = await bootedHarness({ store })
		const announced = controller.getState().commands
		expect(written).toBe(1)

		driver.pushEvent(
			{ type: "commandsListed", commands: announced },
			runOf(controller),
		)
		await vi.runAllTimersAsync()

		expect(written).toBe(1)
		expect(await store.botCommands(BOT)).toEqual(announced)
		detach()
	})
})

/** The handover as a thing that happens once. Everything here holds one of its
 * three steps open — the fold, the row, the process — and asks for a second prompt
 * or a second rotation while it is: a lineage the reader cannot see is exactly
 * where two of anything goes unnoticed. */
describe("a handover nothing may run twice", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	type Watched = {
		starts: RuntimeScope[]
		submits: [RuntimeScope, string][]
	}

	/** The driver as the controller reaches it, with every start and every prompt
	 * written down under the run it named — and a start that can be made to fail the
	 * way a child that never comes up fails. */
	const watchedDriver =
		(watched: Watched, failing: () => boolean) =>
		(fake: FakeChatDriver): ChatDriver => ({
			...fake,
			startOrResumeSession: (scope, resume) => {
				watched.starts.push(scope)
				return failing()
					? Promise.reject({ kind: "spawnFailed", detail: "no child came up" })
					: fake.startOrResumeSession(scope, resume)
			},
			submitPrompt: (scope, text) => {
				watched.submits.push([scope, text])
				return fake.submitPrompt(scope, text)
			},
		})

	const watching = (): Watched => ({ starts: [], submits: [] })

	/** The store, with the fold a handover begins with held open on demand. */
	const foldingStore = (base: TranscriptStore, held: Promise<void>) => {
		let holding = false
		return {
			store: {
				...base,
				captureCheckpoint: async (
					conversationId: string,
					botId: string,
					runtimeSessionId: string | null,
					createdAt: number,
				) => {
					if (holding) {
						await held
					}
					return base.captureCheckpoint(
						conversationId,
						botId,
						runtimeSessionId,
						createdAt,
					)
				},
			} as TranscriptStore,
			hold: (on: boolean) => {
				holding = on
			},
		}
	}

	// The gap the audit found: the row was opened, the process behind it never came
	// up, and the prompt went to it anyway — to a run with a place in the lineage and
	// nothing running in it. The reader's words stay on the record, and the next send
	// is what tries the handover again rather than aiming at the dead row once more.
	it("gives no prompt to a run whose process never came up, and hands over again next time", async () => {
		const store = createFakeTranscriptStore()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const watched = watching()
		let failing = false
		const harness = await bootedHarness({
			store,
			promptsPerRun: 1,
			driver: watchedDriver(watched, () => failing),
		})
		await harness.controller.send("first")
		await vi.runAllTimersAsync()
		const carried = runOf(harness.controller)

		failing = true
		await harness.controller.send("second")
		await vi.runAllTimersAsync()

		const dead = runOf(harness.controller)
		const refused = harness.controller.getState()
		expect(dead.runtimeSessionId).not.toBe(carried.runtimeSessionId)
		expect(watched.submits.map(([scope]) => scope)).not.toContainEqual(dead)
		expect(refused.turn).toBe("failed")
		// Written and shown: the reader's words are not what a failed start costs.
		expect(spoken(refused.messages).at(-1)).toEqual([
			"user",
			"second",
			"complete",
		])
		expect(refused.rejectedPromptId).toBe(refused.messages.at(-1)?.id)

		failing = false
		await harness.controller.send("third")
		await vi.runAllTimersAsync()

		const live = runOf(harness.controller)
		expect(live.runtimeSessionId).not.toBe(dead.runtimeSessionId)
		expect(opened).toHaveBeenCalledTimes(3)
		expect(watched.submits.at(-1)?.[0]).toEqual(live)
		// Nothing the reader said was lost with the run that could not take it.
		expect(watched.submits.at(-1)?.[1]).toContain("second")
		expect(watched.submits.at(-1)?.[1]).toContain("third")
		expect(harness.controller.getState().turn).toBe("idle")
		harness.detach()
	})

	// The same dead row, reached the other way. Retry is the button the reader is
	// actually offered on a prompt that did not go through, and it resubmits a prompt
	// the store already holds — so without the handover it would aim the same words
	// at the same run with no child, for as long as the reader kept asking.
	it("hands over before retrying a prompt the dead run refused", async () => {
		const store = createFakeTranscriptStore()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const watched = watching()
		let failing = false
		const harness = await bootedHarness({
			store,
			promptsPerRun: 1,
			driver: watchedDriver(watched, () => failing),
		})
		await harness.controller.send("first")
		await vi.runAllTimersAsync()

		failing = true
		await harness.controller.send("second")
		await vi.runAllTimersAsync()
		const dead = runOf(harness.controller)
		const rejected = harness.controller.getState().rejectedPromptId ?? ""
		const written = harness.controller.getState().messages.length

		failing = false
		await harness.controller.retry(rejected)
		await vi.runAllTimersAsync()

		const live = runOf(harness.controller)
		const state = harness.controller.getState()
		expect(opened).toHaveBeenCalledTimes(3)
		expect(live.runtimeSessionId).not.toBe(dead.runtimeSessionId)
		expect(watched.submits.map(([scope]) => scope)).not.toContainEqual(dead)
		expect(watched.submits.at(-1)?.[0]).toEqual(live)
		expect(watched.submits.at(-1)?.[1]).toContain("second")
		// Retried, not written again: the prompt was on the record all along.
		expect(state.messages).toHaveLength(written + 1)
		expect(state.rejectedPromptId).toBeNull()
		expect(spoken(state.messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
		harness.detach()
	})

	// The handover that could not happen, on a run that is perfectly well: the store
	// would not open the successor, and the process holding the conversation is still
	// there and still carrying it. It answers, exactly as it did before — a prompt
	// refused here would cost the reader an answer nothing was wrong with.
	it("lets the live run it could not replace answer the prompt itself", async () => {
		const base = createFakeTranscriptStore()
		let refusing = false
		const store: TranscriptStore = {
			...base,
			openRuntimeSession: (conversationId, botId, startedAt, reason) =>
				refusing
					? Promise.reject({
							kind: "storage",
							failure: { kind: "poisonedConnection" },
						})
					: base.openRuntimeSession(conversationId, botId, startedAt, reason),
		}
		const watched = watching()
		const harness = await bootedHarness({
			store,
			promptsPerRun: 1,
			driver: watchedDriver(watched, () => false),
		})
		await harness.controller.send("first")
		await vi.runAllTimersAsync()
		const holding = runOf(harness.controller)

		refusing = true
		await harness.controller.send("second")
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(runOf(harness.controller)).toEqual(holding)
		expect(watched.starts).toHaveLength(1)
		expect(watched.submits.at(-1)).toEqual([holding, "second"])
		expect(spoken(state.messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
		expect(state.turn).toBe("idle")
		harness.detach()
	})

	// Two prompts arriving at the threshold. Both pass a busy check that is only ever
	// true once a turn has started, and the turn starts after the handover — so
	// without an admission taken before the first await, each opens a run of its own
	// and asks the host for a process the host will refuse one of.
	it("lets one of two prompts at the threshold hand over, and refuses the other", async () => {
		const base = createFakeTranscriptStore()
		const released = deferred()
		const { store, hold } = foldingStore(base, released.promise)
		const opened = vi.spyOn(store, "openRuntimeSession")
		const watched = watching()
		const harness = await bootedHarness({
			store,
			promptsPerRun: 1,
			driver: watchedDriver(watched, () => false),
		})
		await harness.controller.send("first")
		await vi.runAllTimersAsync()
		const carried = runOf(harness.controller)

		hold(true)
		const second = harness.controller.send("second")
		await vi.advanceTimersByTimeAsync(0)
		const third = harness.controller.send("third")
		await vi.advanceTimersByTimeAsync(0)
		released.release()
		await Promise.all([second, third])
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(opened).toHaveBeenCalledTimes(2)
		expect(watched.starts).toHaveLength(2)
		expect(runOf(harness.controller).epoch).toBe(carried.epoch + 1)
		expect(watched.submits).toHaveLength(2)
		expect(watched.submits.at(-1)?.[1]).toContain("second")
		expect(watched.submits.some(([, text]) => text.includes("third"))).toBe(
			false,
		)
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(state.errors.at(-1)?.error).toEqual({ kind: "turnAlreadyRunning" })
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
		harness.detach()
	})

	// The same rule, asked for by hand: two rotations in flight are one handover.
	// A second row here is a run the reader never sees, opened and left behind.
	it("takes two rotations asked for at once as the one handover they are", async () => {
		const base = createFakeTranscriptStore()
		const released = deferred()
		const { store, hold } = foldingStore(base, released.promise)
		const opened = vi.spyOn(store, "openRuntimeSession")
		const watched = watching()
		const harness = await bootedHarness({
			store,
			driver: watchedDriver(watched, () => false),
		})
		const replaced = runOf(harness.controller)
		const before = harness.controller.getState().messages

		hold(true)
		const first = harness.controller.rotate()
		await vi.advanceTimersByTimeAsync(0)
		const second = harness.controller.rotate()
		await vi.advanceTimersByTimeAsync(0)
		released.release()
		const handles = await Promise.all([first, second])
		await vi.runAllTimersAsync()

		expect(opened).toHaveBeenCalledTimes(2)
		expect(watched.starts).toHaveLength(2)
		expect(runOf(harness.controller).epoch).toBe(replaced.epoch + 1)
		expect(handles[0]).toBe(handles[1])
		expect(harness.controller.getState().messages).toEqual(before)
		expect(harness.controller.getState().errors).toEqual([])
		harness.detach()
	})

	// What the two waves before this one proved, under the run that won a handover
	// two callers asked for: the id its child announces lands on that run and no
	// other, every tool it ran is still on the screen, and the transcript keeps the
	// one row that said something.
	it("keeps the provider id, the activities and the empty rows out under one handover", async () => {
		const { store, recorded } = recordingStore(createFakeTranscriptStore())
		const harness = await bootedHarness({ store })
		const replaced = runOf(harness.controller)

		await Promise.all([
			harness.controller.rotate(),
			harness.controller.rotate(),
		])
		await vi.runAllTimersAsync()
		const winner = runOf(harness.controller)

		vi.spyOn(harness.driver, "submitPrompt").mockResolvedValue()
		await harness.controller.send("hello")
		harness.driver.pushEvent({ type: "turnChanged", state: "running" })
		for (const event of [
			{ type: "sessionReady", sessionId: ANNOUNCED, resumed: false } as const,
			...toolRounds(ROUNDS),
			...spokenAnswer(REPLY),
			ended("completed"),
		]) {
			harness.driver.pushEvent(event)
		}
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(winner.epoch).toBe(replaced.epoch + 1)
		expect(recorded).toEqual([[winner.runtimeSessionId, ANNOUNCED]])
		expect(
			state.activities.filter((entry) => entry.status === "succeeded"),
		).toHaveLength(ROUNDS)
		const stored = await reload(store)
		expect(spoken(stored)).toEqual([
			["user", "hello", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(
			stored.filter(
				(message) => message.role === "assistant" && message.content === "",
			),
		).toEqual([])
		harness.detach()
	})
})
