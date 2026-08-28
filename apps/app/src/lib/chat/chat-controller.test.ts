import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ChatController, createChatController } from "./chat-controller"
import { isSessionReady, isTurnBusy } from "./chat-state"
import type { ChatDriver } from "./driver"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"
import { questionMessageIdOf } from "./question-message"
import {
	ASKED_FOR,
	EVOLVED,
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
const BOT = "default"

const STREAMING_MESSAGE: ChatMessage = {
	id: "msg-1",
	role: "assistant",
	text: "",
	completion: "streaming",
	timestamp: 0,
}

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

const ROUNDS = 14

const ANNOUNCED = "s-1"

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

const EVOLUTION: AgentEvent = {
	type: "botEvolved",
	bundle: "bot",
	commitId: "c-1",
	title: "learned to count",
}

const ended = (outcome: "completed" | "cancelled" | "failed"): AgentEvent => ({
	type: "turnEnded",
	ended: { sessionId: ANNOUNCED, outcome },
})

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

const reload = async (store: TranscriptStore): Promise<TranscriptMessage[]> => {
	const harness = await bootedHarness({ store })
	const { messages } = harness.controller.getState()
	harness.detach()
	return messages
}

const runOf = (controller: ChatController): RuntimeScope => {
	const runtime = controller.getState().runtime
	if (!runtime) {
		throw new Error("the launch holds no run")
	}
	return runtime
}

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

	it("holds a second prompt over a running turn and sends it after", async () => {
		const { controller } = await bootedHarness()
		await controller.send("first")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await controller.send("second")

		const held = controller.getState()
		expect(
			held.messages.filter((message) => message.role === "user"),
		).toHaveLength(1)
		expect(held.outbox.map((entry) => entry.text)).toEqual(["second"])
		expect(held.errors).toEqual([])

		await vi.runAllTimersAsync()
		const state = controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
		])
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

	it("answers a question and leaves what was asked in the transcript", async () => {
		const { controller, store, driver } = await bootedHarness()
		const answerQuestion = vi.spyOn(driver, "answerQuestion")
		await controller.send("pick one /question")
		await vi.runAllTimersAsync()

		const asked = controller.getState().question
		expect(asked?.questions[0].header).toBe("Framework")

		await controller.answer(asked?.id ?? "", {
			"Which framework should it use?": "React",
		})
		await vi.runAllTimersAsync()

		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), asked?.id, {
			"Which framework should it use?": "React",
		})
		const state = controller.getState()
		expect(state.question).toBeNull()
		const asking = state.messages.find(
			(entry) => entry.id === questionMessageIdOf(asked?.id ?? ""),
		)
		expect(asking?.role).toBe("assistant")
		expect(asking?.content).toContain("Which framework should it use?")
		const answered = state.messages.find(
			(entry) => entry.repliedToMessageId === asking?.id,
		)
		expect(answered?.role).toBe("user")
		expect(answered?.content).toBe("React")
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
	})

	it("answers a pending question with what the reader typed in the composer", async () => {
		const { controller, driver } = await bootedHarness()
		const answerQuestion = vi.spyOn(driver, "answerQuestion")
		await controller.send("pick one /question")
		await vi.runAllTimersAsync()

		const asked = controller.getState().question
		expect(asked).not.toBeNull()

		await controller.send("never mind, do it your way")
		await vi.runAllTimersAsync()

		expect(answerQuestion).toHaveBeenCalledWith(expect.anything(), asked?.id, {
			"Which framework should it use?": "never mind, do it your way",
		})
		const state = controller.getState()
		expect(state.question).toBeNull()
		const answered = state.messages.find(
			(entry) =>
				entry.repliedToMessageId === questionMessageIdOf(asked?.id ?? ""),
		)
		expect(answered?.role).toBe("user")
		expect(answered?.content).toBe("never mind, do it your way")
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

		await controller.open(BOT)
		expect(await controller.preflight()).toBeNull()
		expect(startSpy).not.toHaveBeenCalled()
		const state = controller.getState()
		expect(state.connection).toBe("unavailable")
		expect(state.sessionOpen).toBe(false)
		expect(state.errors.at(-1)?.error.kind).toBe("notAuthenticated")
	})

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

	it("holds the last word of a bot answering in the background", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("hello")
		await vi.advanceTimersByTimeAsync(STEP_MS * 4)

		await harness.controller.open(other.id)

		expect(previewFor(harness.controller, BOT)).toMatchObject({
			text: "hello",
		})
		expect(previewFor(harness.controller, other.id)).toBeUndefined()

		await vi.runAllTimersAsync()
		expect(previewFor(harness.controller, BOT)).toMatchObject({ text: REPLY })
		harness.detach()
	})

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

	it("changes the session once when a move closes and two callers reopen", async () => {
		const harness = await bootedHarness()
		const startSpy = vi.spyOn(harness.driver, "startOrResumeSession")
		const shutdownSpy = vi.spyOn(harness.driver, "shutdown")

		let endShutdown = () => {}
		shutdownSpy.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					endShutdown = resolve
				}),
		)

		const closing = harness.controller.close(BOT)
		const followed = harness.controller.open(BOT)
		const moved = harness.controller.open(BOT)
		await vi.advanceTimersByTimeAsync(STEP_MS)
		expect(startSpy).not.toHaveBeenCalled()

		endShutdown()
		await Promise.all([closing, followed, moved])
		await vi.runAllTimersAsync()

		expect(shutdownSpy).toHaveBeenCalledTimes(1)
		expect(startSpy).toHaveBeenCalledTimes(1)
		expect(harness.controller.getState().errors).toEqual([])
		expect(isSessionReady(harness.controller.getState())).toBe(true)
		harness.detach()
	})

	it("keeps the bot the reader picked while a queued session change lands", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		let endShutdown = () => {}
		vi.spyOn(harness.driver, "shutdown").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					endShutdown = resolve
				}),
		)

		const closing = harness.controller.close(BOT)
		const queued = harness.controller.open(BOT)
		const picked = harness.controller.open(other.id)
		expect(harness.controller.getState().runtime).toBeNull()

		await vi.advanceTimersByTimeAsync(STEP_MS)
		endShutdown()
		await vi.runAllTimersAsync()
		await Promise.all([closing, queued, picked])

		expect(harness.controller.getState().runtime?.botId).toBe(other.id)
		expect(harness.controller.stateFor(BOT).sessionOpen).toBe(true)
		harness.detach()
	})

	it("shuts a bot down only once the session it was opening is up", async () => {
		const harness = createHarness()
		const shutdownSpy = vi.spyOn(harness.driver, "shutdown")

		const opening = harness.controller.open(BOT)
		const closing = harness.controller.close(BOT)
		await Promise.all([opening, closing])
		await vi.runAllTimersAsync()

		expect(shutdownSpy).toHaveBeenCalledTimes(1)
		expect(harness.controller.stateFor(BOT).runtime).toBeNull()
		harness.detach()
	})

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

	const expectWholeChat = (context: string, alsoSaid: string[]) => {
		for (let index = 1; index <= HISTORY; index += 1) {
			expect(context).toContain(`stored ${index}\n`)
		}
		for (const said of alsoSaid) {
			expect(context).toContain(`${said}\n`)
		}
	}

	const told = (submitted: { mock: { calls: unknown[][] } }) =>
		String(submitted.mock.calls.at(-1)?.[1] ?? "")

	const reasons = (opened: { mock: { calls: unknown[][] } }, botId: string) =>
		opened.mock.calls
			.filter((call) => call[1] === botId)
			.map((call) => call[3] ?? null)

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

		expect(reasons(opened, "default")).toEqual([null, NEARING_THE_BOUND])
		expect(runOf(controller).epoch).toBe(holding.epoch + 1)
		expectWholeChat(told(submitted), ["first", "second"])
		expect(occurrences(told(submitted), "third")).toBe(1)
	})

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

	it("retires the run of the bot that was described and no other", async () => {
		const store = withHistory()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, detach } = await bootedHarness({ store })
		await controller.open(other.id)
		await vi.runAllTimersAsync()

		controller.redescribe("nobody")
		controller.redescribe(BOT)
		await controller.send("and me?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, "nobody")).toEqual([])
		expect(reasons(opened, other.id)).toEqual([null])

		await controller.open(BOT)
		await vi.runAllTimersAsync()

		expect(reasons(opened, BOT)).toEqual([null, REDESCRIBED])
		expect(reasons(opened, other.id)).toEqual([null])
		detach()
	})

	it("replaces the run of a bot that evolved, on the next prompt", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver, detach } = await bootedHarness({ store })
		const submitted = vi.spyOn(driver, "submitPrompt")
		const started = vi.spyOn(driver, "startOrResumeSession")
		const evolved = runOf(controller)
		const before = controller.getState().messages

		driver.pushEvent(EVOLUTION, evolved)
		await vi.runAllTimersAsync()

		expect(started).not.toHaveBeenCalled()
		expect(reasons(opened, BOT)).toEqual([null])
		expect(controller.getState().messages).toEqual(before)

		await controller.send("and now?")
		await vi.runAllTimersAsync()

		expect(reasons(opened, BOT)).toEqual([null, EVOLVED])
		expect(runOf(controller).epoch).toBe(evolved.epoch + 1)
		expectWholeChat(told(submitted), [])
		expect(told(submitted)).toContain("The new message:\nand now?")
		expect(spoken(controller.getState().messages).slice(-2)).toEqual([
			["user", "and now?", "complete"],
			["assistant", REPLY, "complete"],
		])
		detach()
	})

	it("ignores an evolution reported under a run it does not hold", async () => {
		const store = withHistory()
		const opened = vi.spyOn(store, "openRuntimeSession")
		const { controller, driver, detach } = await bootedHarness({ store })
		const started = vi.spyOn(driver, "startOrResumeSession")

		driver.pushEvent(EVOLUTION, null)
		await vi.runAllTimersAsync()
		await controller.send("and now?")
		await vi.runAllTimersAsync()

		expect(started).not.toHaveBeenCalled()
		expect(reasons(opened, BOT)).toEqual([null])
		detach()
	})

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

	it("keeps two bots' runs and recovery points apart in one chat", async () => {
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
		expect(stored.map((message) => message.seq)).toEqual([1, 2])
		expect(
			state.activities.filter((entry) => entry.status === "succeeded"),
		).toHaveLength(ROUNDS)
		harness.detach()
	})

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

describe("the commands a bot last announced", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

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

	it("keeps what the session named over a recall still in flight", async () => {
		const base = createFakeTranscriptStore()
		await base.recordBotCommands(BOT, named("from-the-record"))
		const read = deferred()
		const store: TranscriptStore = {
			...base,
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
		expect(watched.submits.at(-1)?.[1]).toContain("second")
		expect(watched.submits.at(-1)?.[1]).toContain("third")
		expect(harness.controller.getState().turn).toBe("idle")
		harness.detach()
	})

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
		expect(state.messages).toHaveLength(written + 1)
		expect(state.rejectedPromptId).toBeNull()
		expect(spoken(state.messages).at(-1)).toEqual([
			"assistant",
			REPLY,
			"complete",
		])
		harness.detach()
	})

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

	it("holds the second of two prompts at the threshold for its own handover", async () => {
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
		expect(opened).toHaveBeenCalledTimes(3)
		expect(watched.starts).toHaveLength(3)
		expect(runOf(harness.controller).epoch).toBe(carried.epoch + 2)
		expect(watched.submits).toHaveLength(3)
		expect(watched.submits.at(-2)?.[1]).toContain("second")
		expect(watched.submits.at(-1)?.[1]).toContain("third")
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
			["user", "third", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(state.outbox).toEqual([])
		expect(state.errors).toEqual([])
		expect(spoken(await reload(store))).toEqual(spoken(state.messages))
		harness.detach()
	})

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

describe("prompts the session cannot take yet", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const outboxOf = (controller: ChatController) =>
		controller.getState().outbox.map((entry) => entry.text)

	const promptsIn = (messages: TranscriptMessage[]) =>
		spoken(messages).filter(([role]) => role === "user")

	const submitting =
		(submits: string[], refusing: () => boolean = () => false) =>
		(fake: FakeChatDriver): ChatDriver => ({
			...fake,
			submitPrompt: (scope, text) => {
				submits.push(text)
				return refusing()
					? Promise.reject({ kind: "notStarted" })
					: fake.submitPrompt(scope, text)
			},
		})

	it("holds a prompt sent before the conversation is open", async () => {
		const base = createFakeTranscriptStore()
		const reading = deferred()
		const store: TranscriptStore = {
			...base,
			mainChat: (botId) => reading.promise.then(() => base.mainChat(botId)),
		}
		const harness = createHarness({ store })
		const opening = harness.controller.open(BOT)
		await vi.advanceTimersByTimeAsync(0)

		await harness.controller.send("early")

		expect(outboxOf(harness.controller)).toEqual(["early"])
		expect(harness.controller.getState().messages).toEqual([])
		expect(harness.controller.getState().errors).toEqual([])

		reading.release()
		await opening
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "early", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	it("sends what it holds in the order it was sent, one turn at a time", async () => {
		const harness = await bootedHarness()

		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")

		expect(outboxOf(harness.controller)).toEqual(["second", "third"])

		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "second", "complete"],
			["assistant", REPLY, "complete"],
			["user", "third", "complete"],
			["assistant", REPLY, "complete"],
		])
		expect(state.errors).toEqual([])
		expect(spoken(await reload(harness.store))).toEqual(spoken(state.messages))
		harness.detach()
	})

	it("records what it was holding when the turn is stopped, and sends none of it", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)

		await harness.controller.stop()
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(promptsIn(state.messages)).toEqual([
			["user", "first", "complete"],
			["user", "second", "complete"],
			["user", "third", "complete"],
		])
		expect(submits).toHaveLength(1)
		expect(submits.at(-1)).toContain("first")
		expect(state.turn).toBe("idle")
		expect(spoken(await reload(harness.store))).toEqual(spoken(state.messages))
		harness.detach()
	})

	it("carries the rebuilt conversation on the prompt after a stop", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })
		await harness.controller.send("first")
		await harness.controller.send("held")
		await vi.advanceTimersByTimeAsync(STEP_MS * 2)
		await harness.controller.stop()
		await vi.runAllTimersAsync()

		await harness.controller.send("again")
		await vi.runAllTimersAsync()

		const carried = submits.at(-1) ?? ""
		expect(carried).toContain("held")
		expect(carried).toContain("again")
		expect(harness.controller.getState().outbox).toEqual([])
		harness.detach()
	})

	it("drops one held prompt and keeps the order of the rest", async () => {
		const harness = await bootedHarness()
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")

		const held = harness.controller.getState().outbox
		harness.controller.discard(held[0]?.id ?? "")

		expect(outboxOf(harness.controller)).toEqual(["third"])

		await vi.runAllTimersAsync()

		expect(spoken(harness.controller.getState().messages)).toEqual([
			["user", "first", "complete"],
			["assistant", REPLY, "complete"],
			["user", "third", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	it("leaves the rest in the outbox when a submission is refused", async () => {
		let refusing = false
		const harness = await bootedHarness({
			driver: submitting([], () => refusing),
		})
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		refusing = true
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(outboxOf(harness.controller)).toEqual(["third"])
		expect(state.rejectedPromptId).toBe(state.messages.at(-1)?.id)
		expect(spoken(state.messages).at(-1)).toEqual([
			"user",
			"second",
			"complete",
		])
		harness.detach()
	})

	it("holds the words when the store refuses a prompt that could have gone out", async () => {
		const base = createFakeTranscriptStore()
		let refusing = true
		const store: TranscriptStore = {
			...base,
			startTurn: (turn) =>
				refusing ? Promise.reject({ kind: "storage" }) : base.startTurn(turn),
		}
		const harness = await bootedHarness({ store })

		await harness.controller.send("only")
		await vi.runAllTimersAsync()

		expect(outboxOf(harness.controller)).toEqual(["only"])
		expect(harness.controller.getState().messages).toEqual([])
		expect(harness.controller.getState().errors.at(-1)?.error.kind).toBe(
			"writeFailed",
		)

		refusing = false
		await harness.controller.open(BOT)
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(state.outbox).toEqual([])
		expect(spoken(state.messages)).toEqual([
			["user", "only", "complete"],
			["assistant", REPLY, "complete"],
		])
		harness.detach()
	})

	it("returns a held prompt the store refused to the front of the outbox", async () => {
		const base = createFakeTranscriptStore()
		let refusing = false
		const store: TranscriptStore = {
			...base,
			appendUserMessage: (message) =>
				refusing
					? Promise.reject({ kind: "storage" })
					: base.appendUserMessage(message),
		}
		const harness = await bootedHarness({ store })
		await harness.controller.send("first")
		await harness.controller.send("second")
		await harness.controller.send("third")
		refusing = true
		await vi.runAllTimersAsync()

		const state = harness.controller.getState()
		expect(outboxOf(harness.controller)).toEqual(["second", "third"])
		expect(promptsIn(state.messages)).toEqual([["user", "first", "complete"]])
		expect(state.errors.at(-1)?.error.kind).toBe("writeFailed")
		harness.detach()
	})

	it("keeps each bot's held prompts to itself", async () => {
		const store = createFakeTranscriptStore()
		const other = await store.createBot(botIdentity({ name: "Second" }))
		const harness = await bootedHarness({ store })
		await harness.controller.send("mine")
		await harness.controller.send("mine again")

		await harness.controller.open(other.id)
		await harness.controller.send("theirs")
		await harness.controller.send("theirs again")

		expect(
			harness.controller.stateFor(BOT).outbox.map((held) => held.text),
		).toEqual(["mine again"])
		expect(
			harness.controller.stateFor(other.id).outbox.map((held) => held.text),
		).toEqual(["theirs again"])

		await vi.runAllTimersAsync()

		const mine = await store.loadPage((await store.mainChat(BOT)).id, null)
		const theirs = await store.loadPage(
			(await store.mainChat(other.id)).id,
			null,
		)
		expect(promptsIn(mine.messages)).toEqual([
			["user", "mine", "complete"],
			["user", "mine again", "complete"],
		])
		expect(promptsIn(theirs.messages)).toEqual([
			["user", "theirs", "complete"],
			["user", "theirs again", "complete"],
		])
		harness.detach()
	})

	it("submits a held prompt naming the files it was staged with", async () => {
		const submits: string[] = []
		const harness = await bootedHarness({ driver: submitting(submits) })

		await harness.controller.send("first")
		await harness.controller.send("read this\n/tmp/shot.png")
		await vi.runAllTimersAsync()

		expect(submits.at(-1)).toContain("/tmp/shot.png")
		expect(spoken(harness.controller.getState().messages).at(-2)).toEqual([
			"user",
			"read this\n/tmp/shot.png",
			"complete",
		])
		harness.detach()
	})
})
