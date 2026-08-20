import { type Options, query } from "@anthropic-ai/claude-agent-sdk"

import { resolveExecutable } from "./executable"
import { createPermissionGate } from "./permissions"
import { createPromptStream } from "./prompt-stream"

import type {
	AgentSession,
	EmitFrame,
	SessionFrame,
	SessionRequest,
} from "../provider"
import { describeError } from "../../describe-error"

const ABANDONED = "The session ended before this was answered."
const ENDED = "the agent ended"

/** The preset is named on purpose: omitting `systemPrompt` drops the Claude Code
 * system prompt, and a bot's own instructions are an addition to it rather than a
 * replacement for it. `settingSources` is left out so the CLI defaults stand — the
 * settings on disk and the CLAUDE.md files they reach. */
const buildOptions = (
	request: SessionRequest,
	canUseTool: Options["canUseTool"],
): Options => ({
	cwd: request.cwd,
	resume: request.resume,
	includePartialMessages: request.partialMessages,
	canUseTool,
	systemPrompt: {
		type: "preset",
		preset: "claude_code",
		...(request.appendSystemPrompt
			? { append: request.appendSystemPrompt }
			: {}),
	},
	pathToClaudeCodeExecutable: resolveExecutable(),
	stderr: () => {},
})

export const openClaudeSession = async (
	request: SessionRequest,
	emit: EmitFrame,
): Promise<AgentSession> => {
	const prompts = createPromptStream()
	const permissions = createPermissionGate(emit)
	const run = query({
		prompt: prompts.stream,
		options: buildOptions(request, permissions.canUseTool),
	})

	let closing = false

	const pump = async () => {
		try {
			for await (const message of run) {
				emit(message as unknown as SessionFrame)
			}
			return ENDED
		} catch (error) {
			return describeError(error)
		}
	}

	const drained = pump().then((detail) => {
		permissions.denyAll(ABANDONED)
		if (!closing) {
			emit({ type: "closed", detail })
		}
		return detail
	})
	const collapsed = drained.then((detail) => {
		throw new Error(detail)
	})
	collapsed.catch(() => {})

	await Promise.race([run.initializationResult(), collapsed])

	return {
		prompt: prompts.push,
		interrupt: async () => {
			await run.interrupt()
		},
		decide: permissions.decide,
		close: async () => {
			closing = true
			prompts.end()
			run.close()
			await drained
		},
	}
}
