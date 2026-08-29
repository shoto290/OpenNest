import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Options } from "@anthropic-ai/claude-agent-sdk"

const MCP_NAME = ".mcp.json"
const SERVERS_KEY = "mcpServers"

type Servers = NonNullable<Options["mcpServers"]>

const objectAt = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {}

export const bundleServers = (pluginPath: string): Servers => {
	try {
		const declared = objectAt(
			JSON.parse(readFileSync(join(pluginPath, MCP_NAME), "utf8")),
		)
		return objectAt(declared[SERVERS_KEY]) as Servers
	} catch {
		return {}
	}
}

const SECRET_REFERENCE = /\$\{secret:([^}]+)\}/g

export type MissingSecret = {
	server: string
	key: string
}

export type ResolvedServers = {
	servers: Servers
	missing: MissingSecret[]
}

const substituted = (
	value: unknown,
	resolve: (text: string) => string,
): unknown => {
	if (typeof value === "string") {
		return resolve(value)
	}
	if (Array.isArray(value)) {
		return value.map((item) => substituted(item, resolve))
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				substituted(item, resolve),
			]),
		)
	}
	return value
}

const held = <T>(source: Record<string, T>, key: string): T | undefined =>
	Object.hasOwn(source, key) ? source[key] : undefined

export const resolveServers = (
	servers: Servers,
	secrets: Record<string, string>,
	serverSecrets: Record<string, Record<string, string>> = {},
): ResolvedServers => {
	const kept: Servers = {}
	const missing: MissingSecret[] = []

	for (const [server, declaration] of Object.entries(servers)) {
		const own = held(serverSecrets, server)
		const absent = new Set<string>()
		const resolved = substituted(declaration, (text) =>
			text.replace(SECRET_REFERENCE, (reference, key: string) => {
				const value = (own && held(own, key)) ?? held(secrets, key)
				if (value === undefined) {
					absent.add(key)
					return reference
				}
				return value
			}),
		)
		if (absent.size > 0) {
			for (const key of absent) {
				missing.push({ server, key })
			}
			continue
		}
		kept[server] = resolved as Servers[string]
	}

	return { servers: kept, missing }
}

export const sessionServers = (
	pluginPath: string,
	systemPluginPath?: string,
): Servers => ({
	...(systemPluginPath ? bundleServers(systemPluginPath) : {}),
	...bundleServers(pluginPath),
})
