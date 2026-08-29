import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { bundleServers, resolveServers, sessionServers } from "./bundle-servers"

const reference = (key: string) => `\${secret:${key}}`

const newBundle = (label: string) =>
	mkdtempSync(join(tmpdir(), `opennest-${label}-`))

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

	beforeEach(() => {
		bot = newBundle("bot")
		system = newBundle("system")
	})

	afterEach(() => {
		for (const bundle of [bot, system]) {
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

		expect(sessionServers(bot, system)).toEqual({
			probe: { command: "bot" },
			own: { command: "only-bot" },
			shared: { command: "only-system" },
		})
	})

	it("hands over the bot's alone when the host names no app plugin", () => {
		declaringServers(bot, { own: { command: "only-bot" } })

		expect(sessionServers(bot)).toEqual({ own: { command: "only-bot" } })
	})
})

describe("resolveServers", () => {
	type Declared = Parameters<typeof resolveServers>[0]

	const declared = (servers: Record<string, unknown>) =>
		servers as unknown as Declared

	const remote = (declaration: Record<string, unknown>) =>
		declared({ remote: declaration })

	it("puts the handed-over value where the reference stood", () => {
		const resolved = resolveServers(
			remote({ env: { GITHUB_TOKEN: reference("github.GITHUB_TOKEN") } }),
			{ "github.GITHUB_TOKEN": "ghp_live" },
		)

		expect(resolved.servers).toEqual(
			remote({ env: { GITHUB_TOKEN: "ghp_live" } }),
		)
		expect(resolved.missing).toEqual([])
	})

	it("keeps the text around a reference and fills every one of them", () => {
		const resolved = resolveServers(
			remote({
				headers: { Authorization: `Bearer ${reference("a")}` },
				args: [
					"--header",
					`X-One: ${reference("a")}; X-Two: ${reference("b")}`,
				],
				url: `https://x/sse?api_key=${reference("b")}&team=bakers`,
			}),
			{ a: "AAA", b: "BBB" },
		)

		expect(resolved.servers).toEqual(
			remote({
				headers: { Authorization: "Bearer AAA" },
				args: ["--header", "X-One: AAA; X-Two: BBB"],
				url: "https://x/sse?api_key=BBB&team=bakers",
			}),
		)
	})

	it("prefers the server's own value over the flat one", () => {
		const resolved = resolveServers(
			remote({ env: { TOKEN: reference("SHARED") } }),
			{ SHARED: "from-the-session" },
			{ remote: { SHARED: "from-the-server" } },
		)

		expect(resolved.servers).toEqual(
			remote({ env: { TOKEN: "from-the-server" } }),
		)
	})

	it("falls back to the flat value for a key the server does not hold", () => {
		const resolved = resolveServers(
			remote({ env: { OWN: reference("OWN"), SHARED: reference("SHARED") } }),
			{ SHARED: "from-the-session", OWN: "from-the-session" },
			{ remote: { OWN: "from-the-server" } },
		)

		expect(resolved.servers).toEqual(
			remote({ env: { OWN: "from-the-server", SHARED: "from-the-session" } }),
		)
	})

	it("never reads a value out of another server's entry", () => {
		const resolved = resolveServers(
			declared({
				remote: { env: { TOKEN: reference("SHARED") } },
				other: { env: { TOKEN: reference("SHARED") } },
			}),
			{ SHARED: "from-the-session" },
			{ other: { SHARED: "from-the-other-server" } },
		)

		expect(resolved.servers).toEqual(
			declared({
				remote: { env: { TOKEN: "from-the-session" } },
				other: { env: { TOKEN: "from-the-other-server" } },
			}),
		)
	})

	it("names a key held by neither map as missing for that server", () => {
		const resolved = resolveServers(
			remote({ env: { TOKEN: reference("absent") } }),
			{ SHARED: "from-the-session" },
			{ remote: { OWN: "from-the-server" } },
		)

		expect(resolved.servers).toEqual({})
		expect(resolved.missing).toEqual([{ server: "remote", key: "absent" }])
	})

	it("resolves exactly as before when no server map is handed over", () => {
		const declaration = remote({ env: { TOKEN: reference("SHARED") } })

		expect(resolveServers(declaration, { SHARED: "from-the-session" })).toEqual(
			resolveServers(declaration, { SHARED: "from-the-session" }, {}),
		)
	})

	it("treats an inherited server name as holding nothing of its own", () => {
		const resolved = resolveServers(
			remote({ env: { TOKEN: reference("SHARED") } }),
			{ SHARED: "from-the-session" },
			{},
		)

		expect(resolved.servers).toEqual(
			remote({ env: { TOKEN: "from-the-session" } }),
		)
	})

	it("leaves a declaration carrying no reference byte-identical", () => {
		const declared = remote({
			command: "python3",
			args: ["server.py", "--verbose"],
			env: { GITHUB_HOST: "example.com" },
			url: "https://x/sse?team=bakers",
		})

		expect(resolveServers(declared, { a: "AAA" }).servers).toEqual(declared)
	})

	it("drops the server and names what was missing when a key was not handed over", () => {
		const resolved = resolveServers(
			declared({
				remote: { env: { TOKEN: reference("absent") } },
				fine: { env: { TOKEN: reference("a") } },
			}),
			{ a: "AAA" },
		)

		expect(resolved.servers).toEqual(
			declared({ fine: { env: { TOKEN: "AAA" } } }),
		)
		expect(resolved.missing).toEqual([{ server: "remote", key: "absent" }])
	})

	it("names a missing key once however often the server asks for it", () => {
		const resolved = resolveServers(
			remote({ env: { ONE: reference("absent"), TWO: reference("absent") } }),
			{},
		)

		expect(resolved.missing).toEqual([{ server: "remote", key: "absent" }])
	})

	it("reads a reference out of the handed-over secrets and never out of the environment", () => {
		process.env.OPENNEST_TEST_SECRET = "from-the-environment"

		const resolved = resolveServers(
			remote({ env: { TOKEN: reference("OPENNEST_TEST_SECRET") } }),
			{},
		)

		expect(resolved.servers).toEqual({})
		expect(resolved.missing).toEqual([
			{ server: "remote", key: "OPENNEST_TEST_SECRET" },
		])
		delete process.env.OPENNEST_TEST_SECRET
	})

	it("treats an inherited object key as absent rather than a secret", () => {
		const resolved = resolveServers(
			remote({ env: { TOKEN: reference("constructor") } }),
			{},
		)

		expect(resolved.missing).toEqual([{ server: "remote", key: "constructor" }])
	})
})
