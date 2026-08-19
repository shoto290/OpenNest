import { describe, expect, it } from "vitest"

import { type ChatState, initialChatState } from "./chat-state"
import {
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	sidebarActivityFor,
	toRuns,
	toTranscriptRows,
	workingStateFor,
} from "./screen-model"

import type { ActivityEvent } from "../claude/contract"
import type {
	TranscriptCompletion,
	TranscriptMessage,
} from "../conversations/transcript-contract"
import { message as storedMessage } from "../conversations/transcript-fixtures"

function activity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
	return {
		id: "act-1",
		title: "Bash · npm test",
		kind: "tool",
		status: "running",
		...overrides,
	}
}

function message(
	overrides: Partial<TranscriptMessage> = {},
): TranscriptMessage {
	return storedMessage({ id: "msg-1", completion: "streaming", ...overrides })
}

function prompt(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
	return message({
		role: "user",
		content: "And?",
		completion: "complete",
		...overrides,
	})
}

/** The bubbles one message becomes, for the tests that read nothing else. */
function bubbles(
	content: string,
	completion: TranscriptCompletion = "complete",
): string[] {
	return toTranscriptRows([message({ content, completion })]).map(
		(row) => row.text,
	)
}

function chatState(overrides: Partial<ChatState> = {}): ChatState {
	return { ...initialChatState, turn: "running", ...overrides }
}

describe("toTranscriptRows", () => {
	it("publishes a paragraph only once a blank line has closed it", () => {
		const rows = toTranscriptRows([
			message({ content: "First paragraph.\n\nSecond one, still bei" }),
		])

		expect(rows.map((row) => row.text)).toEqual(["First paragraph."])
		expect(rows[0].completion).toBe("complete")
	})

	it("hands back the same rows for a message that has not moved", () => {
		const settled = message({
			id: "a",
			content: "One.",
			completion: "complete",
		})
		const live = message({ id: "b", content: "Two.\n\n" })

		const first = toTranscriptRows([settled, live])
		const second = toTranscriptRows([
			settled,
			{ ...live, content: "Two.\n\nThr" },
		])

		// The row the reader is already looking at must keep its identity, or the
		// memoised transcript re-renders every row on every delta.
		expect(second[0]).toBe(first[0])
	})

	it("releases the trailing paragraph when the turn ends", () => {
		const rows = toTranscriptRows([
			message({ content: "One.\n\nTwo.", completion: "complete" }),
		])

		expect(rows.map((row) => row.text)).toEqual(["One.", "Two."])
		expect(rows.map((row) => row.id)).toEqual(["msg-1#0", "msg-1#1"])
	})

	it("carries how the turn ended on its closing row alone", () => {
		const rows = toTranscriptRows([
			message({
				content: "Half an answer.\n\nStopped here.",
				completion: "cancelled",
			}),
		])

		expect(rows.map((row) => row.completion)).toEqual(["complete", "cancelled"])
		expect(rows.map((row) => row.text)).toEqual([
			"Half an answer.",
			"Stopped here.",
		])
	})

	it("keeps a row for a turn that ended before writing anything", () => {
		const stopped = toTranscriptRows([message({ completion: "failed" })])

		expect(stopped).toHaveLength(1)
		// The screen reads the emptiness back to withhold a copy action.
		expect(stopped[0].text).toBe("")
		expect(
			toTranscriptRows([message({ completion: "complete" })]),
		).toHaveLength(0)
		expect(toTranscriptRows([message()])).toHaveLength(0)
	})

	it("keeps a fenced block whole through the blank lines inside it", () => {
		expect(
			bubbles("Here it is:\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nDone."),
		).toEqual([
			"Here it is:",
			"```ts\nconst a = 1\n\nconst b = 2\n```",
			"Done.",
		])
	})

	it("withholds a fence the answer has not closed yet", () => {
		expect(
			bubbles("Here it is:\n\n```ts\nconst a = 1\n\nconst b", "streaming"),
		).toEqual(["Here it is:"])
	})

	it("keeps the items of a loose list in one bubble", () => {
		expect(
			bubbles("Steps:\n\n- one\n\n- two\n\n1. first\n\n2. second"),
		).toEqual(["Steps:", "- one\n\n- two", "1. first\n\n2. second"])
	})

	it("holds the block a single newline left unfinished", () => {
		expect(bubbles("Intro line:\n", "streaming")).toEqual([])
		expect(bubbles("Intro line:\nsecond line.", "streaming")).toEqual([])
	})

	it("keeps a paragraph and the list under it in one bubble", () => {
		expect(bubbles("Steps:\n- one\n\n- two")).toEqual([
			"Steps:\n- one\n\n- two",
		])
	})

	it("keeps an item and its indented continuation in one bubble", () => {
		expect(bubbles("1. one\n\n   more about one\n\n2. two")).toEqual([
			"1. one\n\n   more about one\n\n2. two",
		])
	})

	it("hands a block its own indentation, so indented code stays code", () => {
		expect(bubbles("Here:\n\n    const a = 1\n\nDone.")).toEqual([
			"Here:",
			"    const a = 1",
			"Done.",
		])
	})

	it("never rewrites or drops a bubble it has already published", () => {
		const written = [
			"Intro.",
			"- one\n\n  more about one\n\n- two",
			"```ts\nconst a = 1\n\nconst b = 2\n```",
			"Done.",
		]
		const answer = written.join("\n\n")
		let published: string[] = []

		for (let length = 1; length <= answer.length; length += 1) {
			const texts = bubbles(answer.slice(0, length), "streaming")

			// Everything already on screen has to still be there, word for word.
			expect(texts.slice(0, published.length)).toEqual(published)
			published = texts
		}

		// Every block but the last, which only the end of the turn releases.
		expect(published).toEqual(written.slice(0, -1))
	})

	it("splits text without markdown on its blank lines alone", () => {
		expect(bubbles("One.\nStill one.\n\n\nTwo.")).toEqual([
			"One.\nStill one.",
			"Two.",
		])
	})

	it("never splits the reader's own prompt", () => {
		const rows = toTranscriptRows([
			message({
				id: "local-1",
				role: "user",
				content: "One.\n\nTwo.",
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
				message({ id: "a", content: "One.\n\nTwo.", completion: "complete" }),
				message({
					id: "local-1",
					role: "user",
					content: "And?",
					completion: "complete",
				}),
				message({ id: "b", content: "Three.", completion: "complete" }),
				message({ id: "c", content: "Four.", completion: "complete" }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2, 1, 2])
		expect(runs.map((run) => run[0].role)).toEqual([
			"assistant",
			"user",
			"assistant",
		])
	})

	it("gathers prompts sent within minutes of each other", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([2])
	})

	it("opens a new block after a long pause", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 6 * 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([1, 1])
	})

	it("holds a long burst together while every pause stays short", () => {
		const runs = toRuns(
			toTranscriptRows([
				prompt({ id: "local-1", createdAt: 0 }),
				prompt({ id: "local-2", createdAt: 4 * 60_000 }),
				prompt({ id: "local-3", createdAt: 8 * 60_000 }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([3])
	})

	it("keeps the paragraphs of one answer together", () => {
		const runs = toRuns(
			toTranscriptRows([
				message({ content: "One.\n\nTwo.\n\nThree.", completion: "complete" }),
			]),
		)

		expect(runs.map((run) => run.length)).toEqual([3])
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
			workingStateFor(chatState({ messages: [message({ content: "Well" })] }))
				?.kind,
		).toBe("writing")
	})
})

describe("sidebarActivityFor", () => {
	it("goes quiet once the turn is over, kind and all", () => {
		expect(sidebarActivityFor(chatState({ turn: "idle" }))).toEqual({
			isWorking: false,
		})
		expect(sidebarActivityFor(chatState({ turn: "failed" }))).toEqual({
			isWorking: false,
		})
	})

	it("stays awake for every stage of a busy turn", () => {
		expect(
			sidebarActivityFor(chatState({ turn: "submitting" })).isWorking,
		).toBe(true)
		expect(sidebarActivityFor(chatState({ turn: "running" })).isWorking).toBe(
			true,
		)
		expect(sidebarActivityFor(chatState({ turn: "stopping" })).isWorking).toBe(
			true,
		)
	})

	it("thinks when the turn has nothing to show yet", () => {
		expect(sidebarActivityFor(chatState())).toEqual({
			isWorking: true,
			kind: "thinking",
		})
	})

	it("carries the pose read off the running step", () => {
		const state = chatState({
			activities: [activity({ title: "Grep · driver" })],
		})

		expect(sidebarActivityFor(state)).toEqual({
			isWorking: true,
			kind: "searching",
		})
	})

	it("keeps waiting on the reader as a busy state", () => {
		const state = chatState({
			activities: [activity()],
			permission: {
				id: "req-1",
				toolName: "Bash",
				title: "Run npm test",
				detail: null,
			},
		})

		expect(sidebarActivityFor(state)).toEqual({
			isWorking: true,
			kind: "waiting",
		})
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

	it("keeps a refused resume out of the session-ending errors", () => {
		const refused = { kind: "resumeFailed", forgotSessionId: true } as const
		expect(needsFreshSession(refused)).toBe(false)
		expect(noticeTitleFor(refused)).toBe(
			"Previous conversation could not be resumed",
		)
	})
})
