import { useCallback, useEffect, useReducer, useRef } from "react"

import type {
	ActivityEvent,
	ChatMessage,
	ClaudeEvent,
	ConnectionState,
	PermissionDecision,
	PermissionRequest,
	TransportError,
	TurnState,
} from "./contract"
import { claudeTransport } from "./transport"

export type ReportedError = {
	id: string
	error: TransportError
}

type TransportSnapshot = {
	connection: ConnectionState
	turn: TurnState
	sessionId: string | null
	binaryVersion: string | null
	messages: ChatMessage[]
	activities: ActivityEvent[]
	permission: PermissionRequest | null
	errors: ReportedError[]
}

type Action =
	| { type: "event"; event: ClaudeEvent }
	| { type: "localMessage"; message: ChatMessage }
	| { type: "binaryVersion"; version: string | null }
	| { type: "reset" }

const initialSnapshot: TransportSnapshot = {
	connection: "checking",
	turn: "idle",
	sessionId: null,
	binaryVersion: null,
	messages: [],
	activities: [],
	permission: null,
	errors: [],
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
	const index = messages.findIndex((entry) => entry.id === message.id)
	if (index === -1) {
		return [...messages, message]
	}
	const merged = { ...messages[index], ...message }
	return messages.with(index, merged.text ? merged : { ...merged, text: messages[index].text })
}

function upsertActivity(activities: ActivityEvent[], activity: ActivityEvent): ActivityEvent[] {
	const index = activities.findIndex((entry) => entry.id === activity.id)
	if (index === -1) {
		return [...activities, activity]
	}
	const previous = activities[index]
	return activities.with(index, { ...previous, ...activity, title: activity.title || previous.title })
}

function applyEvent(state: TransportSnapshot, event: ClaudeEvent): TransportSnapshot {
	switch (event.type) {
		case "connectionChanged":
			return { ...state, connection: event.state }
		case "turnChanged":
			return { ...state, turn: event.state }
		case "sessionReady":
			return { ...state, sessionId: event.sessionId }
		case "messageStarted":
			return { ...state, messages: upsertMessage(state.messages, event.message) }
		case "messageDelta": {
			const index = state.messages.findIndex((entry) => entry.id === event.id)
			if (index === -1) {
				return state
			}
			const target = state.messages[index]
			return {
				...state,
				messages: state.messages.with(index, { ...target, text: target.text + event.text }),
			}
		}
		case "messageCompleted":
			return { ...state, messages: upsertMessage(state.messages, event.message) }
		case "activity":
			return { ...state, activities: upsertActivity(state.activities, event.activity) }
		case "permissionRequested":
			return { ...state, permission: event.request }
		case "permissionResolved":
			return state.permission?.id === event.id ? { ...state, permission: null } : state
		case "turnEnded":
			return { ...state, sessionId: event.ended.sessionId ?? state.sessionId, permission: null }
		case "failed":
			return {
				...state,
				errors: [
					...state.errors,
					{ id: `${event.error.kind}-${state.errors.length}-${Date.now()}`, error: event.error },
				],
			}
	}
}

function reducer(state: TransportSnapshot, action: Action): TransportSnapshot {
	switch (action.type) {
		case "event":
			return applyEvent(state, action.event)
		case "localMessage":
			return { ...state, messages: upsertMessage(state.messages, action.message) }
		case "binaryVersion":
			return { ...state, binaryVersion: action.version }
		case "reset":
			return { ...initialSnapshot, connection: state.connection, binaryVersion: state.binaryVersion }
	}
}

function toTransportError(reason: unknown): TransportError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as TransportError
	}
	return { kind: "writeFailed", detail: String(reason) }
}

export function useClaudeTransport() {
	const [state, dispatch] = useReducer(reducer, initialSnapshot)
	const sessionIdRef = useRef<string | null>(null)
	sessionIdRef.current = state.sessionId

	useEffect(() => {
		const pending = claudeTransport.subscribe((event) => dispatch({ type: "event", event }))
		return () => {
			pending.then((unlisten) => unlisten())
		}
	}, [])

	const report = useCallback(
		(reason: unknown) =>
			dispatch({ type: "event", event: { type: "failed", error: toTransportError(reason) } }),
		[],
	)

	const check = useCallback(async () => {
		const result = await claudeTransport.check()
		dispatch({ type: "binaryVersion", version: result.binaryVersion })
		if (result.error) {
			dispatch({ type: "event", event: { type: "failed", error: result.error } })
		}
		return result
	}, [])

	const start = useCallback(
		async (resume?: string) => {
			dispatch({ type: "reset" })
			try {
				return await claudeTransport.startOrResumeSession(resume)
			} catch (reason) {
				report(reason)
				return null
			}
		},
		[report],
	)

	const submit = useCallback(
		async (text: string) => {
			dispatch({
				type: "localMessage",
				message: {
					id: `local-${Date.now()}`,
					role: "user",
					text,
					completion: "complete",
					timestamp: Date.now(),
				},
			})
			await claudeTransport.submitPrompt(text).catch(report)
		},
		[report],
	)

	const cancel = useCallback(() => claudeTransport.cancelTurn().catch(report), [report])

	const respond = useCallback(
		(id: string, decision: PermissionDecision) =>
			claudeTransport.respondToPermission(id, decision).catch(report),
		[report],
	)

	const shutdown = useCallback(() => claudeTransport.shutdown().catch(report), [report])

	const resumeCurrent = useCallback(
		() => start(sessionIdRef.current ?? undefined),
		[start],
	)

	return { state, check, start, resumeCurrent, submit, cancel, respond, shutdown }
}
