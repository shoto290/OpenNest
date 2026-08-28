import { beforeAll, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { isBundleWrite } from "./bundle-writes"

let bundle: string
let outside: string

beforeAll(() => {
	const root = mkdtempSync(join(tmpdir(), "bundle-writes-"))
	bundle = join(root, "bots", "b1")
	outside = join(root, "elsewhere")
	mkdirSync(join(bundle, "skills", "brief"), { recursive: true })
	mkdirSync(outside, { recursive: true })
	writeFileSync(join(outside, "notes.md"), "")
	symlinkSync(outside, join(bundle, "away"))
})

const writes = (path: string, tool = "Write") =>
	isBundleWrite(bundle, tool, { file_path: path })

describe("isBundleWrite", () => {
	it("owns what the bot writes in its own bundle", () => {
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"))).toBe(true)
		expect(writes(join(bundle, "skills", "new", "SKILL.md"), "Edit")).toBe(true)
	})

	it("leaves the bundle's own entries to the reader", () => {
		for (const reserved of [
			join(bundle, "agents", "bean.md"),
			join(bundle, ".claude-plugin", "plugin.json"),
			join(bundle, "hooks", "hooks.json"),
			join(bundle, ".git", "config"),
			join(bundle, ".mcp.json"),
			join(bundle, "settings.json"),
			bundle,
		]) {
			expect(writes(reserved)).toBe(false)
		}
	})

	it("leaves a file the bot could later run to the reader", () => {
		for (const name of [
			"setup.sh",
			"setup.bash",
			"setup.zsh",
			"setup.command",
			"setup.py",
			"setup.rb",
			"setup.pl",
			"setup.js",
			"setup.mjs",
			"setup.cjs",
			"setup.ts",
			"setup.applescript",
			"setup.SH",
			"setup.Py",
			"setup",
		]) {
			expect(writes(join(bundle, "skills", "brief", name))).toBe(false)
		}
	})

	it("owns the files the bot reads as instructions", () => {
		for (const name of [
			"brief.md",
			"brief.txt",
			"brief.json",
			"brief.yaml",
			"brief.yml",
			"brief.toml",
			"brief.MD",
		]) {
			expect(writes(join(bundle, "skills", "brief", name))).toBe(true)
		}
	})

	it("asks for a path that only looks like it is inside", () => {
		expect(writes(join(bundle, "..", "b2", "skills", "SKILL.md"))).toBe(false)
		expect(writes(join(bundle, "away", "notes.md"))).toBe(false)
		expect(writes(join(outside, "notes.md"))).toBe(false)
		expect(writes("skills/brief/SKILL.md")).toBe(false)
	})

	it("asks for every other tool, and for a session with no bundle", () => {
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"), "Bash")).toBe(
			false,
		)
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"), "Read")).toBe(
			false,
		)
		expect(
			isBundleWrite(undefined, "Write", {
				file_path: join(bundle, "skills", "brief", "SKILL.md"),
			}),
		).toBe(false)
		expect(isBundleWrite(bundle, "Write", {})).toBe(false)
	})
})
