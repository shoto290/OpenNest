import { readFileSync } from "node:fs"

import type { PermissionMode, Settings } from "@anthropic-ai/claude-agent-sdk"

import type { SessionRequest } from "../provider"
import { describeError } from "../../describe-error"

const AUTO: PermissionMode = "auto"

const MODES = new Set<string>([
	"acceptEdits",
	"auto",
	"default",
	"dontAsk",
	"plan",
])

const RULE_KEYS = ["allow", "ask", "deny"] as const

const FILE_KEYS = new Set<string>(["permissions", "outputStyle"])

const PERMISSION_KEYS = new Set<string>([...RULE_KEYS, "defaultMode"])

const BYPASS = "bypassPermissions"

const NOT_AN_OBJECT = "the settings file does not hold a JSON object"

const REFUSED = `${BYPASS} is refused, this session opens under ${AUTO}.`

const dropped = (keys: string[]) =>
	`keys outside the allowlist were dropped: ${keys.join(", ")}.`

export type SettingsOptions = {
	settings?: Settings
	permissionMode: PermissionMode
}

type BotSettings = {
	options: SettingsOptions
	rejection?: string
}

type Declared = Record<string, unknown>

const asObject = (value: unknown): Declared | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Declared)
		: undefined

const declaredRules = (permissions: Declared): Settings["permissions"] => {
	const rules: Record<string, string[]> = {}
	for (const key of RULE_KEYS) {
		const declared = permissions[key]
		if (Array.isArray(declared)) {
			rules[key] = declared.filter(
				(rule): rule is string => typeof rule === "string",
			)
		}
	}
	return rules
}

const declaredMode = (permissions: Declared): PermissionMode | undefined => {
	const declared = permissions.defaultMode
	return typeof declared === "string" && MODES.has(declared)
		? (declared as PermissionMode)
		: undefined
}

const declaredStyle = (declared: Declared): string | undefined =>
	typeof declared.outputStyle === "string" ? declared.outputStyle : undefined

const NO_BYPASS = { disableBypassPermissionsMode: "disable" } as const

const locked = (outputStyle?: string): SettingsOptions => ({
	permissionMode: AUTO,
	settings: {
		permissions: { ...NO_BYPASS },
		...(outputStyle ? { outputStyle } : {}),
	},
})

const readDeclared = (path: string): Declared => {
	const parsed = asObject(JSON.parse(readFileSync(path, "utf8")))
	if (!parsed) {
		throw new Error(NOT_AN_OBJECT)
	}
	return parsed
}

const accepted = (
	permissions: Declared,
	outputStyle?: string,
): SettingsOptions => ({
	permissionMode: declaredMode(permissions) ?? AUTO,
	settings: {
		permissions: { ...declaredRules(permissions), ...NO_BYPASS },
		...(outputStyle ? { outputStyle } : {}),
	},
})

const droppedKeys = (declared: Declared, permissions: Declared): string[] => [
	...Object.keys(declared).filter((key) => !FILE_KEYS.has(key)),
	...Object.keys(permissions)
		.filter((key) => !PERMISSION_KEYS.has(key))
		.map((key) => `permissions.${key}`),
]

const rejectionOf = (declared: Declared, permissions: Declared): string => {
	const keys = droppedKeys(declared, permissions)
	return [
		permissions.defaultMode === BYPASS ? REFUSED : "",
		keys.length > 0 ? dropped(keys) : "",
	]
		.filter(Boolean)
		.join(" ")
}

export const readBotSettings = (request: SessionRequest): BotSettings => {
	if (!request.settingsPath) {
		return { options: locked(request.outputStyle) }
	}
	let declared: Declared
	try {
		declared = readDeclared(request.settingsPath)
	} catch (error) {
		return {
			options: locked(request.outputStyle),
			rejection: describeError(error),
		}
	}
	const permissions = asObject(declared.permissions) ?? {}
	const rejection = rejectionOf(declared, permissions)
	return {
		options: accepted(
			permissions,
			declaredStyle(declared) ?? request.outputStyle,
		),
		...(rejection ? { rejection } : {}),
	}
}
