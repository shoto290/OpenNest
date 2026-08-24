import { accessSync, constants, statSync } from "node:fs"
import { dirname, join } from "node:path"

import { BUNDLED_EXECUTABLE_NAME } from "./executable-name"

export const EXECUTABLE_OVERRIDE_ENV = "OPENNEST_CLAUDE_EXECUTABLE"

const BUILD_COMMAND = "bun run --filter sidecar build"

type Lookup = {
	directory: string
	override?: string
}

const isSpawnable = (path: string) => {
	try {
		accessSync(path, constants.X_OK)
		return statSync(path).isFile()
	} catch {
		return false
	}
}

const candidates = ({ directory, override }: Lookup) => {
	const beside = join(directory, BUNDLED_EXECUTABLE_NAME)
	return override ? [override, beside] : [beside]
}

export const resolveExecutableIn = (lookup: Lookup) => {
	const searched = candidates(lookup)
	const found = searched.find(isSpawnable)
	if (!found) {
		throw new Error(
			`No spawnable Claude Code executable at ${searched.join(", ")}. Run \`${BUILD_COMMAND}\` or point $${EXECUTABLE_OVERRIDE_ENV} at one.`,
		)
	}
	return found
}

export const resolveExecutable = () =>
	resolveExecutableIn({
		directory: dirname(process.execPath),
		override: process.env[EXECUTABLE_OVERRIDE_ENV],
	})
