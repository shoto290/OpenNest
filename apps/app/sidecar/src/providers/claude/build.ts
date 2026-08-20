import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { ProviderBuild } from "../provider"

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"

const moduleRoot = import.meta.dir
const generatedModule = join(moduleRoot, "generated", "embedded.ts")

const executableName = () =>
	process.platform === "win32" ? "claude.exe" : "claude"

const sdkDirectory = () => dirname(Bun.resolveSync(SDK_PACKAGE, moduleRoot))

const nativeExecutablePath = (sdkRoot: string) => {
	const specifier = `${SDK_PACKAGE}-${process.platform}-${process.arch}/${executableName()}`
	try {
		return Bun.resolveSync(specifier, sdkRoot)
	} catch {
		throw new Error(
			`Cannot resolve ${specifier}. Reinstall dependencies without --omit=optional so the native Claude Code binary is available.`,
		)
	}
}

type GeneratedModuleContent = {
	executablePath: string
	executableVersion: string
	sdkVersion: string
}

const writeGeneratedModule = ({
	executablePath,
	executableVersion,
	sdkVersion,
}: GeneratedModuleContent) => {
	mkdirSync(dirname(generatedModule), { recursive: true })
	writeFileSync(
		generatedModule,
		[
			`import embeddedExecutablePath from ${JSON.stringify(executablePath)} with { type: "file" }`,
			"",
			"export const EMBEDDED_EXECUTABLE_PATH = embeddedExecutablePath",
			`export const EMBEDDED_EXECUTABLE_VERSION = ${JSON.stringify(executableVersion)}`,
			`export const SDK_VERSION = ${JSON.stringify(sdkVersion)}`,
			"",
		].join("\n"),
	)
}

export const claudeBuild: ProviderBuild = {
	assetName: executableName(),
	prepare: async () => {
		const sdkRoot = sdkDirectory()
		const manifest = await Bun.file(join(sdkRoot, "package.json")).json()
		writeGeneratedModule({
			executablePath: nativeExecutablePath(sdkRoot),
			executableVersion: manifest.claudeCodeVersion,
			sdkVersion: manifest.version,
		})
	},
}
