import { realpathSync } from "node:fs"
import {
	basename,
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
	sep,
} from "node:path"

const WRITERS = new Set(["Write", "Edit"])

const RESERVED = new Set([
	"agents",
	".claude-plugin",
	"hooks",
	".git",
	".mcp.json",
	"settings.json",
])

const DOCUMENTS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"])

const isDocument = (target: string): boolean =>
	DOCUMENTS.has(extname(target).toLowerCase())

const realOrNearest = (path: string): string => {
	try {
		return realpathSync(path)
	} catch {
		const parent = dirname(path)
		return parent === path ? path : join(realOrNearest(parent), basename(path))
	}
}

export const isBundleWrite = (
	pluginPath: string | undefined,
	toolName: string,
	input: Record<string, unknown>,
): boolean => {
	if (!pluginPath || !WRITERS.has(toolName)) {
		return false
	}
	const target = input.file_path
	if (typeof target !== "string" || !isAbsolute(target)) {
		return false
	}
	if (!isDocument(target)) {
		return false
	}
	const inside = relative(realOrNearest(pluginPath), realOrNearest(target))
	if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
		return false
	}
	const [entry = ""] = inside.split(sep)
	return !RESERVED.has(entry)
}
