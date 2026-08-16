import {
	type ChatAction,
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isTurnBusy,
} from "./chat-state"
import type { ChatDriver } from "./driver"
import {
	clearStoredSession,
	readStoredSession,
	writeStoredSession,
} from "./session-storage"

import type {
	ChatMessage,
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
	TransportError,
} from "../claude/contract"

export type ChatController = {
	getState: () => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	/** Checks the binary and opens a session when it answers. Deduplicated while in flight. */
	preflight: (resume?: string) => Promise<SessionHandle | null>
	/** Drops the transcript on purpose. A restart never does this — a dead session
	 * clears its own state and leaves what the reader can still see. */
	clearConversation: () => void
	send: (text: string) => Promise<void>
	stop: () => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

/** A frame that closes something worth keeping. Streamed deltas are left out on
 * purpose: persisting each one would rewrite the record token by token. */
function isTurnBoundary(event: ClaudeEvent): boolean {
	return event.type === "sessionReady" || event.type === "turnEnded"
}

function toTransportError(reason: unknown): TransportError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as TransportError
	}
	return { kind: "writeFailed", detail: String(reason) }
}

export function createChatController(driver: ChatDriver): ChatController {
	let state = initialChatState
	let epoch = 0
	let localSeq = 0
	let detach: Promise<() => void> | null = null
	let pendingPreflight: Promise<SessionHandle | null> | null = null
	const listeners = new Set<() => void>()

	const dispatch = (action: ChatAction) => {
		const next = chatReducer(state, action)
		if (next === state) {
			return
		}
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	const report = (reason: unknown) =>
		dispatch({
			type: "driverEvent",
			epoch,
			event: { type: "failed", error: toTransportError(reason) },
		})

	const persist = () => {
		if (!state.sessionId) {
			return
		}
		writeStoredSession({
			sessionId: state.sessionId,
			messages: state.messages,
		})
	}

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
	}

	/** Resolves once the subscription is live. Tauri registers listeners over IPC,
	 * so a command issued before this settles loses the events it emits. */
	const connect = () => {
		const captured = epoch
		disconnect()
		detach = driver.subscribe((event) => {
			dispatch({ type: "driverEvent", epoch: captured, event })
			if (isTurnBoundary(event)) {
				persist()
			}
		})
		return detach
	}

	const attach = () => {
		connect()
		return disconnect
	}

	const check = async () => {
		try {
			const result = await driver.check()
			dispatch({ type: "binaryVersion", version: result.binaryVersion })
			dispatch({
				type: "driverEvent",
				epoch,
				event: { type: "connectionChanged", state: result.connection },
			})
			if (result.error) {
				report(result.error)
			}
			return result
		} catch (reason) {
			report(reason)
			return null
		}
	}

	const start = async (resume?: string) => {
		epoch += 1
		dispatch({ type: "sessionReset", epoch })
		try {
			if (detach) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(resume)
			dispatch({ type: "sessionOpened" })
			return handle
		} catch (reason) {
			report(reason)
			return null
		}
	}

	const restoreStored = () => {
		const stored = readStoredSession()
		if (stored) {
			dispatch({ type: "transcriptRestored", messages: stored.messages })
		}
		return stored
	}

	/** The stored id led nowhere. The transcript goes with it — it describes a
	 * session that no longer exists — and the reader is told once. */
	const startAfterFailedResume = () => {
		clearStoredSession()
		dispatch({ type: "conversationCleared" })
		report({ kind: "resumeFailed" })
		return start()
	}

	const runPreflight = async (resume?: string) => {
		const stored = resume === undefined ? restoreStored() : null
		const checked = await check()
		if (checked?.connection !== "ready") {
			return null
		}
		if (!stored) {
			return start(resume)
		}
		return (await start(stored.sessionId)) ?? startAfterFailedResume()
	}

	const preflight = (resume?: string) => {
		pendingPreflight ??= runPreflight(resume).finally(() => {
			pendingPreflight = null
		})
		return pendingPreflight
	}

	const clearConversation = () => {
		dispatch({ type: "conversationCleared" })
	}

	const submit = async (message: ChatMessage) => {
		try {
			await driver.submitPrompt(message.text)
		} catch (reason) {
			dispatch({
				type: "promptRejected",
				id: message.id,
				error: toTransportError(reason),
			})
		}
	}

	const send = async (text: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return
		}
		if (isTurnBusy(state.turn)) {
			report({ kind: "turnAlreadyRunning" })
			return
		}
		localSeq += 1
		const message: ChatMessage = {
			id: `local-${localSeq}`,
			role: "user",
			text: trimmed,
			completion: "complete",
			timestamp: Date.now(),
		}
		dispatch({ type: "promptSubmitted", message })
		await submit(message)
	}

	const retry = async (id: string) => {
		const target = state.messages.find((message) => message.id === id)
		if (target?.role !== "user" || target.completion !== "failed") {
			return
		}
		dispatch({ type: "promptRetried", id })
		await submit(target)
	}

	const stop = async () => {
		if (!canStopTurn(state.turn)) {
			return
		}
		dispatch({
			type: "driverEvent",
			epoch,
			event: { type: "turnChanged", state: "stopping" },
		})
		try {
			await driver.cancelTurn()
		} catch (reason) {
			dispatch({ type: "stopRejected", error: toTransportError(reason) })
		}
	}

	const respond = async (id: string, decision: PermissionDecision) => {
		await driver.respondToPermission(id, decision).catch(report)
	}

	const shutdown = async () => {
		persist()
		await driver.shutdown().catch(report)
	}

	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		attach,
		check,
		start,
		preflight,
		clearConversation,
		send,
		stop,
		respond,
		retry,
		shutdown,
	}
}
