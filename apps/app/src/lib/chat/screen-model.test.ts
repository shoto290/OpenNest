import { describe, expect, it } from "vitest"

import { type ChatState, initialChatState } from "./chat-state"
import {
	activityStatusFor,
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	toActivityItems,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "./screen-model"

import type { ActivityEvent, ChatMessage } from "../claude/contract"

function activity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
	return {
		id: "act-1",
		title: "Bash · npm test",
		kind: "tool",
		status: "running",
		...overrides,
	}
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: "msg-1",
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 0,
		...overrides,
	}
}

function chatState(overrides: Partial<ChatState> = {}): ChatState {
	return { ...initialChatState, turn: "running", ...overrides }
}

describe("toActivityItems", () => {
	it("keeps identity and maps transport status onto step status", () => {
		const items = toActivityItems([
			activity({ id: "a", status: "pending" }),
			activity({ id: "b", status: "running" }),
			activity({ id: "c", status: "succeeded" }),
			activity({ id: "d", status: "failed" }),
		])

		expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"])
		expect(items.map((item) => item.status)).toEqual([
			"pending",
			"active",
			"complete",
			"complete",
		])
		expect(items[3].meta).toBe("Failed")
		expect(items[2].meta).toBeUndefined()
	})

	it("falls back to the activity kind when the title is empty", () => {
		expect(toActivityItems([activity({ title: "" })])[0].label).toBe("tool")
	})
})

describe("toTranscriptRows", () => {
	it("publishes a paragraph only once a blank line has closed it", () => {
		const rows = toTranscriptRows([
			message({ text: "First paragraph.\n\nSecond one, still bei" }),
		])

		expect(rows.map((row) => row.text)).toEqual(["First paragraph."])
		expect(rows[0].completion).toBe("complete")
		expect(rows[0].copyText).toBeUndefined()
	})

	it("hands back the same rows for a message that has not moved", () => {
		const settled = message({ id: "a", text: "One.", completion: "complete" })
		const live = message({ id: "b", text: "Two.\n\n" })

		const first = toTranscriptRows([settled, live])
		const second = toTranscriptRows([settled, { ...live, text: "Two.\n\nThr" }])

		// The row the reader is already looking at must keep its identity, or the
		// memoised transcript re-renders every row on every delta.
		expect(second[0]).toBe(first[0])
	})

	it("releases the trailing paragraph when the turn ends", () => {
		const rows = toTranscriptRows([
			message({ text: "One.\n\nTwo.", completion: "complete" }),
		])

		expect(rows.map((row) => row.text)).toEqual(["One.", "Two."])
		expect(rows.map((row) => row.id)).toEqual(["msg-1#0", "msg-1#1"])
		expect(rows[1].copyText).toBe("One.\n\nTwo.")
	})

	it("carries how the turn ended on its closing row alone", () => {
		const rows = toTranscriptRows([
			message({
				text: "Half an answer.\n\nStopped here.",
				completion: "cancelled",
			}),
		])

		expect(rows.map((row) => row.completion)).toEqual(["complete", "cancelled"])
		expect(rows[1].copyText).toBe("Half an answer.\n\nStopped here.")
	})

	it("keeps a row for a turn that ended before writing anything", () => {
		expect(toTranscriptRows([message({ completion: "failed" })])).toHaveLength(
			1,
		)
		expect(
			toTranscriptRows([message({ completion: "complete" })]),
		).toHaveLength(0)
		expect(toTranscriptRows([message()])).toHaveLength(0)
	})

	it("never splits the reader's own prompt", () => {
		const rows = toTranscriptRows([
			message({
				id: "local-1",
				role: "user",
				text: "One.\n\nTwo.",
				completion: "complete",
			}),
		])

		expect(rows).toHaveLength(1)
		expect(rows[0].text).toBe("One.\n\nTwo.")
	})
})

describe("toRuns", () => {
	it("gathers consecutive rows from the same speaker", () => {
		const runs = toRuns(
			toTranscriptRows([
				message({ id: "a", text: "One.\n\nTwo.", completion: "complete" }),
				message({
					id: "local-1",
					role: "user",
					text: "And?",
					completion: "complete",
				}),
				message({ id: "b", text: "Three.", completion: "complete" }),
				message({ id: "c", text: "Four.", completion: "complete" }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2, 1, 2])
		expect(runs.map((run) => run[0].role)).toEqual([
			"assistant",
			"user",
			"assistant",
		])
	})

	it("keeps an empty transcript empty", () => {
		expect(toRuns([])).toEqual([])
	})
})

describe("workingStateFor", () => {
	it("says nothing once the turn is over", () => {
		expect(workingStateFor(chatState({ turn: "idle" }))).toBeNull()
	})

	it("reads the kind of work off the newest unfinished step", () => {
		const state = chatState({
			activities: [
				activity({ id: "a", title: "Bash · npm test", status: "succeeded" }),
				activity({ id: "b", title: "Grep · driver", status: "running" }),
			],
		})

		expect(workingStateFor(state)).toEqual({
			kind: "searching",
			label: "Grep · driver",
		})
	})

	it("separates writing tools from the rest", () => {
		const running = (title: string) =>
			workingStateFor(chatState({ activities: [activity({ title })] }))?.kind

		expect(running("Write · chat-turn.tsx")).toBe("writing")
		expect(running("Bash · npm test")).toBe("working")
	})

	it("waits on the reader before anything else", () => {
		const state = chatState({
			activities: [activity()],
			permission: {
				id: "req-1",
				toolName: "Bash",
				title: "Run npm test",
				detail: null,
			},
		})

		expect(workingStateFor(state)).toEqual({
			kind: "waiting",
			label: "Run npm test",
		})
	})

	it("thinks until the first token, then writes", () => {
		expect(workingStateFor(chatState())?.kind).toBe("thinking")
		expect(
			workingStateFor(chatState({ messages: [message({ text: "Well" })] }))
				?.kind,
		).toBe("writing")
	})
})

describe("activityStatusFor", () => {
	it("follows the latest turn, not the whole session log", () => {
		expect(activityStatusFor("running")).toBe("working")
		expect(activityStatusFor("stopping")).toBe("working")
		expect(activityStatusFor("failed")).toBe("failed")
		expect(activityStatusFor("idle")).toBe("complete")
	})
})

describe("emptyStateStatusFor", () => {
	it("says nothing while the preflight is still running", () => {
		expect(emptyStateStatusFor("checking")).toBeNull()
		expect(emptyStateStatusFor("ready")).toBe("ready")
		expect(emptyStateStatusFor("unavailable")).toBe("unavailable")
		expect(emptyStateStatusFor("crashed")).toBe("unavailable")
	})
})

describe("notices", () => {
	it("separates errors that killed the session from the rest", () => {
		expect(needsFreshSession({ kind: "crashed", code: 1, detail: null })).toBe(
			true,
		)
		expect(needsFreshSession({ kind: "turnAlreadyRunning" })).toBe(false)

		expect(noticeTitleFor({ kind: "crashed", code: null, detail: null })).toBe(
			"Claude Code stopped",
		)
		expect(noticeTitleFor({ kind: "binaryNotFound", searched: [] })).toBe(
			"Claude Code is unavailable",
		)
		expect(noticeTitleFor({ kind: "noActiveTurn" })).toBe(
			"That request did not go through",
		)
	})
})
