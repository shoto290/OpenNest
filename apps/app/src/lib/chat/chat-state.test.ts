import { describe, expect, it } from "vitest"

import {
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isSameRuntimeScope,
	isSessionReady,
	isTurnBusy,
} from "./chat-state"

import type { AgentEvent, ChatMessage, RuntimeScope } from "../agent/contract"
import {
	CONVERSATION,
	message,
	named,
} from "../conversations/transcript-fixtures"

/** One participant's lineage, a run at a time: the number and the row change
 * together, the way a restart takes the next one. */
function run(epoch: number): RuntimeScope {
	return {
		conversationId: CONVERSATION,
		botId: "default",
		runtimeSessionId: `r${epoch}`,
		epoch,
	}
}

function applyEvents(state: ChatState, events: AgentEvent[]): ChatState {
	return events.reduce(
		(current, event) =>
			chatReducer(current, {
				type: "driverEvent",
				scope: current.runtime,
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

const streamedTurn: AgentEvent[] = [
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
			runtime: run(1),
			sessionId: null,
		})

		expect(reset.messages).toBe(mirrored.messages)
		expect(reset.hasOlder).toBe(true)
		expect(reset.conversationId).toBe(CONVERSATION)
	})

	it("holds the commands a session announced past the session that named them", () => {
		const listed = applyEvents(opened, [
			{ type: "commandsListed", commands: named("review", "compact") },
		])

		expect(listed.commands).toEqual(named("review", "compact"))

		const reset = chatReducer(listed, {
			type: "sessionReset",
			runtime: run(1),
			sessionId: null,
		})

		expect(reset.commands).toEqual(named("review", "compact"))
	})

	it("replaces what it holds with what the next session named", () => {
		const recalled = chatReducer(opened, {
			type: "commandsRecalled",
			commands: named("review", "compact"),
		})

		expect(recalled.commands).toEqual(named("review", "compact"))

		const listed = applyEvents(recalled, [
			{ type: "commandsListed", commands: named("status") },
		])

		expect(listed.commands).toEqual(named("status"))
	})

	it("stands still when what arrives is what it already holds", () => {
		const recalled = chatReducer(opened, {
			type: "commandsRecalled",
			commands: named("review", "compact"),
		})

		const again = chatReducer(recalled, {
			type: "commandsRecalled",
			commands: named("review", "compact"),
		})
		const announced = applyEvents(recalled, [
			{ type: "commandsListed", commands: named("review", "compact") },
		])

		expect(again).toBe(recalled)
		expect(announced).toBe(recalled)
	})

	it("keeps turnEnded idempotent", () => {
		const ended: AgentEvent = {
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

	// A replaced run is still alive for as long as its child takes to die, and it
	// keeps reporting. None of it may move the screen — not the run before this
	// one, not another bot's, not one carrying this row's id under another number.
	it("drops every event from a run this state is not about", () => {
		const reset = chatReducer(initialChatState, {
			type: "sessionReset",
			runtime: run(2),
			sessionId: null,
		})

		for (const scope of [
			run(1),
			null,
			{ ...run(2), epoch: 3 },
			{ ...run(2), botId: "other" },
			{ ...run(2), conversationId: "another" },
		]) {
			expect(
				chatReducer(reset, {
					type: "driverEvent",
					scope,
					event: { type: "turnChanged", state: "running" },
				}),
			).toBe(reset)
		}

		expect(
			chatReducer(reset, {
				type: "driverEvent",
				scope: run(2),
				event: { type: "turnChanged", state: "submitting" },
			}).turn,
		).toBe("submitting")
	})

	// The check a launch makes before it has opened a run: it names none, the host
	// echoes none, and the reader must still be told what the install answered.
	it("takes an unscoped event while it holds no run of its own", () => {
		const checked = chatReducer(initialChatState, {
			type: "driverEvent",
			scope: null,
			event: { type: "connectionChanged", state: "ready" },
		})

		expect(checked.connection).toBe("ready")
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
		const request: AgentEvent = {
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

	it("stores a question beside the permission, and keeps the first one asked", () => {
		const asked = (id: string): AgentEvent => ({
			type: "questionRequested",
			request: {
				id,
				questions: [
					{
						header: "Framework",
						question: "Which one?",
						multiSelect: false,
						options: [{ label: "React", description: null, preview: null }],
					},
				],
			},
		})
		expect(applyEvents(initialChatState, [asked("ask-1")]).question).toBeNull()

		const state = applyEvents(initialChatState, [
			{ type: "turnChanged", state: "submitting" },
			asked("ask-1"),
			asked("ask-2"),
		])
		expect(state.question?.id).toBe("ask-1")
		expect(state.permission).toBeNull()
	})

	it("clears a stored question when the turn ends", () => {
		const state = applyEvents(initialChatState, [
			{ type: "turnChanged", state: "submitting" },
			{
				type: "questionRequested",
				request: { id: "ask-1", questions: [] },
			},
			{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
		])

		expect(state.question).toBeNull()
	})

	it("clears a stored question once its request is resolved", () => {
		const state = applyEvents(initialChatState, [
			{ type: "turnChanged", state: "submitting" },
			{
				type: "questionRequested",
				request: { id: "ask-1", questions: [] },
			},
			{ type: "permissionResolved", id: "ask-1", decision: "allowOnce" },
		])

		expect(state.question).toBeNull()
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
			runtime: run(1),
			sessionId: null,
		})

		expect(reset.connection).toBe("ready")
		expect(reset.binaryVersion).toBe("1.2.3")
		expect(reset.runtime).toEqual(run(1))
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

describe("runtime scope", () => {
	it("is the same run only when every field of it agrees", () => {
		expect(isSameRuntimeScope(run(1), { ...run(1) })).toBe(true)
		expect(isSameRuntimeScope(null, null)).toBe(true)
		expect(isSameRuntimeScope(run(1), null)).toBe(false)
		expect(isSameRuntimeScope(null, run(1))).toBe(false)
		expect(isSameRuntimeScope(run(1), run(2))).toBe(false)
		// The id alone is not which run this is: the same row named under another
		// number, another bot or another conversation is somebody else's.
		expect(isSameRuntimeScope(run(1), { ...run(1), epoch: 2 })).toBe(false)
		expect(isSameRuntimeScope(run(1), { ...run(1), botId: "other" })).toBe(
			false,
		)
		expect(
			isSameRuntimeScope(run(1), { ...run(1), conversationId: "another" }),
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
			runtime: run(1),
			sessionId: null,
		})
		expect(reset.sessionOpen).toBe(false)
		expect(isSessionReady(reset)).toBe(false)
	})
})

describe("permission resolution", () => {
	const pending: AgentEvent[] = [
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
	const conversation: AgentEvent[] = [
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
			runtime: run(1),
			sessionId: null,
		})

		expect(reset.activities).toEqual([])
		expect(reset.sessionOpen).toBe(false)
		expect(reset.sessionId).toBeNull()
		expect(reset.permission).toBeNull()
		expect(reset.turn).toBe("idle")
		expect(reset.runtime).toEqual(run(1))
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
			runtime: run(1),
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
			runtime: run(1),
			sessionId: "s-1",
		})

		expect(reset.sessionId).toBe("s-1")
	})
})

describe("the outbox a prompt waits in", () => {
	const held = (state: ChatState, id: string, text: string): ChatState =>
		chatReducer(state, {
			type: "promptHeld",
			entry: { id, text, repliedToMessageId: null },
		})

	const queued = (state: ChatState) => state.outbox.map((entry) => entry.text)

	const three = held(held(held(opened, "a", "one"), "b", "two"), "c", "three")

	it("holds what was sent in the order it was sent", () => {
		expect(queued(three)).toEqual(["one", "two", "three"])
		expect(three.outbox[0]).toMatchObject({ id: "a", text: "one" })
	})

	it("drops the entry named and keeps the order of the rest", () => {
		const without = chatReducer(three, {
			type: "outboxEntryRemoved",
			id: "b",
		})

		expect(queued(without)).toEqual(["one", "three"])
		expect(chatReducer(without, { type: "outboxEntryRemoved", id: "b" })).toBe(
			without,
		)
	})

	// A prompt taken for submission that was never written down is still one nobody
	// has seen. It goes back to the front, ahead of what was sent after it.
	it("returns an entry nothing was written for to the front", () => {
		const taken = chatReducer(three, { type: "outboxEntryRemoved", id: "a" })
		const returned = chatReducer(taken, {
			type: "promptReturned",
			entry: { id: "a", text: "one", repliedToMessageId: null },
		})

		expect(queued(returned)).toEqual(["one", "two", "three"])
	})

	// A stop puts every held prompt on the record. None of them is waiting to be
	// sent afterwards, so the line the reader was in is empty rather than paused.
	it("empties whole when a stop takes what it was holding", () => {
		const cleared = chatReducer(three, { type: "outboxCleared" })

		expect(cleared.outbox).toEqual([])
		expect(chatReducer(cleared, { type: "outboxCleared" })).toBe(cleared)
	})

	// The session going away is exactly why a prompt is waiting. Losing the line on
	// the restart that was going to send it would be the one moment it must not.
	it("survives the session it was waiting for being reset", () => {
		const reset = chatReducer(three, {
			type: "sessionReset",
			runtime: run(1),
			sessionId: null,
		})

		expect(queued(reset)).toEqual(["one", "two", "three"])
	})
})
