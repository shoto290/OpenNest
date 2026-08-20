import {
	chmodSync,
	copyFileSync,
	linkSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

import { bundledExecutableName, externalBinaryName } from "./executable-name"

import type { ProviderBuild, StageTarget } from "../provider"

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"
const EXECUTABLE_MODE = 0o755

const moduleRoot = import.meta.dir
const generatedModule = join(moduleRoot, "generated", "manifest.ts")

const sourceExecutableName = () =>
	process.platform === "win32" ? "claude.exe" : "claude"

const sdkDirectory = () => dirname(Bun.resolveSync(SDK_PACKAGE, moduleRoot))

/** Where the installed SDK keeps the native executable this build ships. Read by
 * the staging step, and by any test that has no bundle to spawn from. */
export const claudeSourceExecutable = () => {
	const specifier = `${SDK_PACKAGE}-${process.platform}-${process.arch}/${sourceExecutableName()}`
	try {
		return Bun.resolveSync(specifier, sdkDirectory())
	} catch {
		throw new Error(
			`Cannot resolve ${specifier}. Reinstall dependencies without --omit=optional so the native Claude Code binary is available.`,
		)
	}
}

type GeneratedModuleContent = {
	executableVersion: string
	sdkVersion: string
}

const writeGeneratedModule = ({
	executableVersion,
	sdkVersion,
}: GeneratedModuleContent) => {
	mkdirSync(dirname(generatedModule), { recursive: true })
	writeFileSync(
		generatedModule,
		[
			`export const EXECUTABLE_VERSION = ${JSON.stringify(executableVersion)}`,
			`export const SDK_VERSION = ${JSON.stringify(sdkVersion)}`,
			"",
		].join("\n"),
	)
}

/** Two names for one file: Tauri only reads an external binary carrying the
 * target triple, and a build tree spawns the sidecar from here under the name a
 * bundle would strip it to. A hard link so the 302 MB are paid once. */
const stageExecutable = ({ directory, targetTriple }: StageTarget) => {
	mkdirSync(directory, { recursive: true })
	const external = join(directory, externalBinaryName(targetTriple))
	const bundled = join(directory, bundledExecutableName())
	rmSync(external, { force: true })
	rmSync(bundled, { force: true })
	copyFileSync(claudeSourceExecutable(), external)
	chmodSync(external, EXECUTABLE_MODE)
	linkSync(external, bundled)
}

export const claudeBuild: ProviderBuild = {
	prepare: async () => {
		const manifest = await Bun.file(join(sdkDirectory(), "package.json")).json()
		writeGeneratedModule({
			executableVersion: manifest.claudeCodeVersion,
			sdkVersion: manifest.version,
		})
	},
	stage: stageExecutable,
}
