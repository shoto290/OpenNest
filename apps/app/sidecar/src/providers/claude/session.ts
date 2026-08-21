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

/** The preset is named on purpose, and it is what makes `agent` do anything at all:
 * measured against the real binary, an `agent` set without it resolves, is listed,
 * honours its model — and never applies its body. Dropping it looks like a
 * simplification and silently strips every bot of its brief. See
 * `src-tauri/src/agent/PLUGINS.md`.
 *
 * The bundle is a `local` plugin: a directory loaded for this session and never
 * installed, with the bot's agent inside it. The two options stand or fall together —
 * a path with nothing promoted from it loads a plugin the session never uses, and an
 * agent with no path names one nothing defines — and both are rebuilt here on every
 * spawn, a resume included, since neither is carried across one.
 *
 * `settingSources` is left out so the CLI defaults stand — the settings on disk and
 * the CLAUDE.md files they reach. */
export const buildOptions = (
	request: SessionRequest,
	canUseTool: Options["canUseTool"],
): Options => ({
	cwd: request.cwd,
	resume: request.resume,
	includePartialMessages: request.partialMessages,
	canUseTool,
	...(request.pluginPath && request.agent
		? {
				plugins: [{ type: "local", path: request.pluginPath } as const],
				agent: request.agent,
			}
		: {}),
	systemPrompt: { type: "preset", preset: "claude_code" },
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
