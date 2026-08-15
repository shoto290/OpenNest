import type {
	ChatMessage,
	ClaudeEvent,
	PermissionDecision,
	TurnOutcome,
} from "../claude/contract"
import { completionForOutcome, turnForOutcome } from "./chat-state"
import type { ChatDriver } from "./driver"

export type FakeChatDriver = ChatDriver & {
	pushEvent: (event: ClaudeEvent) => void
}

export type FakeChatDriverOptions = {
	stepMs?: number
	replyFor?: (prompt: string) => string
}

const FAIL_DIRECTIVE = "/fail"
const PERMISSION_DIRECTIVE = "/permission"

function defaultReply(prompt: string): string {
	return `Réponse simulée à « ${prompt} ». Ce texte est diffusé morceau par morceau par le faux driver pour reproduire un tour Claude Code complet.`
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

export function createFakeChatDriver(options: FakeChatDriverOptions = {}): FakeChatDriver {
	const stepMs = options.stepMs ?? 120
	const replyFor = options.replyFor ?? defaultReply
	const listeners = new Set<(event: ClaudeEvent) => void>()

	let sessionId: string | null = null
	let sessionSeq = 0
	let messageSeq = 0
	let permissionSeq = 0
	let deltaSeq = 0
	let turnActive = false
	let waiting = false
	let streaming: ChatMessage | null = null
	let pendingPermissionId: string | null = null
	let queue: Array<() => void> = []
	let timer: ReturnType<typeof setTimeout> | null = null

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
		}, stepMs)
	}

	const clearQueue = () => {
		queue = []
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
	}

	const finishTurn = (outcome: TurnOutcome) => {
		if (streaming) {
			emit({
				type: "messageCompleted",
				message: {
					...streaming,
					text: outcome === "completed" ? streaming.text : "",
					completion: completionForOutcome(outcome),
				},
			})
			streaming = null
		}
		turnActive = false
		waiting = false
		pendingPermissionId = null
		emit({ type: "turnEnded", ended: { sessionId, outcome } })
		emit({ type: "turnChanged", state: turnForOutcome(outcome) })
	}

	const requestPermission = () => {
		permissionSeq += 1
		const id = `fake-perm-${permissionSeq}`
		pendingPermissionId = id
		waiting = true
		emit({
			type: "permissionRequested",
			request: {
				id,
				toolName: "Bash",
				title: "Exécuter une commande",
				detail: "echo bonjour",
			},
		})
	}

	const appendDelta = (id: string, text: string) => {
		if (!streaming || streaming.id !== id) {
			return
		}
		streaming = { ...streaming, text: streaming.text + text }
		deltaSeq += 1
		emit({ type: "messageDelta", id, seq: deltaSeq, text })
	}

	const buildTurnSteps = (prompt: string): Array<() => void> => {
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
			() => emit({ type: "turnChanged", state: "submitting" }),
			() => emit({ type: "turnChanged", state: "running" }),
			() =>
				emit({
					type: "activity",
					activity: { id: activityId, title: "Réflexion", kind: "tool", status: "running" },
				}),
			() => {
				streaming = message
				emit({ type: "messageStarted", message })
			},
		]
		if (prompt.includes(PERMISSION_DIRECTIVE)) {
			steps.push(requestPermission)
		}
		for (const chunk of streamed) {
			steps.push(() => appendDelta(message.id, chunk))
		}
		steps.push(() =>
			emit({
				type: "activity",
				activity: {
					id: activityId,
					title: "Réflexion",
					kind: "tool",
					status: failing ? "failed" : "succeeded",
				},
			}),
		)
		if (failing) {
			steps.push(() => {
				emit({
					type: "failed",
					error: { kind: "crashed", code: 1, detail: "Panne simulée du faux driver" },
				})
				finishTurn("failed")
			})
		} else {
			steps.push(() => finishTurn("completed"))
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

		startOrResumeSession: (resume?: string) => {
			clearQueue()
			turnActive = false
			waiting = false
			streaming = null
			pendingPermissionId = null
			sessionSeq += 1
			sessionId = resume ?? `fake-session-${sessionSeq}`
			emit({ type: "connectionChanged", state: "ready" })
			emit({ type: "sessionReady", sessionId, resumed: Boolean(resume) })
			return Promise.resolve({ resumed: Boolean(resume) })
		},

		submitPrompt: (text: string) => {
			if (!sessionId) {
				return Promise.reject({ kind: "notStarted" })
			}
			if (turnActive) {
				return Promise.reject({ kind: "turnAlreadyRunning" })
			}
			turnActive = true
			queue.push(...buildTurnSteps(text))
			pump()
			return Promise.resolve()
		},

		cancelTurn: () => {
			if (!turnActive) {
				return Promise.reject({ kind: "noActiveTurn" })
			}
			clearQueue()
			emit({ type: "turnChanged", state: "stopping" })
			finishTurn("cancelled")
			return Promise.resolve()
		},

		respondToPermission: (id: string, decision: PermissionDecision) => {
			if (pendingPermissionId !== id) {
				return Promise.reject({ kind: "unknownPermission", id })
			}
			pendingPermissionId = null
			emit({ type: "permissionResolved", id, decision })
			if (decision === "deny") {
				clearQueue()
				finishTurn("cancelled")
				return Promise.resolve()
			}
			waiting = false
			pump()
			return Promise.resolve()
		},

		shutdown: () => {
			clearQueue()
			if (turnActive) {
				finishTurn("cancelled")
			}
			sessionId = null
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
