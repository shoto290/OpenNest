import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

/** What a tool an MCP server provides is named. Left out of the catalogue: a
 * server belongs to one bot's bundle or to the reader's own settings, and what it
 * provides is not a built-in this install can be asked to hold back. */
const MCP_PREFIX = "mcp__"

/** What the throwaway session is prompted with. Measured against the real install:
 * the `init` frame — the one place the tool names are carried, since no control
 * request answers them — is emitted when a turn begins and never before it, so a
 * session that is never prompted names nothing. See `src-tauri/src/agent/PLUGINS.md`.
 *
 * The frame arrives ahead of the model's reply and the session is closed on it, so
 * the ask costs a turn that is started and never finished. */
const OPENING = "."

/** Every built-in the session named. The order is the install's own. */
export const builtInTools = (named: string[]) =>
	named.filter((tool) => !tool.startsWith(MCP_PREFIX))

/** The built-in tools a session of this install can be given. Read off the `init`
 * frame of a session opened for nothing else, in a temporary directory because the
 * catalogue is the install's rather than any bot's, and closed the moment the frame
 * lands.
 *
 * A session that ends without naming any answers none, which is the same empty a
 * host with no sidecar gets. */
export const claudeTools = async () => {
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: {
			cwd: tmpdir(),
			pathToClaudeCodeExecutable: resolveExecutable(),
			stderr: () => {},
		},
	})
	try {
		prompts.push(OPENING)
		for await (const message of run) {
			if (message.type === "system" && message.subtype === "init") {
				return builtInTools(message.tools)
			}
		}
		return []
	} finally {
		prompts.end()
		run.close()
	}
}
