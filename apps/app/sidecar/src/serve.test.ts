import { describe, expect, it } from "bun:test"

import { DEFAULT_PROVIDER_ID } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

const served = async (commands: string[]) => {
	const child = Bun.spawn(["bun", entrypoint, "--serve"], {
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

	it("leaves on the host's EOF", async () => {
		const { exitCode } = await served([
			JSON.stringify({ type: "prompt", session: "never-opened", text: "hi" }),
		])

		expect(exitCode).toBe(0)
	})
})
