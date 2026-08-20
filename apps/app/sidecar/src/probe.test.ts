import { describe, expect, it } from "bun:test"

import { DEFAULT_PROVIDER_ID, PROVIDER_IDS } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

type ProbeResult = {
	exitCode: number
	stdout: string
	stderr: string
}

const runProbe = async (extraArguments: string[]): Promise<ProbeResult> => {
	const child = Bun.spawn(["bun", entrypoint, "--probe", ...extraArguments], {
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
	it("falls back to the default provider when none is requested", async () => {
		const { exitCode, stdout } = await runProbe([])

		expect(exitCode).toBe(0)
		expect(JSON.parse(stdout).provider).toBe(DEFAULT_PROVIDER_ID)
	})

	it("reports the embedded executable version and the sdk version apart", async () => {
		const { stdout } = await runProbe([])
		const { version, sdkVersion, capabilities } = JSON.parse(stdout)

		expect(version).not.toBe(sdkVersion)
		expect(capabilities.length).toBeGreaterThan(0)
	})

	it("rejects an unknown provider with the known identifiers", async () => {
		const { exitCode, stderr } = await runProbe(["--provider=codex"])

		expect(exitCode).toBe(64)
		expect(stderr).toContain('Unknown provider "codex"')
		expect(stderr).toContain(`Known providers: ${PROVIDER_IDS.join(", ")}`)
	})
})
