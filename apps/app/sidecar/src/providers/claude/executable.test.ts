import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveExecutableIn } from "./executable"
import { bundledExecutableName } from "./executable-name"

const spawnable = (path: string) => {
	writeFileSync(path, "#!/bin/sh\n")
	chmodSync(path, 0o755)
	return path
}

describe("resolveExecutableIn", () => {
	let directory: string

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "opennest-executable-"))
	})

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true })
	})

	it("takes the executable shipped beside the sidecar", () => {
		const beside = spawnable(join(directory, bundledExecutableName()))

		expect(resolveExecutableIn({ directory })).toBe(beside)
	})

	it("prefers an override over what ships beside the sidecar", () => {
		spawnable(join(directory, bundledExecutableName()))
		const override = spawnable(join(directory, "elsewhere"))

		expect(resolveExecutableIn({ directory, override })).toBe(override)
	})

	it("falls back to what ships beside the sidecar when the override is gone", () => {
		const beside = spawnable(join(directory, bundledExecutableName()))
		const override = join(directory, "never-written")

		expect(resolveExecutableIn({ directory, override })).toBe(beside)
	})

	it("refuses anything that is not a regular file", () => {
		const beside = join(directory, bundledExecutableName())
		mkdirSync(beside)

		expect(() => resolveExecutableIn({ directory })).toThrow(beside)
	})

	it("names every path it looked at when there is none", () => {
		const override = join(directory, "never-written")

		expect(() => resolveExecutableIn({ directory, override })).toThrow(
			`No spawnable Claude Code executable at ${override}, ${join(directory, bundledExecutableName())}`,
		)
	})
})
