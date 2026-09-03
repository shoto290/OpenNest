import { readdirSync } from "node:fs"
import { join, sep } from "node:path"

import type { Settings } from "@anthropic-ai/claude-agent-sdk"

const READ_DIRECTORIES = [
	".ssh",
	".aws",
	".gnupg",
	".config/gh",
	".kube",
	"Library/Keychains",
]

const READ_FILES = [
	".netrc",
	".npmrc",
	".docker/config.json",
	".claude.json",
	".claude/.credentials.json",
]

const WRITE_DIRECTORIES = [".claude", "Library/LaunchAgents"]

const WRITE_FILES = [".zshrc", ".bashrc", ".zprofile", ".zshenv"]

const ENVIRONMENT_FILES = ["/**/.env", "/**/.env.*"]

const APP_DATA_FILES = [
	"conversations.sqlite3",
	"conversations.sqlite3-wal",
	"conversations.sqlite3-shm",
	"opennest.db",
	"session.json*",
]

const ATTACHMENTS_DIRECTORY = "attachments"

const DENIED_TREES = ["bots", "spaces", ATTACHMENTS_DIRECTORY]

const BUNDLE_ROOTS = ["bots/plugins", "spaces"]

const DENIED_TOOLS = ["Agent", "Task"]

const SANDBOX = {
	enabled: true,
	allowUnsandboxedCommands: false,
	autoAllowBashIfSandboxed: false,
} as const

export const failsWithoutSandbox = (platform: NodeJS.Platform): boolean =>
	platform !== "win32"

type Denial = {
	directories: string[]
	files: string[]
}

const under = (root: string | undefined, paths: string[]): string[] =>
	root ? paths.map((path) => join(root, path)) : []

const posixPath = (path: string): string =>
	path
		.replace(/^([a-zA-Z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)
		.replaceAll("\\", "/")

const denyPath = (platform: NodeJS.Platform, path: string): string =>
	platform === "win32" ? posixPath(path) : path

const rulesFor = (
	tool: string,
	{ directories, files }: Denial,
	platform: NodeJS.Platform,
): string[] => [
	...directories.map((path) => `${tool}(/${denyPath(platform, path)}/**)`),
	...files.map((path) => `${tool}(/${denyPath(platform, path)})`),
]

const pathsOf = ({ directories, files }: Denial): string[] => [
	...directories,
	...files,
]

const deniedReads = (home: string, appDataDir?: string): Denial => ({
	directories: under(home, READ_DIRECTORIES),
	files: [
		...under(home, READ_FILES),
		...ENVIRONMENT_FILES,
		...under(appDataDir, APP_DATA_FILES),
	],
})

const entriesOf = (directory: string): string[] => {
	try {
		return readdirSync(directory).map((entry) => join(directory, entry))
	} catch {
		return []
	}
}

const holds = (directory: string, path: string): boolean =>
	path === directory || path.startsWith(`${directory}${sep}`)

const foreignBundles = (
	appDataDir: string | undefined,
	pluginPaths: string[],
): Denial => ({
	directories: under(appDataDir, BUNDLE_ROOTS)
		.flatMap(entriesOf)
		.filter((bundle) => !pluginPaths.some((path) => holds(bundle, path))),
	files: [],
})

const ownedAttachments = (
	appDataDir: string | undefined,
	conversationId: string | undefined,
): string | undefined =>
	appDataDir && conversationId
		? join(appDataDir, ATTACHMENTS_DIRECTORY, conversationId)
		: undefined

const foreignAttachments = (
	appDataDir: string | undefined,
	owned: string | undefined,
): Denial => ({
	directories: under(appDataDir, [ATTACHMENTS_DIRECTORY]).flatMap((root) =>
		owned ? entriesOf(root).filter((entry) => entry !== owned) : [root],
	),
	files: [],
})

const deniedWrites = (home: string): Denial => ({
	directories: under(home, WRITE_DIRECTORIES),
	files: under(home, WRITE_FILES),
})

export type FloorScope = {
	appDataDir?: string
	conversationId?: string
	home: string
	platform: NodeJS.Platform
	pluginPaths: string[]
	writablePaths: string[]
}

export const securityFloor = ({
	appDataDir,
	conversationId,
	home,
	platform,
	pluginPaths,
	writablePaths,
}: FloorScope): Settings => {
	const reads = deniedReads(home, appDataDir)
	const writes = deniedWrites(home)
	const attachments = ownedAttachments(appDataDir, conversationId)
	const readablePaths = attachments
		? [...pluginPaths, attachments]
		: pluginPaths
	return {
		permissions: {
			deny: [
				...DENIED_TOOLS,
				...rulesFor("Read", reads, platform),
				...rulesFor("Read", foreignBundles(appDataDir, pluginPaths), platform),
				...rulesFor(
					"Read",
					foreignAttachments(appDataDir, attachments),
					platform,
				),
				...rulesFor("Edit", writes, platform),
			],
			...(writablePaths.length > 0
				? { additionalDirectories: writablePaths }
				: {}),
		},
		sandbox: {
			...SANDBOX,
			failIfUnavailable: failsWithoutSandbox(platform),
			filesystem: {
				denyRead: [...pathsOf(reads), ...under(appDataDir, DENIED_TREES)],
				denyWrite: pathsOf(writes),
				...(readablePaths.length > 0 ? { allowRead: readablePaths } : {}),
			},
		},
	}
}
