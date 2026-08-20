import { accessSync, constants, statSync } from "node:fs"
import { dirname, join } from "node:path"

import { bundledExecutableName } from "./executable-name"

/** The executable the sidecar spawns instead of the one shipped beside it.
 * Reserved for a run that has no bundle of its own — a test, or a developer
 * running the sidecar from source. */
export const EXECUTABLE_OVERRIDE_ENV = "OPENNEST_CLAUDE_EXECUTABLE"

/** What puts the executable where a build tree keeps it. Named in the failure so
 * a sidecar that found none says how to make one instead of only where it
 * looked. */
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

/** Every place the executable can be, in the order it is looked for. Both are
 * answered with a stat: nothing here reads the file or fingerprints it. */
const candidates = ({ directory, override }: Lookup) => {
	const beside = join(directory, bundledExecutableName())
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
