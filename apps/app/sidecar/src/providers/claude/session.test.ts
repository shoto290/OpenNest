import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions } from "./session"
import { bundleLine, layerFor, OPENNEST_LAYER } from "./system-layer"

import type { SessionRequest } from "../provider"

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const identity = "You are Bean, the baker."

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
	identity,
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

	it("appends the layer to the preset on every spawn, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).systemPrompt).toEqual({
				type: "preset",
				preset: "claude_code",
				append: layerFor(spawned),
			})
		}
	})

	it("names the bot's own directory under the layer, and only with a bundle", () => {
		expect(layerFor({ pluginPath: "/bots/b1" })).toBe(
			`${OPENNEST_LAYER}\n\n${bundleLine("/bots/b1")}`,
		)
		expect(bundleLine("/bots/b1")).toContain("/bots/b1")
		expect(layerFor({})).toBe(OPENNEST_LAYER)
	})

	it("opens every session in auto mode, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).permissionMode).toBe("auto")
		}
	})

	it("names no tool in the layer, so it grants no capability", () => {
		for (const tool of ["Bash", "Edit", "Grep", "Glob", "Task", "WebFetch"]) {
			expect(OPENNEST_LAYER).not.toContain(tool)
		}
	})

	it("places the bot in OpenNest and points its learning at the History", () => {
		expect(OPENNEST_LAYER).toContain("OpenNest, a desktop app")
		expect(OPENNEST_LAYER).toContain("one of them")
		expect(OPENNEST_LAYER).toContain("one of your skills")
		expect(OPENNEST_LAYER).toContain("your History")
	})

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

	it("hands over the servers the bundle declares", () => {
		expect(buildOptions(request, undefined).mcpServers).toEqual({})
	})

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

	it("carries the app plugin's preloaded skills under the bot's own directory", () => {
		dropSkill(
			"learn",
			'---\nname: "learn"\nmetadata:\n  opennest:\n    preload: true\n---\n\n## When to write\n\nRules.\n',
		)

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

	it("opens on the identity the host rendered, above the OpenNest sentences", () => {
		expect(layerFor({ identity, pluginPath: "/bots/b1" })).toBe(
			[identity, OPENNEST_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
		expect(layerFor({ pluginPath: "/bots/b1" })).not.toContain(identity)
	})
})
