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

const APP_DATA_DIRECTORIES = ["attachments", "secrets"]

const BUNDLE_DIRECTORIES = ["bots", "spaces"]

const BUNDLE_ROOTS = ["bots/plugins", "spaces"]

const DBUS_FILES = ["/run/user/*/bus"]

const GIT_DIRECTORY = ".git"

const ANY_GIT_DIRECTORIES = ["/**/.git"]

const KEYCHAIN_COMMANDS = ["security", "secret-tool", "keyring", "cmdkey"]

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
		directories: [
			...under(home, READ_DIRECTORIES),
			...under(appDataDir, APP_DATA_DIRECTORIES),
		],
		files: [
			...under(home, READ_FILES),
			...ENVIRONMENT_FILES,
			...DBUS_FILES,
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

const bashRules = (commands: string[]): string[] =>
	commands.map((command) => `Bash(${command}:*)`)

const gitDirectories = (
	pluginPaths: string[],
	writablePaths: string[],
): Denial => ({
	directories: [...new Set([...pluginPaths, ...writablePaths])].map((path) =>
		join(path, GIT_DIRECTORY),
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
	pluginPaths: string[]
	writablePaths: string[]
}

export const securityFloor = ({
	appDataDir,
	pluginPaths,
	writablePaths,
}: FloorScope): Settings => {
	const reads = deniedReads(appDataDir)
	const writes = deniedWrites()
	const repositories = gitDirectories(pluginPaths, writablePaths)
	return {
		permissions: {
			deny: [
				...DENIED_TOOLS,
				...rulesFor("Read", reads),
				...rulesFor("Read", foreignBundles(appDataDir, pluginPaths)),
				...rulesFor("Edit", writes),
				...rulesFor("Edit", repositories),
				...rulesFor("Edit", { directories: ANY_GIT_DIRECTORIES, files: [] }),
				...bashRules(KEYCHAIN_COMMANDS),
			],
		},
		sandbox: {
			...SANDBOX,
			filesystem: {
				denyRead: [...pathsOf(reads), ...under(appDataDir, BUNDLE_DIRECTORIES)],
				denyWrite: [...pathsOf(writes), ...pathsOf(repositories)],
				...(pluginPaths.length > 0 ? { allowRead: pluginPaths } : {}),
				...(writablePaths.length > 0 ? { allowWrite: writablePaths } : {}),
			},
		},
	}
}
