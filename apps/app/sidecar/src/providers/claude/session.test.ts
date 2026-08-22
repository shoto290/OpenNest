import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions } from "./session"

/** Run from source there is no bundle beside the sidecar to resolve. */
process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
}

describe("buildOptions", () => {
	it("loads the bot's bundle as a local plugin and promotes its agent", () => {
		const options = buildOptions(request, undefined)

		expect(options.plugins).toEqual([{ type: "local", path: "/bots/b1" }])
		expect(options.agent).toBe("bean")
	})

	// Measured, not documented: an `agent` set without the preset resolves, is
	// listed, honours its model — and never applies its body.
	it("keeps the preset system prompt on every spawn that names an agent", () => {
		for (const spawned of [request, { ...request, resume: "s1" }]) {
			expect(buildOptions(spawned, undefined).systemPrompt).toEqual({
				type: "preset",
				preset: "claude_code",
			})
		}
	})

	it("carries the bundle again on a resume, since neither option is sticky", () => {
		const options = buildOptions({ ...request, resume: "s1" }, undefined)

		expect(options.resume).toBe("s1")
		expect(options.plugins).toEqual([{ type: "local", path: "/bots/b1" }])
		expect(options.agent).toBe("bean")
	})

	// The bot's model is a key of the agent file in its bundle, and an option here
	// would override it: the picker would then change a stored value and nothing else.
	it("names no model, so the bundle's own key is what the child answers under", () => {
		for (const spawned of [request, { cwd: "/tmp", partialMessages: false }]) {
			expect(buildOptions(spawned, undefined).model).toBeUndefined()
		}
	})

	it("reads no settings on disk and no MCP configuration it was not given", () => {
		for (const spawned of [request, { cwd: "/tmp", partialMessages: false }]) {
			const options = buildOptions(spawned, undefined)

			expect(options.settingSources).toEqual([])
			expect(options.strictMcpConfig).toBe(true)
		}
	})

	it("names neither for a session opened with no bundle", () => {
		const options = buildOptions(
			{ cwd: "/tmp", partialMessages: false },
			undefined,
		)

		expect(options.plugins).toBeUndefined()
		expect(options.agent).toBeUndefined()
	})
})
