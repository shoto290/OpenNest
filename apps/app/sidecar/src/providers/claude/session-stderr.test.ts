import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { openClaudeSession } from "./session"
import { createStderrTail } from "./stderr-tail"

import type { SessionFrame } from "../provider"

const REFUSAL = "refusing to start: the credentials file is unreadable"

const overridden = process.env[EXECUTABLE_OVERRIDE_ENV]
let directory = ""

beforeAll(() => {
	directory = mkdtempSync(join(tmpdir(), "opennest-refusing-claude-"))
	const executable = join(directory, "claude")
	writeFileSync(executable, `#!/bin/sh\necho "${REFUSAL}" >&2\nexit 1\n`)
	chmodSync(executable, 0o755)
	process.env[EXECUTABLE_OVERRIDE_ENV] = executable
})

afterAll(() => {
	if (overridden === undefined) {
		delete process.env[EXECUTABLE_OVERRIDE_ENV]
	} else {
		process.env[EXECUTABLE_OVERRIDE_ENV] = overridden
	}
	rmSync(directory, { recursive: true, force: true })
})

describe("openClaudeSession", () => {
	it("rejects and closes on what Claude Code wrote to standard error before it threw", async () => {
		const frames: SessionFrame[] = []

		await expect(
			openClaudeSession({ cwd: directory, partialMessages: false }, (frame) => {
				frames.push(frame)
			}),
		).rejects.toThrow(REFUSAL)

		const closed = frames.find((frame) => frame.type === "closed")

		expect(closed).toBeDefined()
		expect(String(closed?.detail)).toContain(REFUSAL)
	})
})

describe("createStderrTail", () => {
	it("keeps the last 4000 characters and drops the oldest", () => {
		const tail = createStderrTail()

		tail.append("x".repeat(3990))
		tail.append(REFUSAL)

		const kept = tail.kept()

		expect(kept).toHaveLength(4000)
		expect(kept.endsWith(REFUSAL)).toBe(true)
	})
})
