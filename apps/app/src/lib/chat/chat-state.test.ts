import { describe, expect, it } from "vitest"

import {
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isSessionReady,
	isTurnBusy,
} from "./chat-state"

import type { ChatMessage, ClaudeEvent } from "../claude/contract"

function applyEvents(state: ChatState, events: ClaudeEvent[]): ChatState {
	return events.reduce(
		(current, event) =>
			chatReducer(current, {
				type: "driverEvent",
				epoch: current.epoch,
				event,
			}),
		state,
	)
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: "msg-1",
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 0,
		...overrides,
	}
}

const streamedTurn: ClaudeEvent[] = [
	{ type: "turnChanged", state: "submitting" },
	{ type: "turnChanged", state: "running" },
	{ type: "messageStarted", message: assistantMessage() },
	{ type: "messageDelta", id: "msg-1", seq: 1, text: "Hello" },
	{ type: "messageDelta", id: "msg-1", seq: 2, text: " world" },
]

describe("chatReducer", () => {
	it("assembles a streamed assistant message", () => {
		const state = applyEvents(initialChatState, streamedTurn)
		expect(state.turn).toBe("running")
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Hello world")
	})

	it("ignores a replayed messageStarted without resetting text", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageStarted", message: assistantMessage() },
		])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Hello world")
	})

	it("applies a replayed delta only once, even non-consecutively", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " !" },
			{ type: "messageDelta", id: "msg-1", seq: 2, text: " world" },
			{ type: "messageDelta", id: "msg-1", seq: 1, text: "Hello" },
		])
		expect(state.messages[0].text).toBe("Hello world !")
	})

	it("keeps two consecutive chunks with identical text", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " again" },
			{ type: "messageDelta", id: "msg-1", seq: 4, text: " again" },
		])
		expect(state.messages[0].text).toBe("Hello world again again")
	})

	it("drops deltas for unknown or completed messages", () => {
		const completed = applyEvents(initialChatState, [
			...streamedTurn,
			{
				type: "messageCompleted",
				message: assistantMessage({
					text: "Hello world",
					completion: "complete",
				}),
			},
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " late" },
			{ type: "messageDelta", id: "msg-unknown", seq: 4, text: "ghost" },
		])
		expect(completed.messages).toHaveLength(1)
		expect(completed.messages[0].text).toBe("Hello world")
	})

	it("preserves streamed text when messageCompleted arrives empty", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{
				type: "messageCompleted",
				message: assistantMessage({
					text: "",
					completion: "cancelled",
					timestamp: 42,
				}),
			},
		])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Hello world")
		expect(state.messages[0].completion).toBe("cancelled")
		expect(state.messages[0].timestamp).toBe(42)
	})

	it("keeps messageCompleted idempotent when replayed", () => {
		const done: ClaudeEvent = {
			type: "messageCompleted",
			message: assistantMessage({
				text: "Hello world",
				completion: "complete",
			}),
		}
		const state = applyEvents(initialChatState, [...streamedTurn, done, done])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Hello world")
	})

	it("keeps turnEnded idempotent and finalizes streaming messages", () => {
		const ended: ClaudeEvent = {
			type: "turnEnded",
			ended: { sessionId: "s-1", outcome: "cancelled" },
		}
		const state = applyEvents(initialChatState, [...streamedTurn, ended, ended])
		expect(state.turn).toBe("idle")
		expect(state.sessionId).toBe("s-1")
		expect(state.messages[0].completion).toBe("cancelled")
	})

	it("rejects illegal turn transitions from stale events", () => {
		const ended = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "turnEnded", ended: { sessionId: "s-1", outcome: "completed" } },
		])
		const stale = applyEvents(ended, [
			{ type: "turnChanged", state: "running" },
		])
		expect(stale.turn).toBe("idle")
	})

	it("drops events from a stale epoch", () => {
		const reset = chatReducer(initialChatState, {
			type: "sessionReset",
			epoch: 2,
		})
		const stale = chatReducer(reset, {
			type: "driverEvent",
			epoch: 1,
			event: { type: "messageStarted", message: assistantMessage() },
		})
		expect(stale).toBe(reset)
		expect(stale.messages).toHaveLength(0)
	})

	it("never regresses an activity status", () => {
		const state = applyEvents(initialChatState, [
			{
				type: "activity",
				activity: {
					id: "act-1",
					title: "Lecture",
					kind: "tool",
					status: "succeeded",
				},
			},
			{
				type: "activity",
				activity: {
					id: "act-1",
					title: "Lecture",
					kind: "tool",
					status: "running",
				},
			},
		])
		expect(state.activities).toHaveLength(1)
		expect(state.activities[0].status).toBe("succeeded")
	})

	it("only accepts permission requests while a turn is active", () => {
		const request: ClaudeEvent = {
			type: "permissionRequested",
			request: {
				id: "perm-1",
				toolName: "Bash",
				title: "Run",
				detail: null,
			},
		}
		expect(applyEvents(initialChatState, [request]).permission).toBeNull()
		const active = applyEvents(initialChatState, [
			{ type: "turnChanged", state: "submitting" },
			request,
		])
		expect(active.permission?.id).toBe("perm-1")
	})

	it("clears a pending permission when the turn ends", () => {
		const state = applyEvents(initialChatState, [
			{ type: "turnChanged", state: "submitting" },
			{
				type: "permissionRequested",
				request: {
					id: "perm-1",
					toolName: "Bash",
					title: "Run",
					detail: null,
				},
			},
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		expect(state.permission).toBeNull()
	})

	it("marks the optimistic message failed when the prompt is rejected", () => {
		const message: ChatMessage = {
			id: "local-1",
			role: "user",
			text: "salut",
			completion: "complete",
			timestamp: 0,
		}
		const submitted = chatReducer(initialChatState, {
			type: "promptSubmitted",
			message,
		})
		expect(submitted.turn).toBe("submitting")
		const rejected = chatReducer(submitted, {
			type: "promptRejected",
			id: "local-1",
			error: { kind: "notStarted" },
		})
		expect(rejected.turn).toBe("failed")
		expect(rejected.messages[0].completion).toBe("failed")
		expect(rejected.errors).toHaveLength(1)
		const retried = chatReducer(rejected, {
			type: "promptRetried",
			id: "local-1",
		})
		expect(retried.turn).toBe("submitting")
		expect(retried.messages[0].completion).toBe("complete")
	})

	it("keeps connection and version across a session reset", () => {
		const ready = applyEvents(initialChatState, [
			{ type: "connectionChanged", state: "ready" },
		])
		const versioned = chatReducer(ready, {
			type: "binaryVersion",
			version: "1.2.3",
		})
		const reset = chatReducer(versioned, { type: "sessionReset", epoch: 1 })
		expect(reset.connection).toBe("ready")
		expect(reset.binaryVersion).toBe("1.2.3")
		expect(reset.epoch).toBe(1)
	})
})

describe("turn predicates", () => {
	it("treats every in-flight turn as busy, but only an un-stopped one as stoppable", () => {
		expect(isTurnBusy("submitting")).toBe(true)
		expect(isTurnBusy("running")).toBe(true)
		expect(isTurnBusy("stopping")).toBe(true)
		expect(isTurnBusy("idle")).toBe(false)
		expect(isTurnBusy("failed")).toBe(false)

		expect(canStopTurn("submitting")).toBe(true)
		expect(canStopTurn("running")).toBe(true)
		expect(canStopTurn("stopping")).toBe(false)
		expect(canStopTurn("idle")).toBe(false)
	})

	it("opens the composer on the live session, never on the id Claude reports later", () => {
		expect(isSessionReady(initialChatState)).toBe(false)
		expect(isSessionReady({ ...initialChatState, connection: "ready" })).toBe(
			false,
		)
		expect(
			isSessionReady({
				...initialChatState,
				connection: "crashed",
				sessionOpen: true,
			}),
		).toBe(false)
		// `sessionReady` only lands once a turn starts, so an id alone must not gate the composer.
		expect(
			isSessionReady({
				...initialChatState,
				connection: "ready",
				sessionId: "s-1",
			}),
		).toBe(false)
		expect(
			isSessionReady({
				...initialChatState,
				connection: "ready",
				sessionOpen: true,
			}),
		).toBe(true)
	})

	it("clears the open session on reset and reopens on sessionOpened", () => {
		const ready: ChatState = { ...initialChatState, connection: "ready" }
		const open = chatReducer(ready, { type: "sessionOpened" })
		expect(isSessionReady(open)).toBe(true)
		const reset = chatReducer(open, { type: "sessionReset", epoch: 1 })
		expect(reset.sessionOpen).toBe(false)
		expect(isSessionReady(reset)).toBe(false)
	})
})

describe("permission resolution", () => {
	const pending: ClaudeEvent[] = [
		{ type: "turnChanged", state: "submitting" },
		{
			type: "activity",
			activity: {
				id: "perm-1",
				title: "Bash · echo",
				kind: "permission",
				status: "pending",
			},
		},
		{
			type: "permissionRequested",
			request: {
				id: "perm-1",
				toolName: "Bash",
				title: "Bash · echo",
				detail: "echo",
			},
		},
	]

	it("settles the activity as soon as the tool is allowed", () => {
		const state = applyEvents(initialChatState, [
			...pending,
			{ type: "permissionResolved", id: "perm-1", decision: "allowOnce" },
		])
		expect(state.permission).toBeNull()
		expect(state.activities).toHaveLength(1)
		expect(state.activities[0].status).toBe("succeeded")
	})

	it("settles the activity as soon as the tool is denied", () => {
		const state = applyEvents(initialChatState, [
			...pending,
			{ type: "permissionResolved", id: "perm-1", decision: "deny" },
		])
		expect(state.permission).toBeNull()
		expect(state.activities[0].status).toBe("failed")
	})

	it("never regresses an activity the transport already settled", () => {
		const state = applyEvents(initialChatState, [
			...pending,
			{
				type: "activity",
				activity: {
					id: "perm-1",
					title: "Bash · echo",
					kind: "permission",
					status: "succeeded",
				},
			},
			{ type: "permissionResolved", id: "perm-1", decision: "deny" },
		])
		expect(state.activities[0].status).toBe("succeeded")
	})
})

describe("session reset", () => {
	const conversation: ClaudeEvent[] = [
		{ type: "turnChanged", state: "submitting" },
		{ type: "turnChanged", state: "running" },
		{
			type: "activity",
			activity: {
				id: "act-1",
				title: "Lecture",
				kind: "tool",
				status: "succeeded",
			},
		},
		{
			type: "messageCompleted",
			message: assistantMessage({ text: "Hello", completion: "complete" }),
		},
		{ type: "turnEnded", ended: { sessionId: "s-1", outcome: "completed" } },
	]

	it("keeps the transcript and clears only what the dead session owned", () => {
		const live = applyEvents(
			{ ...initialChatState, connection: "ready" },
			conversation,
		)
		const open = chatReducer(live, { type: "sessionOpened" })
		const reset = chatReducer(open, { type: "sessionReset", epoch: 1 })

		expect(reset.messages).toEqual(open.messages)
		expect(reset.activities).toEqual(open.activities)
		expect(reset.sessionOpen).toBe(false)
		expect(reset.sessionId).toBeNull()
		expect(reset.permission).toBeNull()
		expect(reset.turn).toBe("idle")
		expect(reset.epoch).toBe(1)
	})

	it("settles a message left mid-stream by the session that died", () => {
		const streaming = applyEvents(initialChatState, streamedTurn)
		const reset = chatReducer(streaming, { type: "sessionReset", epoch: 1 })

		expect(reset.messages[0].text).toBe("Hello world")
		expect(reset.messages[0].completion).toBe("failed")
	})

	it("drops the transcript only on an explicit clear", () => {
		const live = applyEvents(
			{ ...initialChatState, connection: "ready" },
			conversation,
		)
		const open = chatReducer(live, { type: "sessionOpened" })
		const cleared = chatReducer(open, { type: "conversationCleared" })

		expect(cleared.messages).toHaveLength(0)
		expect(cleared.activities).toHaveLength(0)
		expect(cleared.sessionOpen).toBe(true)
		expect(cleared.sessionId).toBe("s-1")
	})
})
