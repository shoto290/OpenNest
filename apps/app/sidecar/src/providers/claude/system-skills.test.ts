import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { preloadedSkills } from "./system-skills"

const dropSkill = (plugin: string, id: string, contents: string) => {
	const dir = join(plugin, "skills", id)
	mkdirSync(dir, { recursive: true })
	writeFileSync(join(dir, "SKILL.md"), contents)
}

const marked = (name: string, body: string) =>
	`---\nname: ${JSON.stringify(name)}\ndescription: "How you remember."\nmetadata:\n  opennest:\n    preload: true\n---\n\n${body}\n`

describe("preloadedSkills", () => {
	let plugin: string

	beforeEach(() => {
		plugin = mkdtempSync(join(tmpdir(), "opennest-system-"))
	})

	afterEach(() => {
		rmSync(plugin, { recursive: true, force: true })
	})

	it("carries the body of every skill marked for preloading", () => {
		dropSkill(plugin, "learn", marked("learn", "## How to write\n\nRules."))

		expect(preloadedSkills(plugin)).toEqual([
			{ name: "learn", body: "## How to write\n\nRules." },
		])
	})

	it("names a skill by its directory when the frontmatter names none", () => {
		dropSkill(
			plugin,
			"learn",
			"---\nmetadata:\n  opennest:\n    preload: true\n---\n\nRules.\n",
		)

		expect(preloadedSkills(plugin)).toEqual([{ name: "learn", body: "Rules." }])
	})

	it("reads the skills in the order the disk names them", () => {
		dropSkill(plugin, "second", marked("second", "Later."))
		dropSkill(plugin, "first", marked("first", "Sooner."))

		expect(preloadedSkills(plugin).map(({ name }) => name)).toEqual([
			"first",
			"second",
		])
	})

	it("carries nothing for a skill that does not ask to be preloaded", () => {
		dropSkill(plugin, "quiet", '---\nname: "quiet"\n---\n\nRules.\n')
		dropSkill(
			plugin,
			"denied",
			"---\nmetadata:\n  opennest:\n    preload: false\n---\n\nRules.\n",
		)

		expect(preloadedSkills(plugin)).toEqual([])
	})

	it("carries nothing for a plugin with no skills, no directory, or a broken file", () => {
		expect(preloadedSkills(plugin)).toEqual([])
		expect(preloadedSkills(join(plugin, "nowhere"))).toEqual([])
		dropSkill(plugin, "headless", "Rules with no frontmatter.\n")
		expect(preloadedSkills(plugin)).toEqual([])
	})
})
