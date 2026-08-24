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

export const sessionServers = (
	pluginPath: string,
	systemPluginPath?: string,
): Servers => ({
	...(systemPluginPath ? bundleServers(systemPluginPath) : {}),
	...bundleServers(pluginPath),
})
