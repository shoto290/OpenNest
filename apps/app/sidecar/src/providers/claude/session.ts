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

/** The `init` message names the commands but not what they do; the described list
 * comes back with the initialization response instead. An empty description is the
 * SDK's way of saying nothing, so it is left out rather than passed on as blank. */
const described = (commands: SlashCommand[]): AgentCommand[] =>
	commands.map(({ name, description }) => ({
		name,
		...(description ? { description } : {}),
	}))

/** The two bundles a session loads: the bot's, whose agent the main thread is
 * promoted to, and the app's, which carries what the host owns rather than the bot.
 * Measured on 2.1.239: two local plugins load in one session and each namespaces its
 * own skills, so the pair coexists. The bot's comes first — it is the one that has to
 * resolve. A session opened without the app's plugin loads the bot's alone. */
const localPlugins = (
	pluginPath: string,
	systemPluginPath?: string,
): NonNullable<Options["plugins"]> => [
	{ type: "local", path: pluginPath },
	...(systemPluginPath
		? [{ type: "local" as const, path: systemPluginPath }]
		: []),
]

/** The preset is named on purpose, and it is what makes `agent` do anything at all:
 * measured against the real binary, an `agent` set without it resolves, is listed,
 * honours its model — and never applies its body. Dropping it looks like a
 * simplification and silently strips every bot of its brief. See
 * `src-tauri/src/agent/PLUGINS.md`.
 *
 * Its `append` is the OpenNest layer, which the preset carries without losing the
 * agent: measured, the two compose, where a custom string prompt would replace the
 * preset and take the bot's brief with it.
 *
 * The output style the host names travels through `settings` rather than through the
 * prompt: `settingSources: []` closes every settings file on the machine, so an
 * inline object is the only route a style has left. Absent, no key is passed at all —
 * an empty `settings` would still be a settings layer of the highest priority.
 *
 * The bundle is a `local` plugin: a directory loaded for this session and never
 * installed, with the bot's agent inside it. The two options stand or fall together —
 * a path with nothing promoted from it loads a plugin the session never uses, and an
 * agent with no path names one nothing defines — and both are rebuilt here on every
 * spawn, a resume included, since neither is carried across one.
 *
 * The app's own plugin loads beside it when the host names one, second in the array,
 * with its servers bridged the same way and the bot's names winning on a clash. The
 * layer then names the bot's own directory, which is what tells a bot holding two
 * plugins which of them its skills belong in, and carries the body of every skill that
 * plugin marked for preloading — the app's text reaches a bot through the layer rather
 * than through its bundle.
 *
 * `settingSources: []` and `strictMcpConfig` are what make a bot the same bot
 * anywhere: no `settings.json` of the machine's, no `CLAUDE.md` of the working
 * directory's, no `.mcp.json` of the project's. They are passed with or without a
 * bundle. `strictMcpConfig` drops what a plugin declares as well — measured — so the
 * bundles' own servers are read off their `.mcp.json` and passed as options, which is
 * what keeps the third option from taking a bot's servers with the machine's.
 *
 * The auto-memory directory is the one thing `settingSources: []` does not close:
 * `~/.claude/projects/<cwd-slug>/memory/` is derived from the working directory, so
 * two bots sharing one would read each other's. `autoMemoryEnabled` sits in a settings
 * file no longer read, and the binary reads the variable below instead. `env` replaces
 * the child's environment rather than adding to it, hence the spread.
 *
 * No model is named on purpose. The bot's model is the `model` key of the agent it is
 * promoted to, and an option passed here would override that key — the picker would
 * move a stored value and the child would keep answering under whatever this side
 * named. */
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
		append: layerFor(request.pluginPath, request.systemPluginPath),
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
