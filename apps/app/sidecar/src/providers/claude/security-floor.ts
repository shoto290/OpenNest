import { readdirSync } from "node:fs"
import { homedir } from "node:os"
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
	failIfUnavailable: true,
	allowUnsandboxedCommands: false,
	autoAllowBashIfSandboxed: false,
} as const

type Denial = {
	directories: string[]
	files: string[]
}

const under = (root: string | undefined, paths: string[]): string[] =>
	root ? paths.map((path) => join(root, path)) : []

const rulesFor = (tool: string, { directories, files }: Denial): string[] => [
	...directories.map((path) => `${tool}(/${path}/**)`),
	...files.map((path) => `${tool}(/${path})`),
]

const pathsOf = ({ directories, files }: Denial): string[] => [
	...directories,
	...files,
]

const deniedReads = (appDataDir?: string): Denial => {
	const home = homedir()
	return {
		directories: under(home, READ_DIRECTORIES),
		files: [
			...under(home, READ_FILES),
			...ENVIRONMENT_FILES,
			...under(appDataDir, APP_DATA_FILES),
		],
	}
}

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

const deniedWrites = (): Denial => {
	const home = homedir()
	return {
		directories: under(home, WRITE_DIRECTORIES),
		files: under(home, WRITE_FILES),
	}
}

export type FloorScope = {
	appDataDir?: string
	conversationId?: string
	pluginPaths: string[]
	writablePaths: string[]
}

export const securityFloor = ({
	appDataDir,
	conversationId,
	pluginPaths,
	writablePaths,
}: FloorScope): Settings => {
	const reads = deniedReads(appDataDir)
	const writes = deniedWrites()
	const attachments = ownedAttachments(appDataDir, conversationId)
	const readablePaths = attachments
		? [...pluginPaths, attachments]
		: pluginPaths
	return {
		permissions: {
			deny: [
				...DENIED_TOOLS,
				...rulesFor("Read", reads),
				...rulesFor("Read", foreignBundles(appDataDir, pluginPaths)),
				...rulesFor("Read", foreignAttachments(appDataDir, attachments)),
				...rulesFor("Edit", writes),
			],
		},
		sandbox: {
			...SANDBOX,
			filesystem: {
				denyRead: [...pathsOf(reads), ...under(appDataDir, DENIED_TREES)],
				denyWrite: pathsOf(writes),
				...(readablePaths.length > 0 ? { allowRead: readablePaths } : {}),
				...(writablePaths.length > 0 ? { allowWrite: writablePaths } : {}),
			},
		},
	}
}
