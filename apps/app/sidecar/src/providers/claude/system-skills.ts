import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SKILLS_DIR = "skills"
const SKILL_NAME = "SKILL.md"

const FRONTMATTER = /^\s*---\n([\s\S]*?)\n---\n/

const NAME_KEY = "name"
const PRELOAD_KEY = "preload"
const MARKED = "true"

export type PreloadedSkill = {
	name: string
	directory: string
	body: string
}

const unquoted = (value: string): string => {
	try {
		const parsed: unknown = JSON.parse(value)
		return typeof parsed === "string" ? parsed : value
	} catch {
		return value.replace(/^"|"$/g, "")
	}
}

const frontValue = (front: string, key: string): string | undefined => {
	const named = front
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith(`${key}:`))
	return named && unquoted(named.slice(key.length + 1).trim())
}

const fileText = (file: string): string => {
	try {
		return readFileSync(file, "utf8")
	} catch {
		return ""
	}
}

const preloadedIn = (
	skillsDir: string,
	id: string,
): PreloadedSkill | undefined => {
	const directory = join(skillsDir, id)
	const text = fileText(join(directory, SKILL_NAME))
	const matched = FRONTMATTER.exec(text)
	if (!matched) {
		return undefined
	}
	const [head, front] = matched
	if (frontValue(front, PRELOAD_KEY) !== MARKED) {
		return undefined
	}
	const body = text.slice(head.length).trim()
	if (!body) {
		return undefined
	}
	return { name: frontValue(front, NAME_KEY) || id, directory, body }
}

export const preloadedSkills = (pluginPath: string): PreloadedSkill[] => {
	const skillsDir = join(pluginPath, SKILLS_DIR)
	try {
		return readdirSync(skillsDir)
			.sort()
			.flatMap((id) => preloadedIn(skillsDir, id) ?? [])
	} catch {
		return []
	}
}
