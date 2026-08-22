import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** Where a plugin keeps its skills, and the one file each of them is. The host writes
 * both — see `src-tauri/src/bundles/system.rs`. */
const SKILLS_DIR = "skills"
const SKILL_NAME = "SKILL.md"

/** The frontmatter of a skill file, and everything after it. A file carrying none
 * matches nothing, which is a file this reader has no skill to offer from. */
const FRONTMATTER = /^\s*---\n([\s\S]*?)\n---\n/

const NAME_KEY = "name"
const PRELOAD_KEY = "preload"
const MARKED = "true"

export type PreloadedSkill = {
	name: string
	body: string
}

/** A scalar as it went in: the host writes every value it owns as a quoted JSON
 * string, so a name carrying a quotation mark or a colon reads back as the reader
 * typed it. Anything else — a bare scalar a hand wrote, `true` among them — is its
 * own text. */
const unquoted = (value: string): string => {
	try {
		const parsed: unknown = JSON.parse(value)
		return typeof parsed === "string" ? parsed : value
	} catch {
		return value.replace(/^"|"$/g, "")
	}
}

/** A frontmatter key's scalar, read the way the host reads one: lines are trimmed, so
 * a key nested in a map answers under its own name — which is how the preload mark is
 * found inside `metadata.opennest`. */
const frontValue = (front: string, key: string): string | undefined => {
	const named = front
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith(`${key}:`))
	return named && unquoted(named.slice(key.length + 1).trim())
}

/** A file that is not there, or not readable, is a skill this reader does not offer
 * rather than a session that does not open. */
const fileText = (file: string): string => {
	try {
		return readFileSync(file, "utf8")
	} catch {
		return ""
	}
}

/** The skill in a directory, and only when its frontmatter asks to be carried. A name
 * the frontmatter does not carry is the directory's own, so a skill still reaches the
 * prompt under something a reader recognises. */
const preloadedIn = (
	skillsDir: string,
	id: string,
): PreloadedSkill | undefined => {
	const text = fileText(join(skillsDir, id, SKILL_NAME))
	const matched = FRONTMATTER.exec(text)
	if (!matched) {
		return undefined
	}
	const [head, front] = matched
	if (frontValue(front, PRELOAD_KEY) !== MARKED) {
		return undefined
	}
	return {
		name: frontValue(front, NAME_KEY) || id,
		body: text.slice(head.length).trim(),
	}
}

/** Every skill of the app's plugin marked for preloading, in the order the disk names
 * them: two sessions opened on the same plugin are told the same thing. A path with no
 * `skills/` directory, or one nothing is marked in, carries none — a session then opens
 * on the layer alone rather than not at all. */
export const preloadedSkills = (systemPluginPath: string): PreloadedSkill[] => {
	const skillsDir = join(systemPluginPath, SKILLS_DIR)
	try {
		return readdirSync(skillsDir)
			.sort()
			.flatMap((id) => preloadedIn(skillsDir, id) ?? [])
	} catch {
		return []
	}
}
