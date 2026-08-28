import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { securityFloor } from "./security-floor"

const APP_DATA = "/app-data/opennest"

const home = (path: string): string => join(homedir(), path)

const floor = (pluginPaths: string[] = []) =>
	securityFloor({ appDataDir: APP_DATA, pluginPaths })

const denyOf = (pluginPaths: string[] = []): string[] =>
	floor(pluginPaths).permissions?.deny ?? []

const filesystemOf = (pluginPaths: string[] = []) =>
	floor(pluginPaths).sandbox?.filesystem

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
			securityFloor({ appDataDir, pluginPaths }).permissions?.deny ?? []

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
		const paths = [
			join(APP_DATA, "bots/plugins/b1"),
			join(APP_DATA, "spaces/s1"),
		]

		expect(filesystemOf(paths)?.allowRead).toEqual(paths)
		expect(filesystemOf()?.allowRead).toBeUndefined()
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

	it("holds the rest of the floor when no data directory is named", () => {
		const bare = securityFloor({ pluginPaths: [] })

		expect(bare.permissions?.deny).toContain(`Read(/${home(".ssh")}/**)`)
		expect(bare.sandbox?.filesystem?.denyRead).toContain(home(".ssh"))
		expect(
			bare.sandbox?.filesystem?.denyRead?.some((path) =>
				path.startsWith(APP_DATA),
			),
		).toBe(false)
	})
})
