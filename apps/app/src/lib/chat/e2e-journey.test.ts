import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import type { ChatDriver } from "./driver"

import type {
	ActivityKind,
	ActivityStatus,
	ChatMessage,
	ClaudeEvent,
	MessageCompletion,
	PermissionDecision,
} from "../claude/contract"

const STEP_MS = 10
const DEFAULT_SESSION = "fake-session-0001"
const BINARY_VERSION = "2.1.233"

type ScriptedScenario = "normal" | "tool" | "permission" | "slow"

type DriverCall =
	| { type: "check" }
	| { type: "start"; resume?: string; cwd?: string }
	| { type: "prompt"; text: string }
	| { type: "cancel" }
	| { type: "permission"; id: string; decision: PermissionDecision }
	| { type: "shutdown" }

type ScriptedDriver = ChatDriver & {
	calls: DriverCall[]
	pushEvent: (event: ClaudeEvent) => void
}

type ScriptedDriverOptions = {
	turns: ScriptedScenario[]
	/** Claude mints a globally unique message id per answer. Two runs of the same
	 * fake would otherwise collide with a transcript restored from the first. */
	messageIdPrefix: string
}

/** Mirrors `emit_text_turn`, which streams `split_inclusive(' ')`. */
function toChunks(text: string): string[] {
	const words = text.split(" ")
	return words
		.map((word, index) => (index === words.length - 1 ? word : `${word} `))
		.filter((chunk) => chunk.length > 0)
}

function activityEvent(
	id: string,
	title: string,
	kind: ActivityKind,
	status: ActivityStatus,
): ClaudeEvent {
	return { type: "activity", activity: { id, title, kind, status } }
}

/** Replays the `ClaudeEvent` stream `fake_claude` produces, in the order the
 * session layer forwards it: the host frames it emits itself around the child
 * frames it translates. */
function createScriptedDriver(options: ScriptedDriverOptions): ScriptedDriver {
	const listeners = new Set<(event: ClaudeEvent) => void>()
	const calls: DriverCall[] = []

	let queue: Array<() => void> = []
	let timer: ReturnType<typeof setTimeout> | null = null
	let waiting = false
	let sessionId = DEFAULT_SESSION
	let resumed = false
	let announced = false
	let turnIndex = 0
	let messageSeq = 0
	let deltaSeq = 0
	let streamingId: string | null = null

	const emit = (event: ClaudeEvent) => {
		for (const listener of listeners) {
			listener(event)
		}
	}

	const pump = () => {
		if (timer || waiting || queue.length === 0) {
			return
		}
		timer = setTimeout(() => {
			timer = null
			queue.shift()?.()
			pump()
		}, STEP_MS)
	}

	const clearQueue = () => {
		queue = []
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
	}

	const assistantMessage = (
		id: string,
		text: string,
		completion: MessageCompletion,
	): ChatMessage => ({
		id,
		role: "assistant",
		text,
		completion,
		timestamp: Date.now(),
	})

	const endTurn = (outcome: "completed" | "cancelled") => {
		emit({ type: "turnEnded", ended: { sessionId, outcome } })
		emit({ type: "turnChanged", state: "idle" })
	}

	const textTurnSteps = (text: string): Array<() => void> => {
		messageSeq += 1
		const id = `${options.messageIdPrefix}_${messageSeq}`
		const steps: Array<() => void> = [
			() => {
				streamingId = id
				emit({
					type: "messageStarted",
					message: assistantMessage(id, "", "streaming"),
				})
			},
		]
		for (const chunk of toChunks(text)) {
			steps.push(() => {
				deltaSeq += 1
				emit({ type: "messageDelta", id, seq: deltaSeq, text: chunk })
			})
		}
		steps.push(() => {
			streamingId = null
			emit({
				type: "messageCompleted",
				message: assistantMessage(id, text, "complete"),
			})
		})
		return steps
	}

	const toolTurnSteps = (): Array<() => void> => [
		() => emit(activityEvent("toolu_fake_1", "Bash", "tool", "running")),
		() =>
			emit(
				activityEvent("toolu_fake_1", "Bash · Echo FAKE", "tool", "running"),
			),
		() =>
			emit(
				activityEvent("toolu_fake_1", "Bash · Echo FAKE", "tool", "succeeded"),
			),
	]

	const permissionSteps = (): Array<() => void> => [
		() => {
			waiting = true
			emit(
				activityEvent(
					"perm_fake_1",
					"Write · notes.txt",
					"permission",
					"pending",
				),
			)
			emit({
				type: "permissionRequested",
				request: {
					id: "perm_fake_1",
					toolName: "Write",
					title: "Write · notes.txt",
					detail: "/fake/notes.txt",
				},
			})
		},
	]

	const slowSteps = (): Array<() => void> => [
		() => {
			const id = `${options.messageIdPrefix}_slow`
			streamingId = id
			emit({
				type: "messageStarted",
				message: assistantMessage(id, "", "streaming"),
			})
		},
	]

	const scenarioSteps = (
		scenario: ScriptedScenario,
		prompt: string,
	): Array<() => void> => {
		switch (scenario) {
			case "normal": {
				const reply = resumed
					? `resumed ${sessionId} :: ${prompt}`
					: `echo :: ${prompt}`
				return [...textTurnSteps(reply), () => endTurn("completed")]
			}
			case "tool":
				return [
					...toolTurnSteps(),
					...textTurnSteps("done"),
					() => endTurn("completed"),
				]
			case "permission":
				return permissionSteps()
			case "slow":
				return slowSteps()
		}
	}

	/** The host flips `submitting` to `running` on the first frame of the turn
	 * body, in the same pass that translates it. */
	const withTurnStart = (steps: Array<() => void>): Array<() => void> => {
		const [first, ...rest] = steps
		return [
			() => {
				emit({ type: "turnChanged", state: "running" })
				first()
			},
			...rest,
		]
	}

	return {
		calls,

		pushEvent: emit,

		check: () => {
			calls.push({ type: "check" })
			emit({ type: "connectionChanged", state: "checking" })
			emit({ type: "connectionChanged", state: "ready" })
			return Promise.resolve({
				connection: "ready",
				binaryVersion: BINARY_VERSION,
				authenticated: true,
				error: null,
			})
		},

		startOrResumeSession: (resume?: string, cwd?: string) => {
			calls.push({ type: "start", resume, cwd })
			clearQueue()
			sessionId = resume ?? DEFAULT_SESSION
			resumed = Boolean(resume)
			announced = false
			messageSeq = 0
			deltaSeq = 0
			streamingId = null
			waiting = false
			emit({ type: "connectionChanged", state: "ready" })
			return Promise.resolve({ resumed })
		},

		submitPrompt: (text: string) => {
			calls.push({ type: "prompt", text })
			emit({ type: "turnChanged", state: "submitting" })
			const scenario = options.turns[turnIndex] ?? "normal"
			turnIndex += 1
			if (!announced) {
				announced = true
				queue.push(() => emit({ type: "sessionReady", sessionId, resumed }))
			}
			queue.push(...withTurnStart(scenarioSteps(scenario, text)))
			pump()
			return Promise.resolve()
		},

		cancelTurn: () => {
			calls.push({ type: "cancel" })
			clearQueue()
			emit({ type: "turnChanged", state: "stopping" })
			queue.push(() => {
				if (streamingId) {
					emit({
						type: "messageCompleted",
						message: assistantMessage(streamingId, "", "cancelled"),
					})
					streamingId = null
				}
				endTurn("cancelled")
			})
			pump()
			return Promise.resolve()
		},

		respondToPermission: (id: string, decision: PermissionDecision) => {
			calls.push({ type: "permission", id, decision })
			emit({ type: "permissionResolved", id, decision })
			waiting = false
			queue.push(
				() =>
					emit(
						activityEvent(
							"toolu_fake_perm",
							"",
							"tool",
							decision === "allowOnce" ? "succeeded" : "failed",
						),
					),
				() => endTurn("completed"),
			)
			pump()
			return Promise.resolve()
		},

		shutdown: () => {
			calls.push({ type: "shutdown" })
			clearQueue()
			emit({ type: "connectionChanged", state: "checking" })
			return Promise.resolve()
		},

		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},
	}
}

function createMemoryStorage() {
	const entries = new Map<string, string>()

	return {
		get length() {
			return entries.size
		},
		key: (index: number) => [...entries.keys()][index] ?? null,
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value)
		},
		removeItem: (key: string) => {
			entries.delete(key)
		},
		clear: () => {
			entries.clear()
		},
	} satisfies Storage
}

function startCalls(driver: ScriptedDriver): DriverCall[] {
	return driver.calls.filter((call) => call.type === "start")
}

describe("chat journey", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal("localStorage", createMemoryStorage())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it("carries one conversation from launch through a relaunch that resumes it", async () => {
		const driver = createScriptedDriver({
			turns: ["normal", "tool", "permission", "slow"],
			messageIdPrefix: "msg_fake",
		})
		const controller = createChatController(driver)
		const detach = controller.attach()

		await controller.preflight()

		const launched = controller.getState()
		expect(startCalls(driver)).toEqual([
			{ type: "start", resume: undefined, cwd: undefined },
		])
		expect(launched.connection).toBe("ready")
		expect(launched.binaryVersion).toBe(BINARY_VERSION)
		expect(isSessionReady(launched)).toBe(true)
		expect(launched.messages).toEqual([])

		await controller.send("hello")
		expect(controller.getState().turn).toBe("submitting")

		await vi.advanceTimersByTimeAsync(STEP_MS * 4)

		const streaming = controller.getState()
		const answerId = streaming.messages[1].id
		expect(streaming.sessionId).toBe(DEFAULT_SESSION)
		expect(streaming.turn).toBe("running")
		expect(streaming.messages[1]).toMatchObject({
			role: "assistant",
			text: "echo :: ",
			completion: "streaming",
		})
		expect(streaming.deltaSeqs[answerId]).toBe(2)

		driver.pushEvent({
			type: "messageDelta",
			id: answerId,
			seq: 2,
			text: "REPLAYED",
		})

		const deduped = controller.getState()
		expect(deduped.messages[1].text).toBe("echo :: ")
		expect(deduped.deltaSeqs[answerId]).toBe(2)

		await vi.runAllTimersAsync()

		const answered = controller.getState()
		expect(answered.turn).toBe("idle")
		expect(answered.messages.map((message) => message.role)).toEqual([
			"user",
			"assistant",
		])
		expect(answered.messages[1]).toMatchObject({
			text: "echo :: hello",
			completion: "complete",
		})

		await controller.send("run the command")
		await vi.runAllTimersAsync()

		const tooled = controller.getState()
		expect(tooled.activities).toEqual([
			{
				id: "toolu_fake_1",
				title: "Bash · Echo FAKE",
				kind: "tool",
				status: "succeeded",
			},
		])
		expect(tooled.messages.at(-1)).toMatchObject({
			role: "assistant",
			text: "done",
			completion: "complete",
		})
		expect(tooled.turn).toBe("idle")

		await controller.send("write the notes")
		await vi.runAllTimersAsync()

		const asked = controller.getState()
		expect(asked.turn).toBe("running")
		expect(asked.permission).toEqual({
			id: "perm_fake_1",
			toolName: "Write",
			title: "Write · notes.txt",
			detail: "/fake/notes.txt",
		})
		expect(
			asked.activities.find((activity) => activity.id === "perm_fake_1")
				?.status,
		).toBe("pending")

		await controller.respond("perm_fake_1", "allowOnce")
		await vi.runAllTimersAsync()

		const granted = controller.getState()
		expect(granted.permission).toBeNull()
		expect(granted.turn).toBe("idle")
		expect(granted.activities.map((activity) => activity.status)).toEqual([
			"succeeded",
			"succeeded",
			"succeeded",
		])
		expect(readStoredMessages()).toEqual(granted.messages)

		await controller.send("wait")
		await vi.advanceTimersByTimeAsync(STEP_MS)
		expect(controller.getState().turn).toBe("running")
		expect(controller.getState().messages.at(-1)?.completion).toBe("streaming")

		await controller.stop()
		await vi.runAllTimersAsync()

		const stopped = controller.getState()
		expect(stopped.turn).toBe("idle")
		expect(stopped.messages.at(-1)).toMatchObject({
			role: "assistant",
			completion: "cancelled",
		})
		expect(isSessionReady(stopped)).toBe(true)

		await controller.send("one more thing")
		await vi.advanceTimersByTimeAsync(STEP_MS * 3)

		const quitting = controller.getState()
		expect(quitting.turn).toBe("running")
		expect(quitting.messages.at(-1)).toMatchObject({
			role: "assistant",
			text: "echo :: ",
			completion: "streaming",
		})

		await controller.shutdown()
		detach()

		const relaunchedDriver = createScriptedDriver({
			turns: [],
			messageIdPrefix: "msg_resumed",
		})
		const relaunched = createChatController(relaunchedDriver)
		const stopRelaunched = relaunched.attach()

		await relaunched.preflight()

		expect(startCalls(relaunchedDriver)).toEqual([
			{ type: "start", resume: DEFAULT_SESSION, cwd: undefined },
		])

		const restored = relaunched.getState()
		expect(
			restored.messages.some((message) => message.completion === "streaming"),
		).toBe(false)
		expect(restored.messages.slice(0, -1)).toEqual(
			quitting.messages.slice(0, -1),
		)
		expect(restored.messages.at(-1)).toEqual({
			...quitting.messages.at(-1),
			completion: "cancelled",
		})

		await relaunched.send("again")
		await vi.runAllTimersAsync()

		const continued = relaunched.getState()
		expect(continued.sessionId).toBe(DEFAULT_SESSION)
		expect(continued.messages.slice(0, restored.messages.length)).toEqual(
			restored.messages,
		)
		expect(continued.messages.at(-1)).toMatchObject({
			role: "assistant",
			text: `resumed ${DEFAULT_SESSION} :: again`,
			completion: "complete",
		})
		stopRelaunched()
	})
})

function readStoredMessages(): ChatMessage[] | null {
	const raw = localStorage.getItem("chat.session")
	return raw === null ? null : JSON.parse(raw).messages
}
