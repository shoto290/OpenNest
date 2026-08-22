import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions } from "./session"
import { OPENNEST_LAYER } from "./system-layer"

/** Run from source there is no bundle beside the sidecar to resolve. */
process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
}

const spawns = [
	request,
	{ ...request, resume: "s1" },
	{ cwd: "/tmp", partialMessages: false },
]

describe("buildOptions", () => {
	it("loads the bot's bundle as a local plugin and promotes its agent", () => {
		const options = buildOptions(request, undefined)

		expect(options.plugins).toEqual([{ type: "local", path: "/bots/b1" }])
		expect(options.agent).toBe("bean")
	})

	// Measured, not documented: an `agent` set without the preset resolves, is
	// listed, honours its model — and never applies its body. The layer rides as the
	// preset's `append`, which is measured to compose with the agent rather than
	// replace it.
	it("appends the layer to the preset on every spawn, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).systemPrompt).toEqual({
				type: "preset",
				preset: "claude_code",
				append: OPENNEST_LAYER,
			})
		}
	})

	// Measured on 2.1.239 in `-p` mode: under the default mode a file write inside
	// the working directory is refused, and under `auto` the same write lands with
	// nothing to answer. What `auto` still escalates keeps reaching `canUseTool`, and
	// a bundle's `disallowedTools` keeps refusing what it names.
	it("opens every session in auto mode, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).permissionMode).toBe("auto")
		}
	})

	// The layer carries the situation only: a bot exported out of this app keeps
	// everything it can do.
	it("names no tool in the layer, so it grants no capability", () => {
		for (const tool of ["Bash", "Edit", "Grep", "Glob", "Task", "WebFetch"]) {
			expect(OPENNEST_LAYER).not.toContain(tool)
		}
	})

	// What is true only inside this app rides here rather than in a bundle: where the
	// bot runs, and where the person reads back and undoes what it kept.
	it("places the bot in OpenNest and points its learning at the History", () => {
		expect(OPENNEST_LAYER).toContain("OpenNest, a desktop app")
		expect(OPENNEST_LAYER).toContain("one of them")
		expect(OPENNEST_LAYER).toContain("one of your skills")
		expect(OPENNEST_LAYER).toContain("your History")
	})

	// `settingSources: []` closes every settings file, so an inline object is the
	// only route the host's style has left.
	it("passes the output style the host names, and no settings without one", () => {
		expect(
			buildOptions({ ...request, outputStyle: "Concise" }, undefined).settings,
		).toEqual({ outputStyle: "Concise" })
		expect(buildOptions(request, undefined).settings).toBeUndefined()
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

	// `strictMcpConfig` drops what a plugin declares, so the bundle's own file is
	// read and passed as an option: measured, that is the only route left.
	it("hands over the servers the bundle declares", () => {
		expect(buildOptions(request, undefined).mcpServers).toEqual({})
	})

	it("names neither for a session opened with no bundle", () => {
		const options = buildOptions(
			{ cwd: "/tmp", partialMessages: false },
			undefined,
		)

		expect(options.plugins).toBeUndefined()
		expect(options.agent).toBeUndefined()
		expect(options.mcpServers).toBeUndefined()
	})
})
