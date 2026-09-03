import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { openClaudeSession } from "./session"

import type { SessionFrame } from "../provider"

const REFUSAL = "refusing to start: the sandbox runtime is not installed"

const overridden = process.env[EXECUTABLE_OVERRIDE_ENV]
let directory = ""

const times = (text: string) => text.split(REFUSAL).length - 1

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
	it("names once what Claude Code refused with, in the rejection and in the closed frame", async () => {
		const closed = Promise.withResolvers<SessionFrame>()
		const emit = (frame: SessionFrame) => {
			if (frame.type === "closed") {
				closed.resolve(frame)
			}
		}
		let rejection = ""

		try {
			await openClaudeSession({ cwd: directory, partialMessages: false }, emit)
			throw new Error("the refusing executable opened a session")
		} catch (error) {
			rejection = error instanceof Error ? error.message : String(error)
		}

		expect(times(rejection)).toBe(1)
		expect(times(String((await closed.promise).detail))).toBe(1)
	})
})
