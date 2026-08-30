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

type SessionPlugins = {
	pluginPath: string
	systemPluginPath?: string
	spacePluginPath?: string
}

const layeredServers = (pluginPath?: string): Servers =>
	pluginPath ? bundleServers(pluginPath) : {}

export const sessionServers = ({
	pluginPath,
	systemPluginPath,
	spacePluginPath,
}: SessionPlugins): Servers => ({
	...layeredServers(systemPluginPath),
	...layeredServers(spacePluginPath),
	...bundleServers(pluginPath),
})
