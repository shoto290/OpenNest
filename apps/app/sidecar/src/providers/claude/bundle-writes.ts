import { realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path"

/** The two built-ins that put a file on disk. Anything else a bot asks for is the
 * reader's call, bundle or not. */
const WRITERS = new Set(["Write", "Edit"])

/** What the bundle is, rather than what the bot writes in it: its brief, its
 * manifest, its hooks, its servers and its history. A write to one of those is
 * still the reader's to answer. */
const RESERVED = new Set([
	"agents",
	".claude-plugin",
	"hooks",
	".git",
	".mcp.json",
])

/** The real path of what exists, extended by the names that do not yet. `Write`
 * names a file it is about to create, so the target itself is often absent — the
 * nearest existing ancestor is what resolves the symlinks and the `..` above it. */
const realOrNearest = (path: string): string => {
	try {
		return realpathSync(path)
	} catch {
		const parent = dirname(path)
		return parent === path ? path : join(realOrNearest(parent), basename(path))
	}
}

/** Whether a tool call writes inside the bot's own bundle, where the bot is free
 * to edit its own skills without asking anyone. A path outside it, a bundle-less
 * session, one of the bundle's own reserved entries, or any other tool: not this,
 * and the reader is asked as before.
 *
 * A relative `file_path` is not read against the session's working directory here,
 * which the sidecar does not run in, so it never counts as inside. */
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
	const inside = relative(realOrNearest(pluginPath), realOrNearest(target))
	if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
		return false
	}
	const [entry = ""] = inside.split(sep)
	return !RESERVED.has(entry)
}
