const BASE_NAME = "opennest-claude"

export const EXECUTABLE_EXTENSION = process.platform === "win32" ? ".exe" : ""

export const BUNDLED_EXECUTABLE_NAME = `${BASE_NAME}${EXECUTABLE_EXTENSION}`

export const externalBinaryName = (targetTriple: string) =>
	`${BASE_NAME}-${targetTriple}${EXECUTABLE_EXTENSION}`
