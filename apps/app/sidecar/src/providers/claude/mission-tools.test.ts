import { afterEach, describe, expect, it } from "bun:test"

import { missionTools } from "./mission-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_MISSION = {
	id: "m1",
	originConversationId: "c1",
	botId: "b1",
	threadConversationId: "t1",
	state: "working",
}

const A_REFUSAL = {
	kind: "missionOfAnotherBot",
	id: "m1",
	botId: "b1",
}

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const A_TICKET = {
	platform: "linear",
	externalId: "OPE-26",
	url: "https://linear.test/OPE-26",
	title: "Mission tools",
}

const calls: [string, Record<string, unknown>, string][] = [
	[
		"mission_open",
		{ objective: "Ship the tools", ticket: A_TICKET, tools: ["gh"] },
		"open",
	],
	["mission_note", { id: "m1", line: "The host answers" }, "note"],
	[
		"mission_escalate",
		{ id: "m1", question: "Which platform?", reason: "The person decides" },
		"escalate",
	],
	[
		"mission_close",
		{ id: "m1", outcome: "done", summary: "The tools are served" },
		"close",
	],
	[
		"mission_watch",
		{ id: "m1", branch: "feature/ope-37", repository: "shoto290/OpenNest" },
		"watch",
	],
	["mission_list", {}, "list"],
]

const answers: Record<string, unknown> = {
	open: A_MISSION,
	note: A_MISSION,
	escalate: { ...A_MISSION, state: "waiting_human" },
	close: { ...A_MISSION, state: "done" },
	watch: {
		mission: A_MISSION,
		url: "http://127.0.0.1:7788/hooks/mission",
		key: "a-key",
		header: "x-opennest-key",
	},
	list: [
		{
			id: "m1",
			ticket: A_TICKET,
			state: "working",
			openedAt: 1,
		},
	],
}

const aHost = (served: (asked: Asked) => Served) => {
	const asked: Asked[] = []
	openHostChannel(SESSION, (frame: SessionFrame) => {
		const { requestId, request } = frame as {
			requestId: string
			request: Asked
		}
		asked.push(request)
		settleHostAnswer(SESSION, { requestId, ...served(request) })
	})
	return asked
}

const anAnsweringHost = () =>
	aHost((asked) => ({ result: answers[asked.operation] }))

const aRefusingHost = () => aHost(() => ({ error: A_REFUSAL }))

const toolNamed = (session: string | undefined, name: string) => {
	const found = missionTools(session).find((held) => held.name === name)
	if (!found) {
		throw new Error(`the server carries no tool named ${name}`)
	}
	return found
}

const called = async (
	name: string,
	input: Record<string, unknown>,
	session: string | undefined = SESSION,
) => toolNamed(session, name).handler(input, undefined)

const spoken = (result: Awaited<ReturnType<typeof called>>) =>
	JSON.parse((result.content[0] as { text: string }).text) as unknown

afterEach(() => {
	closeHostChannel(SESSION)
})

describe("missionTools", () => {
	it("serves the six mission tools under their own names", () => {
		expect(missionTools(SESSION).map((held) => held.name)).toEqual([
			"mission_open",
			"mission_note",
			"mission_escalate",
			"mission_close",
			"mission_watch",
			"mission_list",
		])
	})

	it("takes neither a conversation nor a bot from the agent", () => {
		for (const held of missionTools(SESSION)) {
			expect(Object.keys(held.inputSchema)).not.toContain("conversationId")
			expect(Object.keys(held.inputSchema)).not.toContain("botId")
		}
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = anAnsweringHost()

			const result = await called(name, input)

			expect(asked).toEqual([{ subtype: "mission", operation, payload: input }])
			expect(spoken(result)).toEqual(answers[operation])
			expect(result.isError).toBeUndefined()
			closeHostChannel(SESSION)
		}
	})

	it("speaks a refusal back as the result of the call and ends nothing", async () => {
		for (const [name, input] of calls) {
			aRefusingHost()

			const result = await called(name, input)

			expect(spoken(result)).toEqual(A_REFUSAL)
			expect(result.isError).toBe(true)
			closeHostChannel(SESSION)
		}
	})

	it("refuses a call carried by a session that holds no channel", async () => {
		const result = await called(
			"mission_note",
			{ id: "m1", line: "x" },
			undefined,
		)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})
})
