import { afterEach, describe, expect, it } from "bun:test"

import { routineTools } from "./routine-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_ROUTINE = {
	id: "r1",
	conversationId: "c1",
	botId: "b1",
	title: "Nightly report",
}

const A_SOURCE = {
	id: "schedule",
	title: "On a schedule",
	payload: [{ name: "occurrenceId", type: "string" }],
	dedupeKey: "occurrenceId",
}

const A_REFUSAL = {
	kind: "routineOfAnotherBot",
	detail: "another bot owns this routine",
}

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const A_DRAFT = {
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	triggerConfig: { expression: "0 8 * * 1-5" },
}

const AN_EDIT = {
	id: "r1",
	title: "Renamed",
	instruction: "Read the shift log and report what changed.",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { expression: "0 8 * * 1-5" },
	isEnabled: true,
}

const calls: [string, Record<string, unknown>, string][] = [
	["routine_list", {}, "list"],
	["routine_trigger_sources", {}, "triggerSources"],
	["routine_create", A_DRAFT, "create"],
	["routine_update", AN_EDIT, "update"],
	["routine_run_now", { id: "r1" }, "runNow"],
	["routine_delete", { id: "r1" }, "delete"],
]

const answers: Record<string, unknown> = {
	list: [A_ROUTINE],
	triggerSources: [A_SOURCE],
	create: A_ROUTINE,
	update: { ...A_ROUTINE, title: "Renamed" },
	runNow: { kind: "started", runId: "run-1" },
	delete: null,
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
	const found = routineTools(session).find((held) => held.name === name)
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

describe("routineTools", () => {
	it("takes neither a conversation nor a bot from the agent", () => {
		for (const held of routineTools(SESSION)) {
			expect(Object.keys(held.inputSchema)).not.toContain("conversationId")
			expect(Object.keys(held.inputSchema)).not.toContain("botId")
		}
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = anAnsweringHost()

			const result = await called(name, input)

			expect(asked).toEqual([{ subtype: "routine", operation, payload: input }])
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
		const result = await called("routine_list", {}, undefined)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})
})
