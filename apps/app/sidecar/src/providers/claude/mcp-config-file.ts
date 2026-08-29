import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Options } from "@anthropic-ai/claude-agent-sdk"

const DIRECTORY = "opennest-mcp"
const OWNER_ONLY = 0o600
const OWNER_ONLY_DIRECTORY = 0o700
const SERVERS_KEY = "mcpServers"

type Servers = NonNullable<Options["mcpServers"]>

export class McpConfigUnwritable extends Error {
	constructor(readonly detail: string) {
		super(`the MCP configuration could not be written: ${detail}`)
		this.name = "McpConfigUnwritable"
	}
}

export type SplitServers = {
	inProcess: Servers
	spawned: Servers
}

export const splitByProcess = (servers: Servers): SplitServers => {
	const inProcess: Servers = {}
	const spawned: Servers = {}
	for (const [name, declaration] of Object.entries(servers)) {
		if (declaration.type === "sdk") {
			inProcess[name] = declaration
		} else {
			spawned[name] = declaration
		}
	}
	return { inProcess, spawned }
}

export const writeMcpConfig = (session: string, servers: Servers): string => {
	const directory = join(tmpdir(), DIRECTORY)
	const path = join(directory, `${session}.json`)
	try {
		mkdirSync(directory, { recursive: true, mode: OWNER_ONLY_DIRECTORY })
		writeFileSync(path, JSON.stringify({ [SERVERS_KEY]: servers }), {
			mode: OWNER_ONLY,
		})
	} catch (error) {
		throw new McpConfigUnwritable(
			error instanceof Error ? error.message : String(error),
		)
	}
	return path
}

export const forgetMcpConfig = (path: string | undefined) => {
	if (path) {
		rmSync(path, { force: true })
	}
}
