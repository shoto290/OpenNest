import { beforeAll, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { DELEGATE_TOOL } from "./opennest-server"
import { createPermissionGate } from "./permissions"

import type { SessionFrame } from "../provider"

let bundle: string

beforeAll(() => {
	bundle = mkdtempSync(join(tmpdir(), "permission-gate-"))
	mkdirSync(join(bundle, "skills"), { recursive: true })
})

const options = {
	requestId: "r1",
	toolUseID: "t1",
	signal: new AbortController().signal,
	suggestions: undefined,
}

const gateWith = (botPath?: string) => {
	const emitted: SessionFrame[] = []
	const gate = createPermissionGate((frame) => emitted.push(frame), { botPath })
	return { emitted, gate }
}

describe("createPermissionGate", () => {
	it("allows a write inside the bundle with the input untouched", async () => {
		const { emitted, gate } = gateWith(bundle)
		const input = { file_path: join(bundle, "skills", "SKILL.md") }

		const decision = await gate.canUseTool("Write", input, options)

		expect(decision).toEqual({ behavior: "allow", updatedInput: input })
		expect(emitted).toEqual([])
	})

	it("resolves a delegate call itself, without asking the reader", async () => {
		const { emitted, gate } = gateWith(bundle)
		const input = { instructions: "map the callers of openClaudeSession" }

		const decision = await gate.canUseTool(DELEGATE_TOOL, input, options)

		expect(decision).toEqual({ behavior: "allow", updatedInput: input })
		expect(emitted).toEqual([])
	})

	it("asks the reader for everything else", async () => {
		const { emitted, gate } = gateWith(bundle)
		const input = { file_path: join(bundle, ".mcp.json") }

		const asked = gate.canUseTool("Write", input, options)
		expect(emitted).toEqual([
			{
				type: "control_request",
				request_id: "r1",
				request: {
					subtype: "can_use_tool",
					tool_name: "Write",
					display_name: null,
					description: null,
					input,
				},
			},
		])

		gate.decide("r1", { behavior: "deny", message: "no" })
		expect(await asked).toEqual({ behavior: "deny", message: "no" })
	})
})
