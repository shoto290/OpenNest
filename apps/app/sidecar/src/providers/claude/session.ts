import { homedir } from "node:os"

import {
	type Options,
	query,
	type SlashCommand,
} from "@anthropic-ai/claude-agent-sdk"

import { readBotSettings, type SettingsOptions } from "./bot-settings"
import type { BundleScope } from "./bundle-writes"
import { delegateServer } from "./delegate"
import { resolveExecutable } from "./executable"
import { createPermissionGate } from "./permissions"
import { createPromptStream } from "./prompt-stream"
import { securityFloor } from "./security-floor"
import { type ResolvedServers, resolvedServers } from "./server-env"
import { inheritedEnv } from "./session-env"
import { createStderrTail } from "./stderr-tail"
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
export const CLASSIFY_ASK_USER_QUESTION =
	"CLAUDE_CODE_AUTO_MODE_CLASSIFY_ASK_USER_QUESTION"

const withStderr = (detail: string, kept: string): string =>
	kept && !detail.includes(kept) ? `${detail}\n${kept}` : detail

const described = (commands: SlashCommand[]): AgentCommand[] =>
	commands.map(({ name, description }) => ({
		name,
		...(description ? { description } : {}),
	}))

const definedPaths = (paths: (string | undefined)[]): string[] =>
	paths.filter((path): path is string => Boolean(path))

const pluginPaths = (request: SessionRequest): string[] =>
	definedPaths([
		request.pluginPath,
		request.systemPluginPath,
		request.userPluginPath,
		request.spacePluginPath,
	])

const writeScope = (request: SessionRequest): BundleScope =>
	request.pluginPath
		? {
				botPath: request.pluginPath,
				userPath: request.userPluginPath,
				spacePath: request.spacePluginPath,
			}
		: {}

const writablePaths = ({
	botPath,
	userPath,
	spacePath,
}: BundleScope): string[] => definedPaths([botPath, userPath, spacePath])

const localPlugins = (paths: string[]): NonNullable<Options["plugins"]> =>
	paths.map((path) => ({ type: "local" as const, path }))

export const buildOptions = (
	request: SessionRequest,
	canUseTool: Options["canUseTool"],
	settings: SettingsOptions = readBotSettings(request).options,
	resolved: ResolvedServers = resolvedServers(request),
): Options => {
	const managedSettings = securityFloor({
		appDataDir: request.appDataDir,
		conversationId: request.conversationId,
		home: homedir(),
		platform: process.platform,
		pluginPaths: pluginPaths(request),
		writablePaths: writablePaths(writeScope(request)),
	})
	return {
		cwd: request.cwd,
		resume: request.resume,
		includePartialMessages: request.partialMessages,
		canUseTool,
		...settings,
		...(request.pluginPath && request.agent
			? {
					plugins: localPlugins(pluginPaths(request)),
					agent: request.agent,
					mcpServers: {
						...resolved.servers,
						...delegateServer({ cwd: request.cwd, managedSettings }),
					},
				}
			: {}),
		...(request.outputSchema
			? {
					outputFormat: {
						type: "json_schema" as const,
						schema: request.outputSchema,
					},
				}
			: {}),
		systemPrompt: {
			type: "preset",
			preset: "claude_code",
			append: layerFor(request, resolved.rejections),
		},
		env: {
			...inheritedEnv(),
			[DISABLE_AUTO_MEMORY]: "1",
			[CLASSIFY_ASK_USER_QUESTION]: "0",
		},
		managedSettings,
		settingSources: [],
		strictMcpConfig: true,
		pathToClaudeCodeExecutable: resolveExecutable(),
	}
}

export const openClaudeSession = async (
	request: SessionRequest,
	emit: EmitFrame,
): Promise<AgentSession> => {
	const prompts = createPromptStream()
	const permissions = createPermissionGate(emit, writeScope(request))
	const botSettings = readBotSettings(request)
	if (botSettings.rejection) {
		emit({ type: "settings_rejected", detail: botSettings.rejection })
	}
	const resolved = resolvedServers(request)
	for (const detail of resolved.rejections) {
		emit({ type: "server_env_rejected", detail })
	}
	const stderr = createStderrTail()
	const run = query({
		prompt: prompts.stream,
		options: {
			...buildOptions(
				request,
				permissions.canUseTool,
				botSettings.options,
				resolved,
			),
			stderr: stderr.append,
		},
	})

	let closing = false

	const pump = async () => {
		try {
			for await (const message of run) {
				emit(message as unknown as SessionFrame)
			}
			return ENDED
		} catch (error) {
			return withStderr(describeError(error), stderr.kept())
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
	]).catch((error: unknown) => {
		throw new Error(withStderr(describeError(error), stderr.kept()))
	})

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
