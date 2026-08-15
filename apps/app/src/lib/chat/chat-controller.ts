import type {
	ChatMessage,
	CheckReport,
	PermissionDecision,
	SessionHandle,
	TransportError,
} from "../claude/contract"
import { type ChatAction, type ChatState, chatReducer, initialChatState } from "./chat-state"
import type { ChatDriver } from "./driver"

export type ChatController = {
	getState: () => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	send: (text: string) => Promise<void>
	stop: () => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
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

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
	}

	const connect = () => {
		const captured = epoch
		disconnect()
		detach = driver.subscribe((event) =>
			dispatch({ type: "driverEvent", epoch: captured, event }),
		)
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
		if (detach) {
			connect()
		}
		try {
			return await driver.startOrResumeSession(resume)
		} catch (reason) {
			report(reason)
			return null
		}
	}

	const submit = async (message: ChatMessage) => {
		try {
			await driver.submitPrompt(message.text)
		} catch (reason) {
			dispatch({ type: "promptRejected", id: message.id, error: toTransportError(reason) })
		}
	}

	const send = async (text: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return
		}
		if (state.turn !== "idle" && state.turn !== "failed") {
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
		if (state.turn !== "submitting" && state.turn !== "running") {
			return
		}
		dispatch({ type: "driverEvent", epoch, event: { type: "turnChanged", state: "stopping" } })
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
		send,
		stop,
		respond,
		retry,
		shutdown,
	}
}
