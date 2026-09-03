import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { securityFloor } from "./security-floor"

const APP_DATA = "/app-data/opennest"

const BOT_PATH = join(APP_DATA, "bots/plugins/b1")
const SYSTEM_PATH = join(APP_DATA, "bots/plugins/system")
const USER_PATH = join(APP_DATA, "bots/plugins/person")
const SPACE_PATH = join(APP_DATA, "spaces/s1")

const PLUGIN_PATHS = [BOT_PATH, SYSTEM_PATH, USER_PATH, SPACE_PATH]
const WRITABLE_PATHS = [BOT_PATH, USER_PATH, SPACE_PATH]

const home = (path: string): string => join(homedir(), path)

const floor = (pluginPaths: string[] = [], writablePaths: string[] = []) =>
	securityFloor({
		appDataDir: APP_DATA,
		platform: "darwin",
		pluginPaths,
		writablePaths,
	})

const floorIn = (appDataDir: string, conversationId: string) =>
	securityFloor({
		appDataDir,
		conversationId,
		platform: "darwin",
		pluginPaths: [],
		writablePaths: [],
	})

const denyOf = (pluginPaths: string[] = []): string[] =>
	floor(pluginPaths).permissions?.deny ?? []

const filesystemOf = (
	pluginPaths: string[] = [],
	writablePaths: string[] = [],
) => floor(pluginPaths, writablePaths).sandbox?.filesystem

const writableOf = (
	pluginPaths: string[] = [],
	writablePaths: string[] = [],
): string[] | undefined =>
	floor(pluginPaths, writablePaths).permissions?.additionalDirectories

describe("securityFloor", () => {
	it("denies reads of the host's credential paths, expanded from home", () => {
		const deny = denyOf()

		for (const path of [
			".ssh",
			".aws",
			".gnupg",
			".config/gh",
			".kube",
			"Library/Keychains",
		]) {
			expect(deny).toContain(`Read(/${home(path)}/**)`)
		}
		for (const path of [
			".netrc",
			".npmrc",
			".docker/config.json",
			".claude.json",
			".claude/.credentials.json",
		]) {
			expect(deny).toContain(`Read(/${home(path)})`)
		}
		expect(deny).toContain("Read(//**/.env)")
		expect(deny).toContain("Read(//**/.env.*)")
		expect(deny.some((rule) => rule.includes("~"))).toBe(false)
	})

	it("denies the asynchronous agent tools outright", () => {
		const deny = denyOf()

		expect(deny).toContain("Agent")
		expect(deny).toContain("Task")
	})

	it("denies writes to the host's shell and agent paths", () => {
		const deny = denyOf()

		for (const path of [".claude", "Library/LaunchAgents"]) {
			expect(deny).toContain(`Edit(/${home(path)}/**)`)
		}
		for (const path of [".zshrc", ".bashrc", ".zprofile", ".zshenv"]) {
			expect(deny).toContain(`Edit(/${home(path)})`)
		}
	})

	it("denies reads of what the host keeps in its own data directory", () => {
		const deny = denyOf()
		const denyRead = filesystemOf()?.denyRead

		for (const file of [
			"conversations.sqlite3",
			"conversations.sqlite3-wal",
			"conversations.sqlite3-shm",
			"opennest.db",
			"session.json*",
		]) {
			expect(deny).toContain(`Read(/${join(APP_DATA, file)})`)
			expect(denyRead).toContain(join(APP_DATA, file))
		}
	})

	it("denies reads of what the reader dropped into any conversation", () => {
		expect(denyOf()).toContain(`Read(/${join(APP_DATA, "attachments")}/**)`)
		expect(filesystemOf()?.denyRead).toContain(join(APP_DATA, "attachments"))
	})

	it("reads back what the reader dropped into the conversation it answers in", () => {
		const mine = join(APP_DATA, "attachments/c1")
		const settings = floorIn(APP_DATA, "c1")

		expect(settings.permissions?.deny).not.toContain(`Read(/${mine}/**)`)
		expect(settings.sandbox?.filesystem?.allowRead).toContain(mine)
		expect(settings.sandbox?.filesystem?.denyRead).toContain(
			join(APP_DATA, "attachments"),
		)
	})

	it("keeps a session out of the bundles of every other bot and space", () => {
		const denyRead = filesystemOf()?.denyRead

		expect(denyRead).toContain(join(APP_DATA, "bots"))
		expect(denyRead).toContain(join(APP_DATA, "spaces"))
	})

	describe("over a host directory laid down on disk", () => {
		let appDataDir: string

		const laidDown = (...paths: string[]) => {
			for (const path of paths) {
				mkdirSync(join(appDataDir, path), { recursive: true })
			}
		}

		const denyOver = (pluginPaths: string[]): string[] =>
			securityFloor({
				appDataDir,
				platform: "darwin",
				pluginPaths,
				writablePaths: pluginPaths,
			}).permissions?.deny ?? []

		beforeEach(() => {
			appDataDir = mkdtempSync(join(tmpdir(), "security-floor-"))
		})

		afterEach(() => {
			rmSync(appDataDir, { recursive: true, force: true })
		})

		it("denies the Read tool on every bundle the session does not run on", () => {
			laidDown("bots/plugins/b1", "bots/plugins/b2", "spaces/s1", "spaces/s2")
			const mine = join(appDataDir, "bots/plugins/b1")
			const mySpace = join(appDataDir, "spaces/s1")

			const deny = denyOver([mine, mySpace])

			expect(deny).toContain(`Read(/${join(appDataDir, "bots/plugins/b2")}/**)`)
			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s2")}/**)`)
			expect(deny).not.toContain(`Read(/${mine}/**)`)
			expect(deny).not.toContain(`Read(/${mySpace}/**)`)
		})

		it("leaves every ancestor of a plugin path out of the deny rules", () => {
			laidDown("bots/plugins/b1", "spaces/s1")
			const skill = join(appDataDir, "bots/plugins/b1/skills/baking")

			const deny = denyOver([skill])

			for (const ancestor of ["bots", "bots/plugins", "bots/plugins/b1"]) {
				expect(deny).not.toContain(`Read(/${join(appDataDir, ancestor)}/**)`)
			}
			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s1")}/**)`)
		})

		it("denies the Read tool on the attachments of every other conversation", () => {
			laidDown("attachments/c1", "attachments/c2")

			const deny = floorIn(appDataDir, "c1").permissions?.deny ?? []

			expect(deny).toContain(`Read(/${join(appDataDir, "attachments/c2")}/**)`)
			expect(deny).not.toContain(
				`Read(/${join(appDataDir, "attachments/c1")}/**)`,
			)
			expect(deny).not.toContain(`Read(/${join(appDataDir, "attachments")}/**)`)
		})

		it("denies what it could enumerate when the other directory is absent", () => {
			laidDown("spaces/s1", "spaces/s2")

			const deny = denyOver([join(appDataDir, "spaces/s1")])

			expect(deny).toContain(`Read(/${join(appDataDir, "spaces/s2")}/**)`)
			expect(deny.some((rule) => rule.includes(join(appDataDir, "bots")))).toBe(
				false,
			)
		})
	})

	it("reads back the plugin paths the session was opened on", () => {
		expect(filesystemOf(PLUGIN_PATHS)?.allowRead).toEqual(PLUGIN_PATHS)
		expect(filesystemOf()?.allowRead).toBeUndefined()
	})

	it("writes back only into the bundles the bot owns", () => {
		const writable = writableOf(PLUGIN_PATHS, WRITABLE_PATHS)
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(writable).toEqual(WRITABLE_PATHS)
		expect(writable).not.toContain(SYSTEM_PATH)
		expect(filesystem?.allowRead).toContain(SYSTEM_PATH)
	})

	it("leaves the write allowance off the key the policy tier drops", () => {
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(filesystem).not.toHaveProperty("allowWrite")
	})

	it("holds the standing denials while the bundles stay writable", () => {
		const filesystem = filesystemOf(PLUGIN_PATHS, WRITABLE_PATHS)

		expect(filesystem?.denyWrite).toContain(home(".claude"))
		expect(filesystem?.denyRead).toContain(join(APP_DATA, "bots"))
		expect(filesystem?.denyRead).toContain(join(APP_DATA, "spaces"))
	})

	it("leaves the write allowance out when the session owns no bundle", () => {
		expect(writableOf(PLUGIN_PATHS)).toBeUndefined()
		expect(writableOf()).toBeUndefined()
	})

	it("sandboxes every spawned command, with no domain gate", () => {
		const sandbox = floor().sandbox

		expect(sandbox).toMatchObject({
			enabled: true,
			failIfUnavailable: true,
			allowUnsandboxedCommands: false,
			autoAllowBashIfSandboxed: false,
		})
		expect(sandbox?.network).toBeUndefined()
	})

	it("starts the session when a sandbox is out of reach on Windows", () => {
		const sandbox = securityFloor({
			platform: "win32",
			pluginPaths: [],
			writablePaths: [],
		}).sandbox

		expect(sandbox).toMatchObject({
			enabled: true,
			failIfUnavailable: false,
			allowUnsandboxedCommands: false,
			autoAllowBashIfSandboxed: false,
		})
	})

	it("holds the rest of the floor when no data directory is named", () => {
		const bare = securityFloor({
			platform: "darwin",
			pluginPaths: [],
			writablePaths: [],
		})

		expect(bare.permissions?.deny).toContain(`Read(/${home(".ssh")}/**)`)
		expect(bare.sandbox?.filesystem?.denyRead).toContain(home(".ssh"))
		expect(
			bare.sandbox?.filesystem?.denyRead?.some((path) =>
				path.startsWith(APP_DATA),
			),
		).toBe(false)
	})
})
