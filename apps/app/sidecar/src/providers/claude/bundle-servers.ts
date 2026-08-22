import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Options } from "@anthropic-ai/claude-agent-sdk"

/** Where a bundle declares its servers, and the one key of that file read here.
 * The host owns everything else in it. */
const MCP_NAME = ".mcp.json"
const SERVERS_KEY = "mcpServers"

type Servers = NonNullable<Options["mcpServers"]>

const objectAt = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {}

/** The servers a bundle declares, handed over under the names the bundle gives them.
 * `strictMcpConfig` drops every MCP configuration the session was not passed as an
 * option — measured: a plugin's own `.mcp.json` among them — so the file is read here
 * and its map passed on, which is the only route left from a bundle to a server.
 *
 * A bundle with no file, an unreadable one, or one holding anything but a map
 * declares nothing: a session opens without the server rather than not at all. */
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
