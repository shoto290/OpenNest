const BASE_NAME = "opennest-claude"

export const EXECUTABLE_EXTENSION = process.platform === "win32" ? ".exe" : ""

/** The name the executable answers to once Tauri has bundled it: the target
 * triple is stripped, so a shipped app only carries the one it runs on. */
export const BUNDLED_EXECUTABLE_NAME = `${BASE_NAME}${EXECUTABLE_EXTENSION}`

/** The name Tauri reads an external binary under before it bundles one. */
export const externalBinaryName = (targetTriple: string) =>
	`${BASE_NAME}-${targetTriple}${EXECUTABLE_EXTENSION}`
