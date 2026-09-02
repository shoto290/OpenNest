import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Settings } from "@anthropic-ai/claude-agent-sdk"

import { claudeSourceExecutable } from "./build"
import { DELEGATE_SERVER } from "./delegate"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { buildOptions, CLASSIFY_ASK_USER_QUESTION } from "./session"
import {
	bundleLine,
	layerFor,
	OPENNEST_LAYER,
	skillLine,
	spaceLine,
	unavailableServersSection,
	userLine,
} from "./system-layer"

import type { SessionRequest } from "../provider"

const settingsOf = (options: ReturnType<typeof buildOptions>): Settings =>
	options.settings as Settings

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const identity = "You are Bean, the baker."

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
	identity,
}

const leftOut = [
	'the server "clock" was left out: TOKEN is defined by no scope',
	'the server "probe" was left out: RUNNER is defined by no scope',
]

const appended = (options: ReturnType<typeof buildOptions>): string =>
	(options.systemPrompt as { append: string }).append

const spawns: SessionRequest[] = [
	request,
	{ ...request, resume: "s1" },
	{ cwd: "/tmp", partialMessages: false },
]

describe("buildOptions", () => {
	it("asks for the structured answer with the schema it was given", () => {
		const schema = {
			type: "object",
			properties: { outcome: { enum: ["ok", "nothing"] } },
			required: ["outcome"],
		}

		const options = buildOptions(
			{ ...request, outputSchema: schema },
			undefined,
		)

		expect(options.outputFormat).toEqual({ type: "json_schema", schema })
		expect((options.outputFormat as { schema: unknown }).schema).toBe(schema)
	})

	it("asks for no structured answer when none was requested", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).outputFormat).toBeUndefined()
		}
	})

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
		expect(settingsOf(options)).toEqual({
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

	it("hands the session an allowlist, not the sidecar's whole environment", () => {
		process.env.OPENNEST_SECRET_TOKEN = "leaked"

		const env = buildOptions(request, undefined).env ?? {}
		delete process.env.OPENNEST_SECRET_TOKEN

		expect(env.OPENNEST_SECRET_TOKEN).toBeUndefined()
		expect(env.PATH).toBe(process.env.PATH)
		expect(env[EXECUTABLE_OVERRIDE_ENV]).toBe(claudeSourceExecutable())
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
			settingsOf(
				buildOptions({ ...request, outputStyle: "Concise" }, undefined),
			),
		).toEqual({
			permissions: { disableBypassPermissionsMode: "disable" },
			outputStyle: "Concise",
		})
		expect(settingsOf(buildOptions(request, undefined))).toEqual({
			permissions: { disableBypassPermissionsMode: "disable" },
		})
	})

	it("pins the floor to the policy tier, above what a bot may declare", () => {
		const options = buildOptions(
			{ ...request, appDataDir: "/app-data/opennest" },
			undefined,
		)
		const floor = options.managedSettings

		expect(floor?.permissions?.deny).toContain(
			"Read(//app-data/opennest/conversations.sqlite3)",
		)
		expect(floor?.sandbox?.enabled).toBe(true)
		expect(floor?.sandbox?.filesystem?.denyRead).toContain(
			"/app-data/opennest/bots",
		)
		expect(floor?.sandbox?.filesystem?.allowRead).toEqual(["/bots/b1"])
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
		expect(
			Object.keys(buildOptions(request, undefined).mcpServers ?? {}),
		).toEqual([DELEGATE_SERVER])
	})

	it("leaves an unbundled session without a server of any kind", () => {
		expect(
			buildOptions({ cwd: "/tmp", partialMessages: false }, undefined)
				.mcpServers,
		).toBeUndefined()
	})

	it("denies the asynchronous agent tools on every spawn", () => {
		for (const spawned of spawns) {
			const floor = buildOptions(spawned, undefined).managedSettings
			expect(floor?.permissions?.deny).toContain("Agent")
			expect(floor?.permissions?.deny).toContain("Task")
		}
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

	it("names every server left out at the foot of the layer, detail for detail", () => {
		const append = appended(
			buildOptions(request, undefined, undefined, {
				servers: {},
				rejections: leftOut,
			}),
		)

		expect(append).toBe(layerFor(request, leftOut))
		expect(append.endsWith(unavailableServersSection(leftOut))).toBe(true)
		for (const detail of leftOut) {
			expect(append).toContain(detail)
		}
	})

	it("leaves the layer without that section when no server was left out", () => {
		const append = appended(
			buildOptions(request, undefined, undefined, {
				servers: {},
				rejections: [],
			}),
		)

		expect(append).toBe(layerFor(request))
		expect(append).not.toContain("left out")
	})

	it("carries the failure of the environment store into that section", () => {
		const failure = "the environment store could not be read"

		expect(
			appended(
				buildOptions(request, undefined, undefined, {
					servers: {},
					rejections: [failure],
				}),
			),
		).toContain(failure)
	})

	it("hands the kept servers and the rejections of one same resolution", () => {
		const options = buildOptions(request, undefined, undefined, {
			servers: { clock: { command: "run" } },
			rejections: leftOut,
		})

		expect(Object.keys(options.mcpServers ?? {})).toEqual([
			"clock",
			DELEGATE_SERVER,
		])
		expect(appended(options)).toContain(leftOut[0])
	})

	it("keeps the value a scope defines out of that section", () => {
		const bundle = mkdtempSync(join(tmpdir(), "opennest-servers-"))
		writeFileSync(
			join(bundle, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					clock: { command: "run", args: ["--token", "${TOKEN}"] },
					probe: { command: "${RUNNER}" },
				},
			}),
		)

		const append = appended(
			buildOptions(
				{
					...request,
					pluginPath: bundle,
					serverEnv: { base: { TOKEN: "narrow" } },
				},
				undefined,
			),
		)
		rmSync(bundle, { recursive: true, force: true })

		expect(append).toContain(
			'the server "probe" was left out: RUNNER is defined by no scope',
		)
		expect(append).not.toContain("clock")
		expect(append).not.toContain("narrow")
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
				`# learn\n\n${skillLine(join(system, "skills", "learn"))}\n\n## When to write\n\nRules.`,
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
				`# about-me\n\n${skillLine(join(system, "skills", "about-me"))}\n\nThey like figs.`,
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
				`# about-this-space\n\n${skillLine(join(system, "skills", "about-this-space"))}\n\nThe API lives in apps/api.`,
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

	it("closes on the servers left out, below every other section", () => {
		dropSkill(
			"learn",
			'---\nname: "learn"\nmetadata:\n  opennest:\n    preload: true\n---\n\nRules.\n',
		)

		expect(
			layerFor(
				{ identity, pluginPath: "/bots/b1", systemPluginPath: system },
				leftOut,
			),
		).toBe(
			[
				identity,
				OPENNEST_LAYER,
				bundleLine("/bots/b1"),
				`# learn\n\n${skillLine(join(system, "skills", "learn"))}\n\nRules.`,
				unavailableServersSection(leftOut),
			].join("\n\n"),
		)
	})

	it("tells the bot to answer with the tools it holds and to give the reason listed", () => {
		const section = unavailableServersSection(leftOut)

		expect(section).toContain("Answer the person with the tools you still hold")
		expect(section).toContain("give them the reason listed for it")
		expect(section).toContain(
			"the one exception to saying nothing about the machinery you run on",
		)
	})

	it("holds for a rejection naming no variable, such as an unreadable store", () => {
		const section = unavailableServersSection([
			"the environment store could not be read",
			'the server "clock" was left out: the environment store could not be read',
		])

		expect(section).not.toContain("variable")
		expect(section).toContain("give them the reason listed for it")
	})

	it("opens on the identity the host rendered, above the OpenNest sentences", () => {
		expect(layerFor({ identity, pluginPath: "/bots/b1" })).toBe(
			[identity, OPENNEST_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
		expect(layerFor({ pluginPath: "/bots/b1" })).not.toContain(identity)
	})
})
