import { afterEach, describe, expect, it } from "bun:test"

import type { z } from "zod"

import { connectorTools } from "./connector-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const NAMES_A_SECRET = /key|secret|token|password|credential|value|header/i

const A_REFUSAL = { kind: "unknownScope", scope: "team" }

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const calls: [string, Record<string, unknown>, string][] = [
	["connector_search", { query: "linear" }, "search"],
	["connector_install", { application: "linear", scope: "space" }, "install"],
	["connector_status", { application: "linear", scope: "space" }, "status"],
]

const answers: Record<string, unknown> = {
	search: { applications: [] },
	install: {
		outcome: "installed",
		application: "linear",
		scope: "space",
		install: { kind: "oauth" },
	},
	status: { status: "notInstalled" },
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

const toolNamed = (name: string) => {
	const found = connectorTools(SESSION).find((held) => held.name === name)
	if (!found) {
		throw new Error(`the server carries no tool named ${name}`)
	}
	return found
}

const spoken = (result: Awaited<ReturnType<ConnectorHandler>>) =>
	JSON.parse((result.content[0] as { text: string }).text) as unknown

type ConnectorHandler = ReturnType<typeof toolNamed>["handler"]

afterEach(() => {
	closeHostChannel(SESSION)
})

describe("connectorTools", () => {
	it("declares no input field carrying a secret value", () => {
		for (const held of connectorTools(SESSION)) {
			for (const field of Object.keys(held.inputSchema)) {
				expect(field).not.toMatch(NAMES_A_SECRET)
			}
		}
		expect(Object.keys(toolNamed("connector_search").inputSchema)).toEqual([
			"query",
		])
		for (const name of ["connector_install", "connector_status"]) {
			expect(Object.keys(toolNamed(name).inputSchema)).toEqual([
				"application",
				"scope",
			])
		}
	})

	it("declares the scope as the three destinations and nothing else", () => {
		for (const name of ["connector_install", "connector_status"]) {
			const scope = toolNamed(name).inputSchema.scope as z.ZodEnum

			expect(scope.options).toEqual(["companion", "space", "user"])
			expect(scope.safeParse("team").success).toBe(false)
		}
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = aHost((request) => ({ result: answers[request.operation] }))

			const result = await toolNamed(name).handler(input, undefined)

			expect(asked).toEqual([
				{ subtype: "application", operation, payload: input },
			])
			expect(spoken(result)).toEqual(answers[operation])
			expect(result.isError).toBeUndefined()
			closeHostChannel(SESSION)
		}
	})

	it("speaks a refusal back as the result of the call", async () => {
		for (const [name, input] of calls) {
			aHost(() => ({ error: A_REFUSAL }))

			const result = await toolNamed(name).handler(input, undefined)

			expect(spoken(result)).toEqual(A_REFUSAL)
			expect(result.isError).toBe(true)
			closeHostChannel(SESSION)
		}
	})
})
