import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions, CLASSIFY_ASK_USER_QUESTION } from "./session"
import {
	bundleLine,
	layerFor,
	OPENNEST_LAYER,
	spaceLine,
	userLine,
} from "./system-layer"

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

	it("opens on the settings file the host names, mode and rules at once", () => {
		const bundle = mkdtempSync(join(tmpdir(), "opennest-settings-"))
		const settingsPath = join(bundle, "settings.json")
		writeFileSync(
			settingsPath,
			JSON.stringify({
				permissions: { allow: ["Read(**)"], defaultMode: "acceptEdits" },
				outputStyle: "default",
			}),
		)

		const options = buildOptions({ ...request, settingsPath }, undefined)

		expect(options.permissionMode).toBe("acceptEdits")
		expect(options.settings).toEqual({
			permissions: {
				allow: ["Read(**)"],
				disableBypassPermissionsMode: "disable",
			},
			outputStyle: "default",
		})
		expect(options.settingSources).toEqual([])

		rmSync(bundle, { recursive: true, force: true })
	})

	it("turns off auto mode's classifier, so a question reaches the host", () => {
		for (const spawned of spawns) {
			expect(
				buildOptions(spawned, undefined).env?.[CLASSIFY_ASK_USER_QUESTION],
			).toBe("0")
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

	it("has the bot look for a path before it declines, without agreeing to please", () => {
		expect(OPENNEST_LAYER).toContain("closest workable path")
		expect(OPENNEST_LAYER).toContain("what you can do instead")
		expect(OPENNEST_LAYER).toContain("never agree just to please")
		expect(OPENNEST_LAYER).toContain("never claim a capability you do not have")
	})

	it("passes the output style the host names, and locks bypass out either way", () => {
		expect(
			buildOptions({ ...request, outputStyle: "Concise" }, undefined).settings,
		).toEqual({
			permissions: { disableBypassPermissionsMode: "disable" },
			outputStyle: "Concise",
		})
		expect(buildOptions(request, undefined).settings).toEqual({
			permissions: { disableBypassPermissionsMode: "disable" },
		})
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
			{
				...request,
				systemPluginPath: "/app/system",
				userPluginPath: "/user/me",
				spacePluginPath: "/spaces/s1",
			},
			undefined,
		)

		expect(options.plugins).toEqual([
			{ type: "local", path: "/bots/b1" },
			{ type: "local", path: "/app/system" },
			{ type: "local", path: "/user/me" },
			{ type: "local", path: "/spaces/s1" },
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

	it("carries the person's plugin above the bot's own directory", () => {
		dropSkill(
			"about-me",
			'---\nname: "about-me"\nmetadata:\n  opennest:\n    preload: true\n---\n\nThey like figs.\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", userPluginPath: system })).toBe(
			[
				OPENNEST_LAYER,
				userLine(system),
				"# about-me\n\nThey like figs.",
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("carries the space's plugin below the person's", () => {
		dropSkill(
			"about-this-space",
			'---\nname: "about-this-space"\nmetadata:\n  opennest:\n    preload: true\n---\n\nThe API lives in apps/api.\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", spacePluginPath: system })).toBe(
			[
				OPENNEST_LAYER,
				spaceLine(system),
				"# about-this-space\n\nThe API lives in apps/api.",
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("reads the person before the project when both are laid down", () => {
		expect(
			layerFor({
				pluginPath: "/bots/b1",
				userPluginPath: "/user/me",
				spacePluginPath: "/spaces/s1",
			}),
		).toBe(
			[
				OPENNEST_LAYER,
				userLine("/user/me"),
				spaceLine("/spaces/s1"),
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("names no space when the bot's space has no plugin laid down", () => {
		expect(layerFor({ pluginPath: "/bots/b1" })).toBe(
			[OPENNEST_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
	})

	it("leaves out a preloaded skill the person has written nothing in yet", () => {
		dropSkill(
			"about-me",
			'---\nname: "about-me"\nmetadata:\n  opennest:\n    preload: true\n---\n\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", userPluginPath: system })).toBe(
			[OPENNEST_LAYER, userLine(system), bundleLine("/bots/b1")].join("\n\n"),
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
