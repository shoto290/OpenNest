import type { SubmittedAttachment } from "./attachments-contract"
import {
	completionForOutcome,
	isSameRuntimeScope,
	turnForOutcome,
} from "./chat-state"
import type { ChatDriver } from "./driver"
import { storedAttachmentPath } from "./message-attachments"

import type {
	AgentEvent,
	ChatMessage,
	PermissionDecision,
	RuntimeScope,
	ScopedEvent,
	TurnOutcome,
} from "../agent/contract"

export type FakeChatDriver = ChatDriver & {
	/** Emits under the run the fake started last, or under any run a caller names —
	 * which is how a test reproduces the one thing a driver cannot do to itself:
	 * speak for a session that has already been replaced. */
	pushEvent: (event: AgentEvent, scope?: RuntimeScope | null) => void
}

export type FakeChatDriverOptions = {
	stepMs?: number
	replyFor?: (prompt: string) => string
}

/** What a real session announces, named the way Claude Code names it: no leading
 * slash. Enough of them for `bun dev:web` to open the command menu. */
const FAKE_COMMANDS = [
	{ name: "clear", description: "Start a fresh conversation" },
	{ name: "compact", description: "Summarise the thread and free the context" },
	{ name: "cost", description: "Show what this session has spent so far" },
	{ name: "init", description: "Write a CLAUDE.md for this repository" },
	{ name: "review", description: "Review the pending changes on this branch" },
	{
		name: "status",
		description: "Report the session's model, mode and account",
	},
]

const FAIL_DIRECTIVE = "/fail"

const PERMISSION_DIRECTIVE = "/permission"

/** Several paragraphs, so `bun dev:web` shows an answer landing in the flow one
 * message at a time rather than as a single block. */
function defaultReply(prompt: string): string {
	return `Simulated reply to "${prompt}".\n\nThe fake driver streams this text piece by piece to reproduce a whole Claude Code turn.\n\nEach paragraph lands in the thread as soon as it is finished.`
}

function toChunks(reply: string): string[] {
	const words = reply.split(" ")
	const chunks: string[] = []
	for (let index = 0; index < words.length; index += 3) {
		const chunk = words.slice(index, index + 3).join(" ")
		chunks.push(index === 0 ? chunk : ` ${chunk}`)
	}
	return chunks
}

/** One fake child: everything a session holds while it answers. There is one per
 * participant, the way the host runs one process per bot, so two bots streaming at
 * once neither share a turn nor cut each other off. */
type FakeRun = {
	scope: RuntimeScope
	sessionId: string | null
	deltaSeq: number
	turnActive: boolean
	waiting: boolean
	streaming: ChatMessage | null
	pendingPermissionId: string | null
	announced: boolean
	queue: Array<() => void>
	timer: ReturnType<typeof setTimeout> | null
}

/** The conversation and the bot a run answers for, which is what the host keys its
 * live runtimes by too. */
const participantOf = (scope: RuntimeScope) =>
	`${scope.conversationId} ${scope.botId}`

export function createFakeChatDriver(
	options: FakeChatDriverOptions = {},
): FakeChatDriver {
	const stepMs = options.stepMs ?? 120
	const replyFor = options.replyFor ?? defaultReply
	const listeners = new Set<(event: ScopedEvent) => void>()

	const runs = new Map<string, FakeRun>()
	/** The run a caller that names none is speaking about: the last one started.
	 * A test driving a single bot never has to name it. */
	let latest: FakeRun | null = null
	/** Minted across every run, because two bots writing into one store may not mint
	 * the same message id. */
	let sessionSeq = 0
	let messageSeq = 0
	let permissionSeq = 0

	/** Everything crosses under the run it came from, the way the host stamps its
	 * channel. */
	const emit = (
		event: AgentEvent,
		scope: RuntimeScope | null = latest?.scope ?? null,
	) => {
		for (const listener of listeners) {
			listener({ scope, event })
		}
	}

	const emitFor = (run: FakeRun, event: AgentEvent) => emit(event, run.scope)

	const heldFor = (scope: RuntimeScope) =>
		runs.get(participantOf(scope)) ?? null

	/** The host refuses a command that names a run it is not holding for that bot,
	 * and so does this: a fake that answered anyway would let a test pass on a
	 * boundary production does not have. A bot holding no run refuses nobody — there
	 * is no other session of its own for a late caller to reach past. */
	const isForeign = (scope: RuntimeScope) => {
		const held = heldFor(scope)
		return held !== null && !isSameRuntimeScope(scope, held.scope)
	}

	const refuseStale = (scope: RuntimeScope) =>
		Promise.reject({
			kind: "staleRuntimeSession",
			runtimeSessionId: scope.runtimeSessionId,
		})

	const pump = (run: FakeRun) => {
		if (run.timer || run.waiting || run.queue.length === 0) {
			return
		}
		run.timer = setTimeout(() => {
			run.timer = null
			run.queue.shift()?.()
			pump(run)
		}, stepMs)
	}

	const clearQueue = (run: FakeRun) => {
		run.queue = []
		if (run.timer) {
			clearTimeout(run.timer)
			run.timer = null
		}
	}

	const finishTurn = (run: FakeRun, outcome: TurnOutcome) => {
		if (run.streaming) {
			emitFor(run, {
				type: "messageCompleted",
				message: {
					...run.streaming,
					text: outcome === "completed" ? run.streaming.text : "",
					completion: completionForOutcome(outcome),
				},
			})
			run.streaming = null
		}
		run.turnActive = false
		run.waiting = false
		run.pendingPermissionId = null
		emitFor(run, {
			type: "turnEnded",
			ended: { sessionId: run.sessionId, outcome },
		})
		emitFor(run, { type: "turnChanged", state: turnForOutcome(outcome) })
	}

	const requestPermission = (run: FakeRun) => {
		permissionSeq += 1
		const id = `fake-perm-${permissionSeq}`
		run.pendingPermissionId = id
		run.waiting = true
		// The transport announces the wait as an activity row before it asks, so the
		// pending step is visible in the log and not only in the approval card.
		emitFor(run, {
			type: "activity",
			activity: {
				id,
				title: "Run a command",
				kind: "permission",
				status: "pending",
			},
		})
		emitFor(run, {
			type: "permissionRequested",
			request: {
				id,
				toolName: "Bash",
				title: "Run a command",
				detail: "echo hello",
			},
		})
	}

	const appendDelta = (run: FakeRun, id: string, text: string) => {
		if (!run.streaming || run.streaming.id !== id) {
			return
		}
		run.streaming = { ...run.streaming, text: run.streaming.text + text }
		run.deltaSeq += 1
		emitFor(run, { type: "messageDelta", id, seq: run.deltaSeq, text })
	}

	const buildTurnSteps = (run: FakeRun, prompt: string): Array<() => void> => {
		messageSeq += 1
		const message: ChatMessage = {
			id: `fake-msg-${messageSeq}`,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: Date.now(),
		}
		const failing = prompt.includes(FAIL_DIRECTIVE)
		const chunks = toChunks(replyFor(prompt))
		const streamed = failing ? chunks.slice(0, 2) : chunks
		const activityId = `fake-act-${messageSeq}`

		const steps: Array<() => void> = [
			() => emitFor(run, { type: "turnChanged", state: "submitting" }),
			() => emitFor(run, { type: "turnChanged", state: "running" }),
			() =>
				emitFor(run, {
					type: "activity",
					activity: {
						id: activityId,
						title: "Thinking",
						kind: "tool",
						status: "running",
					},
				}),
			() => {
				run.streaming = message
				emitFor(run, { type: "messageStarted", message })
			},
		]
		if (prompt.includes(PERMISSION_DIRECTIVE)) {
			steps.push(() => requestPermission(run))
		}
		for (const chunk of streamed) {
			steps.push(() => appendDelta(run, message.id, chunk))
		}
		steps.push(() =>
			emitFor(run, {
				type: "activity",
				activity: {
					id: activityId,
					title: "Thinking",
					kind: "tool",
					status: failing ? "failed" : "succeeded",
				},
			}),
		)
		if (failing) {
			steps.push(() => {
				emitFor(run, {
					type: "failed",
					error: {
						kind: "crashed",
						code: 1,
						detail: "Simulated fake driver crash",
					},
				})
				finishTurn(run, "failed")
			})
		} else {
			steps.push(() => finishTurn(run, "completed"))
		}
		return steps
	}

	return {
		check: () =>
			Promise.resolve({
				connection: "ready",
				binaryVersion: "fake-0.0.1",
				authenticated: true,
				error: null,
			}),

		/** A start replaces the run of the bot it names and of no other: every other
		 * bot keeps the child it is answering in. */
		startOrResumeSession: (scope: RuntimeScope, resume?: string) => {
			const replaced = heldFor(scope)
			if (replaced) {
				clearQueue(replaced)
			}
			sessionSeq += 1
			const run: FakeRun = {
				scope,
				sessionId: resume ?? `fake-session-${sessionSeq}`,
				deltaSeq: 0,
				turnActive: false,
				waiting: false,
				streaming: null,
				pendingPermissionId: null,
				announced: false,
				queue: [],
				timer: null,
			}
			runs.set(participantOf(scope), run)
			latest = run
			emitFor(run, { type: "connectionChanged", state: "ready" })
			emitFor(run, { type: "commandsListed", commands: FAKE_COMMANDS })
			return Promise.resolve({ resumed: Boolean(resume) })
		},

		submitPrompt: (scope: RuntimeScope, text: string) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run?.sessionId) {
				return Promise.reject({ kind: "notStarted" })
			}
			if (run.turnActive) {
				return Promise.reject({ kind: "turnAlreadyRunning" })
			}
			run.turnActive = true
			// The CLI only emits `system/init` once it starts answering, so the
			// session id lands on the first prompt and never before it.
			if (!run.announced) {
				run.announced = true
				emitFor(run, {
					type: "sessionReady",
					sessionId: run.sessionId,
					resumed: false,
				})
			}
			run.queue.push(...buildTurnSteps(run, text))
			pump(run)
			return Promise.resolve()
		},

		/** Nothing is written: an attachment reaches Claude as a path, so a plausible
		 * one is the whole of what `bun dev:web` needs to compose the prompt. Shaped
		 * the way the host shapes a stored one, so the bubble reads it back as a file
		 * rather than as a line of text. */
		storeAttachments: (
			conversationId: string,
			attachments: SubmittedAttachment[],
		) =>
			Promise.resolve(
				attachments.map((attachment) =>
					storedAttachmentPath({
						root: "/tmp/opennest",
						conversationId,
						submittedName: attachment.name,
					}),
				),
			),

		cancelTurn: (scope: RuntimeScope) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run?.turnActive) {
				return Promise.reject({ kind: "noActiveTurn" })
			}
			clearQueue(run)
			emitFor(run, { type: "turnChanged", state: "stopping" })
			finishTurn(run, "cancelled")
			return Promise.resolve()
		},

		respondToPermission: (
			scope: RuntimeScope,
			id: string,
			decision: PermissionDecision,
		) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (run?.pendingPermissionId !== id) {
				return Promise.reject({ kind: "unknownPermission", id })
			}
			run.pendingPermissionId = null
			emitFor(run, { type: "permissionResolved", id, decision })
			if (decision === "deny") {
				clearQueue(run)
				finishTurn(run, "cancelled")
				return Promise.resolve()
			}
			run.waiting = false
			pump(run)
			return Promise.resolve()
		},

		/** Refused for a run the bot no longer holds, and a no-op when it holds
		 * none: shutting down twice is as safe as shutting down once. */
		shutdown: (scope: RuntimeScope) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run) {
				return Promise.resolve()
			}
			clearQueue(run)
			if (run.turnActive) {
				finishTurn(run, "cancelled")
			}
			runs.delete(participantOf(scope))
			if (latest === run) {
				latest = null
			}
			return Promise.resolve()
		},

		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},

		pushEvent: emit,
	}
}
