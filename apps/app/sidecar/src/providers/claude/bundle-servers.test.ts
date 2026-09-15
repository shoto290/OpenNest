import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { bundleServers, sessionServers } from "./bundle-servers"

const newBundle = (label: string) =>
	mkdtempSync(join(tmpdir(), `kiroshi-${label}-`))

const declaring = (bundle: string, contents?: string) => {
	const file = join(bundle, ".mcp.json")
	if (contents === undefined) {
		rmSync(file, { force: true })
	} else {
		writeFileSync(file, contents)
	}
	return bundle
}

const declaringServers = (bundle: string, servers: Record<string, unknown>) =>
	declaring(bundle, JSON.stringify({ mcpServers: servers }))

describe("bundleServers", () => {
	let bundle: string

	beforeEach(() => {
		bundle = newBundle("bundle")
	})

	afterEach(() => {
		rmSync(bundle, { recursive: true, force: true })
	})

	it("hands over what the bundle declares, under the bundle's own names", () => {
		const declared = declaring(
			bundle,
			JSON.stringify({
				mcpServers: { probe: { command: "python3", args: ["server.py"] } },
				other: "left alone",
			}),
		)

		expect(bundleServers(declared)).toEqual({
			probe: { command: "python3", args: ["server.py"] },
		})
	})

	it("declares nothing for a bundle with no file, a broken one or a map-less one", () => {
		for (const contents of [
			undefined,
			"{ not json",
			JSON.stringify({ mcpServers: ["probe"] }),
			JSON.stringify([]),
		]) {
			expect(bundleServers(declaring(bundle, contents))).toEqual({})
		}
	})
})

describe("sessionServers", () => {
	let bot: string
	let system: string
	let user: string
	let space: string

	beforeEach(() => {
		bot = newBundle("bot")
		system = newBundle("system")
		user = newBundle("user")
		space = newBundle("space")
	})

	afterEach(() => {
		for (const bundle of [bot, system, user, space]) {
			rmSync(bundle, { recursive: true, force: true })
		}
	})

	it("bridges the app's plugin beside the bot's, the bot's name winning a clash", () => {
		declaringServers(bot, {
			probe: { command: "bot" },
			own: { command: "only-bot" },
		})
		declaringServers(system, {
			probe: { command: "system" },
			shared: { command: "only-system" },
		})

		expect(
			sessionServers({ pluginPath: bot, systemPluginPath: system }),
		).toEqual({
			probe: { command: "bot" },
			own: { command: "only-bot" },
			shared: { command: "only-system" },
		})
	})

	it("lays the space over the app and under the bot", () => {
		declaringServers(system, {
			probe: { command: "system" },
			shared: { command: "system" },
		})
		declaringServers(space, {
			probe: { command: "space" },
			shared: { command: "space" },
			team: { command: "only-space" },
		})
		declaringServers(bot, { probe: { command: "bot" } })

		expect(
			sessionServers({
				pluginPath: bot,
				systemPluginPath: system,
				spacePluginPath: space,
			}),
		).toEqual({
			probe: { command: "bot" },
			shared: { command: "space" },
			team: { command: "only-space" },
		})
	})

	it("lays the person over the app, under the space and under the bot", () => {
		declaringServers(system, {
			probe: { command: "system" },
			shared: { command: "system" },
			mine: { command: "system" },
			app: { command: "only-system" },
		})
		declaringServers(user, {
			probe: { command: "user" },
			shared: { command: "user" },
			mine: { command: "user" },
		})
		declaringServers(space, {
			probe: { command: "space" },
			shared: { command: "space" },
		})
		declaringServers(bot, { probe: { command: "bot" } })

		expect(
			sessionServers({
				pluginPath: bot,
				systemPluginPath: system,
				userPluginPath: user,
				spacePluginPath: space,
			}),
		).toEqual({
			probe: { command: "bot" },
			shared: { command: "space" },
			mine: { command: "user" },
			app: { command: "only-system" },
		})
	})

	it("opens with the other bundles when the person's declares nothing or cannot be read", () => {
		declaringServers(system, { app: { command: "system" } })
		declaringServers(space, { team: { command: "space" } })
		declaringServers(bot, { own: { command: "bot" } })

		for (const contents of [undefined, "{ not json"]) {
			expect(
				sessionServers({
					pluginPath: bot,
					systemPluginPath: system,
					userPluginPath: declaring(user, contents),
					spacePluginPath: space,
				}),
			).toEqual({
				app: { command: "system" },
				team: { command: "space" },
				own: { command: "bot" },
			})
		}
	})

	it("hands over the bot's alone when the host names no app plugin", () => {
		declaringServers(bot, { own: { command: "only-bot" } })

		expect(sessionServers({ pluginPath: bot })).toEqual({
			own: { command: "only-bot" },
		})
	})
})
