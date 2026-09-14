import { afterEach, describe, expect, it } from "bun:test"

import { companionTools } from "./companion-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const NAMES_A_MOMENT = /\b(before|once)\b/

const A_SUGGESTION = {
	id: "writer",
	name: "Quill",
	job: "a writing partner",
	description: "Help me draft, tighten and polish what I write.",
	blurb: "Drafts, edits and keeps your voice.",
}

const A_DRAFT = {
	name: "Quill",
	job: "a writing partner",
	description: "Help me draft, tighten and polish what I write.",
}

const A_REFUSAL = {
	kind: "conversationWithoutSpace",
	conversationId: "c1",
}

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const calls: [string, Record<string, unknown>, string][] = [
	["companion_suggestions", {}, "suggestions"],
	["companion_create", A_DRAFT, "create"],
	["companion_first_run_done", {}, "firstRunDone"],
	["companion_invite", { companion: "Quill" }, "invite"],
]

const answers: Record<string, unknown> = {
	suggestions: [A_SUGGESTION],
	create: { id: "b2", name: "Quill" },
	firstRunDone: null,
	invite: { id: "b2", name: "Quill", alreadySeated: false },
}

const NAMES_A_SEQUENCE = /\b(then|after|first|next|once|until)\b/i

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
	const found = companionTools(session).find((held) => held.name === name)
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

describe("companionTools", () => {
	it("takes neither a conversation nor a space from the agent", () => {
		for (const held of companionTools(SESSION)) {
			expect(Object.keys(held.inputSchema)).not.toContain("conversationId")
			expect(Object.keys(held.inputSchema)).not.toContain("spaceId")
		}
	})

	it("describes each tool in one sentence naming when to call it", () => {
		for (const held of companionTools(SESSION)) {
			expect(held.description.split(". ")).toHaveLength(1)
			expect(held.description).toMatch(NAMES_A_MOMENT)
		}
	})

	it("takes one field naming the companion to invite and names no sequence of work", () => {
		const invite = toolNamed(SESSION, "companion_invite")

		expect(Object.keys(invite.inputSchema)).toEqual(["companion"])
		expect(invite.description).toMatch(/\bbefore\b/)
		expect(invite.description).not.toMatch(NAMES_A_SEQUENCE)
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = anAnsweringHost()

			const result = await called(name, input)

			expect(asked).toEqual([
				{ subtype: "companion", operation, payload: input },
			])
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
		const result = await called("companion_suggestions", {}, undefined)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})
})
