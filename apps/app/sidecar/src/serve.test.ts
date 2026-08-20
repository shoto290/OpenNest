import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./providers/claude/build"
import { EXECUTABLE_OVERRIDE_ENV } from "./providers/claude/executable"
import { DEFAULT_PROVIDER_ID } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

/** Run from source there is no bundle beside the sidecar, so the executable it
 * spawns is named explicitly rather than resolved from a build tree. */
const environment = {
	...process.env,
	[EXECUTABLE_OVERRIDE_ENV]: claudeSourceExecutable(),
}

const served = async (commands: string[]) => {
	const child = Bun.spawn(["bun", entrypoint, "--serve"], {
		env: environment,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	})
	child.stdin.write(commands.map((command) => `${command}\n`).join(""))
	await child.stdin.end()
	const [stdout, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	])
	return {
		exitCode,
		lines: stdout
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line)),
	}
}

describe("serve", () => {
	it("announces the provider and its capabilities before any session", async () => {
		const { lines } = await served([])

		expect(lines[0].type).toBe("ready")
		expect(lines[0].provider).toBe(DEFAULT_PROVIDER_ID)
		expect(lines[0].capabilities).toContain("partialMessages")
	})

	it("survives a line it cannot read and keeps serving", async () => {
		const { exitCode, lines } = await served([
			"this is not json",
			JSON.stringify({ type: "close", session: "never-opened" }),
		])

		expect(exitCode).toBe(0)
		expect(lines.at(-1).type).toBe("unreadable")
	})

	it("answers the sign-in probe with a verdict and no identity", async () => {
		const { lines } = await served([JSON.stringify({ type: "check" })])
		const checked = lines.at(-1)

		expect(checked.type).toBe("check")
		expect(typeof checked.authenticated).toBe("boolean")
		// The probe reads an email, an organisation and a subscription type. None of
		// them may reach the pipe: a verdict and, at most, why there is none.
		expect(
			Object.keys(checked).filter(
				(key) => !["type", "authenticated", "detail"].includes(key),
			),
		).toEqual([])
	})

	it("answers the catalogue with the labels the provider offers", async () => {
		const { lines } = await served([JSON.stringify({ type: "models" })])
		const catalogue = lines.at(-1)

		expect(catalogue.type).toBe("models")
		expect(Array.isArray(catalogue.models)).toBe(true)
	})

	it("leaves on the host's EOF", async () => {
		const { exitCode } = await served([
			JSON.stringify({ type: "prompt", session: "never-opened", text: "hi" }),
		])

		expect(exitCode).toBe(0)
	})
})
