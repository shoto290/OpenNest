import { describe, expect, it } from "vitest"

import { liveEdgeResponder, type PromptResponder } from "./use-prompt-responder"

type Trace = {
	calls: string[]
	answered: unknown[]
	responded: unknown[]
}

const tracedResponder = () => {
	const trace: Trace = { calls: [], answered: [], responded: [] }
	const responder: PromptResponder = liveEdgeResponder({
		responder: {
			answer: async (id, answers) => {
				trace.calls.push("answer")
				trace.answered.push(id, answers)
			},
			respond: async (id, decision) => {
				trace.calls.push("respond")
				trace.responded.push(id, decision)
			},
		},
		scrollToLiveEdge: () => {
			trace.calls.push("scroll")
		},
	})
	return { trace, responder }
}

describe("liveEdgeResponder", () => {
	it("scrolls to the live edge before answering", async () => {
		const { trace, responder } = tracedResponder()

		await responder.answer("question-1", { "Which one?": "Left" })

		expect(trace.calls).toEqual(["scroll", "answer"])
		expect(trace.answered).toEqual(["question-1", { "Which one?": "Left" }])
	})

	it("scrolls to the live edge before responding", async () => {
		const { trace, responder } = tracedResponder()

		await responder.respond("permission-1", "deny")

		expect(trace.calls).toEqual(["scroll", "respond"])
		expect(trace.responded).toEqual(["permission-1", "deny"])
	})
})
