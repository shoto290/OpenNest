import { accessSync, constants, statSync } from "node:fs"

import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract"

import { describeError } from "../../describe-error"
import { EMBEDDED_EXECUTABLE_PATH } from "./generated/embedded"

const isVirtualPath = (path: string) =>
	path.includes("$bunfs") || path.includes("~BUN")

const assertSpawnable = (path: string) => {
	try {
		if (!statSync(path).isFile()) {
			throw new Error("not a regular file")
		}
		accessSync(path, constants.X_OK)
	} catch (error) {
		throw new Error(
			`Extracted Claude Code executable at ${path} is not spawnable: ${describeError(error)}`,
		)
	}
}

export const resolveExecutable = () => {
	const extracted = extractFromBunfs(EMBEDDED_EXECUTABLE_PATH)
	if (isVirtualPath(extracted)) {
		throw new Error(
			`Embedded Claude Code executable stayed inside the compiled binary at ${extracted} and cannot be spawned as a child process`,
		)
	}
	assertSpawnable(extracted)
	return extracted
}
