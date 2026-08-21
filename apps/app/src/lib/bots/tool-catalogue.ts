import { invoke } from "@tauri-apps/api/core"

import { isDesktopHost } from "../host"

/** Every built-in tool a bot's session can be given, in the order the agent names
 * them. The host asks the sidecar, which reads the list off a session's `init`
 * frame — there is no file to read and no endpoint to ask — and keeps the answer
 * for the launch, so asking a second time costs no session.
 *
 * What an MCP server provides is not here: a server's tool belongs to the bundle
 * that declared it, and nothing offers to deny one.
 *
 * An empty answer is a host with no sidecar to ask, or a session that named
 * nothing. It is not a failure — a bot's denials are kept whatever this list holds.
 *
 * Outside the host there is no sidecar to ask, so `bun dev:web` runs on that same
 * empty answer. */
export const readToolCatalogue = (): Promise<string[]> =>
	isDesktopHost() ? invoke<string[]>("agent_tools") : Promise.resolve([])
