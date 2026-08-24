import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

export const claudeModels = async () => {
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
		const offered = await run.supportedModels()
		return offered.map((model) => model.value)
	} finally {
		prompts.end()
		run.close()
	}
}
