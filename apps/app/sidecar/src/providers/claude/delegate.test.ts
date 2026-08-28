import { describe, expect, it } from "bun:test"

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"

import {
	DELEGATE_SERVER,
	DELEGATE_TOOL,
	delegateServer,
	reportOf,
} from "./delegate"

const streaming = async function* (
	...messages: SDKMessage[]
): AsyncIterable<SDKMessage> {
	yield* messages
}

const resulting = (message: Record<string, unknown>) =>
	({ type: "result", ...message }) as unknown as SDKMessage

const assistant = resulting({ subtype: "success", result: "Four callers." })

describe("reportOf", () => {
	it("hands back the text of the run that succeeded", async () => {
		expect(await reportOf(streaming(assistant))).toBe("Four callers.")
	})

	it("reads past everything the nested run said on its way there", async () => {
		const chatter = { type: "assistant" } as unknown as SDKMessage

		expect(await reportOf(streaming(chatter, chatter, assistant))).toBe(
			"Four callers.",
		)
	})

	it("names the failure when the run ends on anything but a success", async () => {
		const failing = resulting({ subtype: "error_max_turns" })

		expect(await reportOf(streaming(failing))).toContain("error_max_turns")
	})

	it("names the failure when the run ends without a result at all", async () => {
		expect(await reportOf(streaming())).toContain("before reporting")
	})
})

describe("delegateServer", () => {
	it("bridges one in-process server under the name the tool answers to", () => {
		const servers = delegateServer({ cwd: "/tmp", managedSettings: {} })

		expect(Object.keys(servers)).toEqual([DELEGATE_SERVER])
		expect(servers[DELEGATE_SERVER]?.type).toBe("sdk")
		expect(DELEGATE_TOOL).toBe(`mcp__${DELEGATE_SERVER}__delegate`)
	})
})
