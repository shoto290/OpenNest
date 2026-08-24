import {
	type Options,
	query,
	type SlashCommand,
} from "@anthropic-ai/claude-agent-sdk"

import { sessionServers } from "./bundle-servers"
import { resolveExecutable } from "./executable"
import { createPermissionGate } from "./permissions"
import { createPromptStream } from "./prompt-stream"
import { layerFor } from "./system-layer"

import type {
	AgentCommand,
	AgentSession,
	EmitFrame,
	SessionFrame,
	SessionRequest,
} from "../provider"
import { describeError } from "../../describe-error"

const ABANDONED = "The session ended before this was answered."
const ENDED = "the agent ended"
const DISABLE_AUTO_MEMORY = "CLAUDE_CODE_DISABLE_AUTO_MEMORY"

const described = (commands: SlashCommand[]): AgentCommand[] =>
	commands.map(({ name, description }) => ({
		name,
		...(description ? { description } : {}),
	}))

const localPlugins = (
	pluginPath: string,
	systemPluginPath?: string,
): NonNullable<Options["plugins"]> => [
	{ type: "local", path: pluginPath },
	...(systemPluginPath
		? [{ type: "local" as const, path: systemPluginPath }]
		: []),
]

export const buildOptions = (
	request: SessionRequest,
	canUseTool: Options["canUseTool"],
): Options => ({
	cwd: request.cwd,
	resume: request.resume,
	includePartialMessages: request.partialMessages,
	permissionMode: "auto",
	canUseTool,
	...(request.pluginPath && request.agent
		? {
				plugins: localPlugins(request.pluginPath, request.systemPluginPath),
				agent: request.agent,
				mcpServers: sessionServers(
					request.pluginPath,
					request.systemPluginPath,
				),
			}
		: {}),
	systemPrompt: {
		type: "preset",
		preset: "claude_code",
		append: layerFor(request),
	},
	...(request.outputStyle
		? { settings: { outputStyle: request.outputStyle } }
		: {}),
	env: { ...process.env, [DISABLE_AUTO_MEMORY]: "1" },
	settingSources: [],
	strictMcpConfig: true,
	pathToClaudeCodeExecutable: resolveExecutable(),
	stderr: () => {},
})

export const openClaudeSession = async (
	request: SessionRequest,
	emit: EmitFrame,
): Promise<AgentSession> => {
	const prompts = createPromptStream()
	const permissions = createPermissionGate(emit, request.pluginPath)
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

	const initialized = await Promise.race([
		run.initializationResult(),
		collapsed,
	])

	emit({ type: "commands", commands: described(initialized.commands) })

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
