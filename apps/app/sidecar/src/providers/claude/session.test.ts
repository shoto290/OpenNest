import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions } from "./session"
import { bundleLine, layerFor, OPENNEST_LAYER } from "./system-layer"

import type { SessionRequest } from "../provider"

/** Run from source there is no bundle beside the sidecar to resolve. */
process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
	identity: "You are Bean, the baker.",
}

const spawns: SessionRequest[] = [
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
				append: layerFor(spawned),
			})
		}
	})

	// A session holds two plugins and the prompt is the only thing that says which
	// directory is the bot's own.
	it("names the bot's own directory under the layer, and only with a bundle", () => {
		expect(layerFor({ pluginPath: "/bots/b1" })).toBe(
			`${OPENNEST_LAYER}\n\n${bundleLine("/bots/b1")}`,
		)
		expect(bundleLine("/bots/b1")).toContain("/bots/b1")
		expect(layerFor({})).toBe(OPENNEST_LAYER)
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

	// Measured on 2.1.239: two local plugins load in one session, each namespacing
	// its own skills. The bot's comes first — it is the one the agent resolves in.
	it("loads the app's plugin beside the bot's when the host names one", () => {
		const options = buildOptions(
			{ ...request, systemPluginPath: "/app/system" },
			undefined,
		)

		expect(options.plugins).toEqual([
			{ type: "local", path: "/bots/b1" },
			{ type: "local", path: "/app/system" },
		])
		expect(options.agent).toBe("bean")
	})

	it("loads the app's plugin on a resume too, since no flag is sticky", () => {
		expect(
			buildOptions(
				{ ...request, systemPluginPath: "/app/system", resume: "s1" },
				undefined,
			).plugins,
		).toEqual([
			{ type: "local", path: "/bots/b1" },
			{ type: "local", path: "/app/system" },
		])
	})

	// The app's plugin is never promoted: without a bot's bundle there is no agent,
	// and a session that loads nothing loads it neither.
	it("loads no plugin at all for a session with no bundle of the bot's", () => {
		expect(
			buildOptions(
				{
					cwd: "/tmp",
					partialMessages: false,
					systemPluginPath: "/app/system",
				},
				undefined,
			).plugins,
		).toBeUndefined()
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

describe("layerFor", () => {
	let system: string

	beforeEach(() => {
		system = mkdtempSync(join(tmpdir(), "opennest-layer-"))
	})

	afterEach(() => {
		rmSync(system, { recursive: true, force: true })
	})

	const dropSkill = (id: string, contents: string) => {
		const dir = join(system, "skills", id)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "SKILL.md"), contents)
	}

	// The app's text reaches a bot through the layer rather than through its bundle:
	// a change to the app's plugin is in force at the next session of every bot.
	it("carries the app plugin's preloaded skills under the bot's own directory", () => {
		dropSkill(
			"learn",
			'---\nname: "learn"\nmetadata:\n  opennest:\n    preload: true\n---\n\n## When to write\n\nRules.\n',
		)

		// The skill is named in a heading of its own, above a body whose sections nest
		// under it rather than beside it.
		expect(layerFor({ pluginPath: "/bots/b1", systemPluginPath: system })).toBe(
			[
				OPENNEST_LAYER,
				bundleLine("/bots/b1"),
				"# learn\n\n## When to write\n\nRules.",
			].join("\n\n"),
		)
	})

	it("appends nothing for an app plugin with no preloaded skill", () => {
		dropSkill("quiet", '---\nname: "quiet"\n---\n\nRules.\n')

		expect(layerFor({ pluginPath: "/bots/b1", systemPluginPath: system })).toBe(
			`${OPENNEST_LAYER}\n\n${bundleLine("/bots/b1")}`,
		)
	})

	// The host owns the sentences and the bot owns only its name: the identity is
	// rendered on the other side and appended here, above the app's own text.
	it("opens on the identity the host rendered, above the OpenNest sentences", () => {
		const identity = "You are Bean, the baker."

		expect(layerFor({ identity, pluginPath: "/bots/b1" })).toBe(
			[identity, OPENNEST_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
		expect(layerFor({ pluginPath: "/bots/b1" })).not.toContain(identity)
	})
})
