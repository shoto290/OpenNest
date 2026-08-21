import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./providers/claude/build"
import { EXECUTABLE_OVERRIDE_ENV } from "./providers/claude/executable"
import { DEFAULT_PROVIDER_ID, PROVIDER_IDS } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

/** Run from source there is no bundle beside the sidecar to resolve. */
const environment = {
	...process.env,
	[EXECUTABLE_OVERRIDE_ENV]: claudeSourceExecutable(),
}

/** The probe never runs the provider executable, it only resolves its path and
 * reads the generated manifest: 140ms on an idle machine, 1s beside every other
 * suite of the repository. */
const SIDECAR_TIMEOUT = 10_000

type ProbeResult = {
	exitCode: number
	stdout: string
	stderr: string
}

const runProbe = async (extraArguments: string[]): Promise<ProbeResult> => {
	const child = Bun.spawn(["bun", entrypoint, "--probe", ...extraArguments], {
		env: environment,
		stdout: "pipe",
		stderr: "pipe",
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	])
	return { exitCode, stdout, stderr }
}

describe("probe", () => {
	it(
		"falls back to the default provider when none is requested",
		async () => {
			const { exitCode, stdout } = await runProbe([])

			expect(exitCode).toBe(0)
			expect(JSON.parse(stdout).provider).toBe(DEFAULT_PROVIDER_ID)
		},
		SIDECAR_TIMEOUT,
	)

	it(
		"reports the provider executable version and the sdk version apart",
		async () => {
			const { stdout } = await runProbe([])
			const { version, sdkVersion, capabilities } = JSON.parse(stdout)

			expect(version).not.toBe(sdkVersion)
			expect(capabilities.length).toBeGreaterThan(0)
		},
		SIDECAR_TIMEOUT,
	)

	it(
		"rejects an unknown provider with the known identifiers",
		async () => {
			const { exitCode, stderr } = await runProbe(["--provider=codex"])

			expect(exitCode).toBe(64)
			expect(stderr).toContain('Unknown provider "codex"')
			expect(stderr).toContain(`Known providers: ${PROVIDER_IDS.join(", ")}`)
		},
		SIDECAR_TIMEOUT,
	)
})
