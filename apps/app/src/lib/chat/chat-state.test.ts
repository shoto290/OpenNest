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
import { CONVERSATION, message } from "../conversations/transcript-fixtures"

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

const opened: ChatState = chatReducer(initialChatState, {
	type: "conversationOpened",
	conversationId: CONVERSATION,
})

describe("chatReducer", () => {
	// What was said belongs to the transcript, which is read back from the store.
	// A reducer that also held it would be a second answer to the same question.
	it("leaves every message event to the durable transcript", () => {
		const state = applyEvents(opened, [
			...streamedTurn,
			{
				type: "messageCompleted",
				message: assistantMessage({
					text: "Hello world",
					completion: "complete",
				}),
			},
		])

		expect(state.turn).toBe("running")
		expect(state.messages).toEqual([])
	})

	it("mirrors the transcript it is handed, and settles for the same selection", () => {
		const messages = [message({ id: "m-1", content: "Hello" })]
		const mirrored = chatReducer(opened, {
			type: "transcriptChanged",
			messages,
			hasOlder: true,
		})

		expect(mirrored.messages).toBe(messages)
		expect(mirrored.hasOlder).toBe(true)
		expect(
			chatReducer(mirrored, {
				type: "transcriptChanged",
				messages,
				hasOlder: true,
			}),
		).toBe(mirrored)
	})

	it("keeps the mirrored transcript across a session reset", () => {
		const mirrored = chatReducer(opened, {
			type: "transcriptChanged",
			messages: [message({ id: "m-1" })],
			hasOlder: true,
		})
		const reset = chatReducer(mirrored, {
			type: "sessionReset",
			epoch: 1,
			sessionId: null,
		})

		expect(reset.messages).toBe(mirrored.messages)
		expect(reset.hasOlder).toBe(true)
		expect(reset.conversationId).toBe(CONVERSATION)
	})

	it("keeps turnEnded idempotent", () => {
		const ended: ClaudeEvent = {
			type: "turnEnded",
			ended: { sessionId: "s-1", outcome: "cancelled" },
		}
		const state = applyEvents(opened, [...streamedTurn, ended, ended])

		expect(state.turn).toBe("idle")
		expect(state.sessionId).toBe("s-1")
	})

	it("rejects illegal turn transitions from stale events", () => {
		const ended = applyEvents(opened, [
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
			sessionId: null,
		})
		const stale = chatReducer(reset, {
			type: "driverEvent",
			epoch: 1,
			event: { type: "turnChanged", state: "running" },
		})

		expect(stale).toBe(reset)
	})

	it("never regresses an activity status", () => {
		const state = applyEvents(initialChatState, [
			{
				type: "activity",
				activity: {
					id: "act-1",
					title: "Read",
					kind: "tool",
					status: "succeeded",
				},
			},
			{
				type: "activity",
				activity: {
					id: "act-1",
					title: "Read",
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
			request: { id: "perm-1", toolName: "Bash", title: "Run", detail: null },
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
				request: { id: "perm-1", toolName: "Bash", title: "Run", detail: null },
			},
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])

		expect(state.permission).toBeNull()
	})

	// The stored prompt is whole whatever Claude did with it, so the refusal is
	// held here and never written onto the row.
	it("marks the refused prompt on the screen alone, and clears it on retry", () => {
		const submitted = chatReducer(opened, { type: "promptSubmitted" })
		expect(submitted.turn).toBe("submitting")

		const rejected = chatReducer(submitted, {
			type: "promptRejected",
			id: "m-1",
			error: { kind: "notStarted" },
		})
		expect(rejected.turn).toBe("failed")
		expect(rejected.rejectedPromptId).toBe("m-1")
		expect(rejected.errors).toHaveLength(1)

		const retried = chatReducer(rejected, { type: "promptRetried", id: "m-1" })
		expect(retried.turn).toBe("submitting")
		expect(retried.rejectedPromptId).toBeNull()
	})

	it("ignores a retry of a prompt that was never refused", () => {
		const rejected = chatReducer(
			chatReducer(opened, { type: "promptSubmitted" }),
			{ type: "promptRejected", id: "m-1", error: { kind: "notStarted" } },
		)

		expect(chatReducer(rejected, { type: "promptRetried", id: "m-2" })).toBe(
			rejected,
		)
	})

	// A prompt the store refused has no row to point at, so nothing is marked.
	it("fails the turn without a row when the store refused the prompt", () => {
		const rejected = chatReducer(
			chatReducer(opened, { type: "promptSubmitted" }),
			{
				type: "promptRejected",
				id: null,
				error: { kind: "writeFailed", detail: "the store refused it" },
			},
		)

		expect(rejected.turn).toBe("failed")
		expect(rejected.rejectedPromptId).toBeNull()
		expect(rejected.errors.at(-1)?.error.kind).toBe("writeFailed")
	})

	it("keeps connection and version across a session reset", () => {
		const ready = applyEvents(initialChatState, [
			{ type: "connectionChanged", state: "ready" },
		])
		const versioned = chatReducer(ready, {
			type: "binaryVersion",
			version: "1.2.3",
		})
		const reset = chatReducer(versioned, {
			type: "sessionReset",
			epoch: 1,
			sessionId: null,
		})

		expect(reset.connection).toBe("ready")
		expect(reset.binaryVersion).toBe("1.2.3")
		expect(reset.epoch).toBe(1)
	})

	it("tracks the page in flight above the transcript", () => {
		const loading = chatReducer(opened, { type: "olderLoading", loading: true })

		expect(loading.loadingOlder).toBe(true)
		expect(chatReducer(loading, { type: "olderLoading", loading: true })).toBe(
			loading,
		)
		expect(
			chatReducer(loading, { type: "olderLoading", loading: false })
				.loadingOlder,
		).toBe(false)
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

		const reset = chatReducer(open, {
			type: "sessionReset",
			epoch: 1,
			sessionId: null,
		})
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
				title: "Read",
				kind: "tool",
				status: "succeeded",
			},
		},
		{ type: "turnEnded", ended: { sessionId: "s-1", outcome: "completed" } },
	]

	it("clears everything the dead session owned, steps included", () => {
		const live = applyEvents(
			{ ...initialChatState, connection: "ready" },
			conversation,
		)
		const open = chatReducer(live, { type: "sessionOpened" })
		expect(open.activities).toHaveLength(1)

		const reset = chatReducer(open, {
			type: "sessionReset",
			epoch: 1,
			sessionId: null,
		})

		expect(reset.activities).toEqual([])
		expect(reset.sessionOpen).toBe(false)
		expect(reset.sessionId).toBeNull()
		expect(reset.permission).toBeNull()
		expect(reset.turn).toBe("idle")
		expect(reset.epoch).toBe(1)
	})

	// A step is something a running provider was doing. Carrying a pending one
	// across the restart leaves the screen reporting work with nothing behind it,
	// and a cold launch — which reads no step at all — would disagree.
	it("leaves no step running once the provider that was running it is gone", () => {
		const working = applyEvents({ ...initialChatState, connection: "ready" }, [
			{ type: "turnChanged", state: "submitting" },
			{ type: "turnChanged", state: "running" },
			{
				type: "activity",
				activity: {
					id: "act-1",
					title: "Bash · npm test",
					kind: "tool",
					status: "running",
				},
			},
			{
				type: "activity",
				activity: {
					id: "perm-1",
					title: "Run a command",
					kind: "permission",
					status: "pending",
				},
			},
		])
		expect(working.activities).toHaveLength(2)

		const reset = chatReducer(working, {
			type: "sessionReset",
			epoch: 1,
			sessionId: "s-1",
		})

		expect(reset.activities).toEqual([])
		expect(reset.turn).toBe("idle")
	})

	// The child re-announces its id only on the first prompt of the new session,
	// so a reset that drops the id leaves the app unable to name what it resumed.
	it("carries the resumed id through the reset that opens it", () => {
		const live = applyEvents(
			{ ...initialChatState, connection: "ready" },
			conversation,
		)
		const reset = chatReducer(live, {
			type: "sessionReset",
			epoch: 1,
			sessionId: "s-1",
		})

		expect(reset.sessionId).toBe("s-1")
	})
})
