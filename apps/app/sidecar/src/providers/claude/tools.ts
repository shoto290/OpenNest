import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

const MCP_PREFIX = "mcp__"

const OPENING = "."

export const builtInTools = (named: string[]) =>
	named.filter((tool) => !tool.startsWith(MCP_PREFIX))

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
