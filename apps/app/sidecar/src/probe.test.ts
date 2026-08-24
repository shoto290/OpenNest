import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./providers/claude/build"
import { EXECUTABLE_OVERRIDE_ENV } from "./providers/claude/executable"
import { DEFAULT_PROVIDER_ID, PROVIDER_IDS } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

const environment = {
	...process.env,
	[EXECUTABLE_OVERRIDE_ENV]: claudeSourceExecutable(),
}

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
