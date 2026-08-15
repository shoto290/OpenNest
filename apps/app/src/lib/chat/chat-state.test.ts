import { describe, expect, it } from "vitest"

import type { ChatMessage, ClaudeEvent } from "../claude/contract"
import { type ChatState, chatReducer, initialChatState } from "./chat-state"

function applyEvents(state: ChatState, events: ClaudeEvent[]): ChatState {
	return events.reduce(
		(current, event) => chatReducer(current, { type: "driverEvent", epoch: current.epoch, event }),
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
	{ type: "messageDelta", id: "msg-1", seq: 1, text: "Bonjour" },
	{ type: "messageDelta", id: "msg-1", seq: 2, text: " le monde" },
]

describe("chatReducer", () => {
	it("assembles a streamed assistant message", () => {
		const state = applyEvents(initialChatState, streamedTurn)
		expect(state.turn).toBe("running")
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Bonjour le monde")
	})

	it("ignores a replayed messageStarted without resetting text", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageStarted", message: assistantMessage() },
		])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Bonjour le monde")
	})

	it("applies a replayed delta only once, even non-consecutively", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " !" },
			{ type: "messageDelta", id: "msg-1", seq: 2, text: " le monde" },
			{ type: "messageDelta", id: "msg-1", seq: 1, text: "Bonjour" },
		])
		expect(state.messages[0].text).toBe("Bonjour le monde !")
	})

	it("keeps two consecutive chunks with identical text", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " encore" },
			{ type: "messageDelta", id: "msg-1", seq: 4, text: " encore" },
		])
		expect(state.messages[0].text).toBe("Bonjour le monde encore encore")
	})

	it("drops deltas for unknown or completed messages", () => {
		const completed = applyEvents(initialChatState, [
			...streamedTurn,
			{
				type: "messageCompleted",
				message: assistantMessage({ text: "Bonjour le monde", completion: "complete" }),
			},
			{ type: "messageDelta", id: "msg-1", seq: 3, text: " en retard" },
			{ type: "messageDelta", id: "msg-inconnu", seq: 4, text: "fantôme" },
		])
		expect(completed.messages).toHaveLength(1)
		expect(completed.messages[0].text).toBe("Bonjour le monde")
	})

	it("preserves streamed text when messageCompleted arrives empty", () => {
		const state = applyEvents(initialChatState, [
			...streamedTurn,
			{
				type: "messageCompleted",
				message: assistantMessage({ text: "", completion: "cancelled", timestamp: 42 }),
			},
		])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Bonjour le monde")
		expect(state.messages[0].completion).toBe("cancelled")
		expect(state.messages[0].timestamp).toBe(42)
	})

	it("keeps messageCompleted idempotent when replayed", () => {
		const done: ClaudeEvent = {
			type: "messageCompleted",
			message: assistantMessage({ text: "Bonjour le monde", completion: "complete" }),
		}
		const state = applyEvents(initialChatState, [...streamedTurn, done, done])
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].text).toBe("Bonjour le monde")
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
		const stale = applyEvents(ended, [{ type: "turnChanged", state: "running" }])
		expect(stale.turn).toBe("idle")
	})

	it("drops events from a stale epoch", () => {
		const reset = chatReducer(initialChatState, { type: "sessionReset", epoch: 2 })
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
			{ type: "activity", activity: { id: "act-1", title: "Lecture", kind: "tool", status: "succeeded" } },
			{ type: "activity", activity: { id: "act-1", title: "Lecture", kind: "tool", status: "running" } },
		])
		expect(state.activities).toHaveLength(1)
		expect(state.activities[0].status).toBe("succeeded")
	})

	it("only accepts permission requests while a turn is active", () => {
		const request: ClaudeEvent = {
			type: "permissionRequested",
			request: { id: "perm-1", toolName: "Bash", title: "Exécuter", detail: null },
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
				request: { id: "perm-1", toolName: "Bash", title: "Exécuter", detail: null },
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
		const submitted = chatReducer(initialChatState, { type: "promptSubmitted", message })
		expect(submitted.turn).toBe("submitting")
		const rejected = chatReducer(submitted, {
			type: "promptRejected",
			id: "local-1",
			error: { kind: "notStarted" },
		})
		expect(rejected.turn).toBe("failed")
		expect(rejected.messages[0].completion).toBe("failed")
		expect(rejected.errors).toHaveLength(1)
		const retried = chatReducer(rejected, { type: "promptRetried", id: "local-1" })
		expect(retried.turn).toBe("submitting")
		expect(retried.messages[0].completion).toBe("complete")
	})

	it("keeps connection and version across a session reset", () => {
		const ready = applyEvents(initialChatState, [
			{ type: "connectionChanged", state: "ready" },
		])
		const versioned = chatReducer(ready, { type: "binaryVersion", version: "1.2.3" })
		const reset = chatReducer(versioned, { type: "sessionReset", epoch: 1 })
		expect(reset.connection).toBe("ready")
		expect(reset.binaryVersion).toBe("1.2.3")
		expect(reset.epoch).toBe(1)
	})
})
