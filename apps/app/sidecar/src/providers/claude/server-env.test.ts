import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolvedServers, resolveServers } from "./server-env"

import type { ServerEnv } from "../provider"

const probe = {
	command: "${RUNNER}",
	args: ["--token", "${TOKEN}"],
	env: { API_KEY: "${API_KEY}" },
}

const remote = {
	type: "http" as const,
	url: "${BASE_URL}/mcp",
	headers: { Authorization: "Bearer ${TOKEN}" },
}

const plain = { command: "python3", args: ["server.py"] }

const held: ServerEnv = {
	base: { RUNNER: "node", TOKEN: "wide", API_KEY: "secret" },
	perServer: { probe: { TOKEN: "narrow" } },
}

describe("resolveServers", () => {
	it("expands every declared field from the base under the server's own overlay", () => {
		const { servers, rejections } = resolveServers({ probe }, held)

		expect(servers.probe).toEqual({
			command: "node",
			args: ["--token", "narrow"],
			env: { API_KEY: "secret" },
		})
		expect(rejections).toEqual([])
	})

	it("expands the url and the headers of a remote server", () => {
		const { servers } = resolveServers(
			{ remote },
			{ base: { BASE_URL: "https://host", TOKEN: "wide" } },
		)

		expect(servers.remote).toEqual({
			type: "http",
			url: "https://host/mcp",
			headers: { Authorization: "Bearer wide" },
		})
	})

	it("hands back a declaration holding no variable as it was given", () => {
		const { servers } = resolveServers({ plain }, held)

		expect(servers.plain).toBe(plain)
	})

	it("serves the default of a variable no scope defines", () => {
		const { servers, rejections } = resolveServers(
			{ dated: { command: "run", args: ["--at", "${WHEN:-noon}"] } },
			{},
		)

		expect(servers.dated).toEqual({ command: "run", args: ["--at", "noon"] })
		expect(rejections).toEqual([])
	})

	it("leaves out the server whose variable has neither value nor default, keeping the rest", () => {
		const { servers, rejections } = resolveServers({ probe, plain }, {})

		expect(Object.keys(servers)).toEqual(["plain"])
		expect(rejections).toEqual([
			'the server "probe" was left out: RUNNER is defined by no scope',
		])
	})

	it("keeps a resolved value out of what it reports", () => {
		const { rejections } = resolveServers(
			{ probe },
			{ base: { RUNNER: "node", TOKEN: "wide" } },
		)

		expect(rejections.join(" ")).not.toContain("node")
		expect(rejections.join(" ")).not.toContain("wide")
	})

	it("keeps only the servers declaring no variable when the store could not be read", () => {
		const { servers, rejections } = resolveServers(
			{ probe, plain },
			{ failure: "the environment store could not be read" },
		)

		expect(Object.keys(servers)).toEqual(["plain"])
		expect(rejections).toEqual(["the environment store could not be read"])
	})
})

describe("resolvedServers", () => {
	let bundle: string

	beforeEach(() => {
		bundle = mkdtempSync(join(tmpdir(), "opennest-server-env-"))
		writeFileSync(
			join(bundle, ".mcp.json"),
			JSON.stringify({ mcpServers: { probe, plain } }),
		)
	})

	afterEach(() => {
		rmSync(bundle, { recursive: true, force: true })
	})

	it("resolves what the bundle declares against the environment the request carries", () => {
		const { servers, rejections } = resolvedServers({
			cwd: "/tmp",
			partialMessages: true,
			pluginPath: bundle,
			serverEnv: held,
		})

		expect(servers.probe).toEqual({
			command: "node",
			args: ["--token", "narrow"],
			env: { API_KEY: "secret" },
		})
		expect(servers.plain).toEqual(plain)
		expect(rejections).toEqual([])
	})

	it("carries nothing for a session opened with no bundle", () => {
		expect(resolvedServers({ cwd: "/tmp", partialMessages: true })).toEqual({
			servers: {},
			rejections: [],
		})
	})
})
