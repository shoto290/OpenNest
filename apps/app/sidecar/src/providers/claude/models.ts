import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"

/** The catalogue the SDK offers, in the order it offers it. `supportedModels()` is
 * the whole answer: there is no file to read and no endpoint to ask.
 *
 * It is a control request on a session, so one is opened for nothing else and
 * closed before the answer is returned. Never prompted, so it costs a handshake and
 * no turn, and it runs in a temporary directory because the catalogue is the
 * install's rather than any bot's. */
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
