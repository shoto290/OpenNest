import type { Options } from "@anthropic-ai/claude-agent-sdk"

import { sessionServers } from "./bundle-servers"

import type { ServerEnv, SessionRequest } from "../provider"

type Servers = NonNullable<Options["mcpServers"]>
type Server = Servers[string]
type Values = Record<string, string>

const EXPANDED_FIELDS = ["command", "args", "env", "url", "headers"] as const
const PLACEHOLDER = /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g
const OPENING = "${"

export type ResolvedServers = {
	servers: Servers
	rejections: string[]
}

const declaredFields = (server: Server): [string, unknown][] => {
	const declared = server as Record<string, unknown>
	return EXPANDED_FIELDS.filter((field) => field in declared).map((field) => [
		field,
		declared[field],
	])
}

const declaresVariable = (server: Server): boolean =>
	JSON.stringify(declaredFields(server)).includes(OPENING)

const expandText = (text: string, values: Values, missing: string[]): string =>
	text.replace(PLACEHOLDER, (whole, name: string, fallback?: string) => {
		const held = values[name]
		if (held !== undefined) {
			return held
		}
		if (fallback !== undefined) {
			return fallback
		}
		missing.push(name)
		return whole
	})

const expandValue = (
	value: unknown,
	values: Values,
	missing: string[],
): unknown => {
	if (typeof value === "string") {
		return expandText(value, values, missing)
	}
	if (Array.isArray(value)) {
		return value.map((held) => expandValue(held, values, missing))
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, held]) => [
				key,
				expandValue(held, values, missing),
			]),
		)
	}
	return value
}

const expandServer = (
	server: Server,
	values: Values,
	missing: string[],
): Server => {
	const expanded = declaredFields(server).map(([field, value]) => [
		field,
		expandValue(value, values, missing),
	])
	return { ...server, ...Object.fromEntries(expanded) } as Server
}

const leftOut = (name: string, reason: string) =>
	`the server "${name}" was left out: ${reason}`

const UNREADABLE_STORE = "the environment store could not be read"

export const resolveServers = (
	servers: Servers,
	env: ServerEnv,
): ResolvedServers => {
	const kept: Servers = {}
	const rejections: string[] = []
	for (const [name, server] of Object.entries(servers)) {
		if (!declaresVariable(server)) {
			kept[name] = server
			continue
		}
		if (env.failure) {
			rejections.push(leftOut(name, UNREADABLE_STORE))
			continue
		}
		const missing: string[] = []
		const expanded = expandServer(
			server,
			{ ...env.base, ...env.perServer?.[name] },
			missing,
		)
		const [absent] = missing
		if (absent) {
			rejections.push(leftOut(name, `${absent} is defined by no scope`))
			continue
		}
		kept[name] = expanded
	}
	return {
		servers: kept,
		rejections:
			env.failure && rejections.length
				? [env.failure, ...rejections]
				: rejections,
	}
}

export const resolvedServers = (request: SessionRequest): ResolvedServers =>
	resolveServers(
		request.pluginPath
			? sessionServers({
					pluginPath: request.pluginPath,
					systemPluginPath: request.systemPluginPath,
					spacePluginPath: request.spacePluginPath,
				})
			: {},
		request.serverEnv ?? {},
	)
