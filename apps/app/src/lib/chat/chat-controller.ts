import {
	type ChatAction,
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isTurnBusy,
	toSessionSnapshot,
} from "./chat-state"
import type { ChatDriver } from "./driver"

import type {
	ChatMessage,
	CheckReport,
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
	/** Hydrates the stored transcript, then resumes its session. Sequential by
	 * construction: two parallel effects would open a brand-new session while the
	 * transcript is still loading, and the resume id would be lost. */
	boot: () => Promise<SessionHandle | null>
	/** Reopens the session the transcript belongs to. The recovery affordance the
	 * reader is offered, so it resumes rather than starting Claude amnesiac. */
	restart: () => Promise<SessionHandle | null>
	send: (text: string) => Promise<void>
	stop: () => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

const LOCAL_ID_PREFIX = "local-"

const STREAMING_PERSIST_MS = 1000

function toTransportError(reason: unknown): TransportError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as TransportError
	}
	return { kind: "writeFailed", detail: String(reason) }
}

function localSeqOf(id: string): number {
	if (!id.startsWith(LOCAL_ID_PREFIX)) {
		return 0
	}
	const seq = Number(id.slice(LOCAL_ID_PREFIX.length))
	return Number.isInteger(seq) ? seq : 0
}

/** Restored messages already carry minted ids, so the counter has to pick up where
 * the stored transcript left off or the next prompt reuses an id on screen. */
function highestLocalSeq(messages: ChatMessage[]): number {
	return messages.reduce(
		(highest, message) => Math.max(highest, localSeqOf(message.id)),
		0,
	)
}

export function createChatController(driver: ChatDriver): ChatController {
	let state = initialChatState
	let epoch = 0
	let localSeq = 0
	let detach: Promise<() => void> | null = null
	let pendingPreflight: Promise<SessionHandle | null> | null = null
	let scheduledPersist: ReturnType<typeof setTimeout> | null = null
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

	const writeSnapshot = () => {
		void driver.saveSession(toSessionSnapshot(state)).catch(() => undefined)
	}

	const cancelScheduledPersist = () => {
		if (scheduledPersist === null) {
			return
		}
		clearTimeout(scheduledPersist)
		scheduledPersist = null
	}

	const persistNow = () => {
		cancelScheduledPersist()
		writeSnapshot()
	}

	/** A turn in flight is worth keeping — quitting mid-answer must not lose it —
	 * but it emits one delta per token, and a write per delta would rewrite the
	 * whole transcript per token. */
	const persistSoon = () => {
		scheduledPersist ??= setTimeout(() => {
			scheduledPersist = null
			writeSnapshot()
		}, STREAMING_PERSIST_MS)
	}

	const disconnect = () => {
		cancelScheduledPersist()
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
			if (captured !== epoch) {
				return
			}
			if (event.type === "turnEnded") {
				persistNow()
				return
			}
			if (isTurnBusy(state.turn)) {
				persistSoon()
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
		dispatch({ type: "sessionReset", epoch, sessionId: resume ?? null })
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

	const runPreflight = async (resume?: string) => {
		const checked = await check()
		if (checked?.connection !== "ready") {
			return null
		}
		return start(resume)
	}

	const preflight = (resume?: string) => {
		pendingPreflight ??= runPreflight(resume).finally(() => {
			pendingPreflight = null
		})
		return pendingPreflight
	}

	const boot = async () => {
		const snapshot = await driver.loadSession().catch(() => null)
		if (snapshot) {
			dispatch({ type: "sessionRestored", snapshot })
			localSeq = Math.max(localSeq, highestLocalSeq(snapshot.messages))
		}
		return preflight(snapshot?.sessionId ?? undefined)
	}

	const restart = () => preflight(state.sessionId ?? undefined)

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
			id: `${LOCAL_ID_PREFIX}${localSeq}`,
			role: "user",
			text: trimmed,
			completion: "complete",
			timestamp: Date.now(),
		}
		dispatch({ type: "promptSubmitted", message })
		persistNow()
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
		boot,
		restart,
		send,
		stop,
		respond,
		retry,
		shutdown,
	}
}
