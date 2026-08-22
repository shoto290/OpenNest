import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { bundleServers } from "./bundle-servers"

describe("bundleServers", () => {
	let bundle: string

	const declaring = (contents?: string) => {
		const file = join(bundle, ".mcp.json")
		if (contents === undefined) {
			rmSync(file, { force: true })
		} else {
			writeFileSync(file, contents)
		}
		return bundle
	}

	beforeEach(() => {
		bundle = mkdtempSync(join(tmpdir(), "opennest-bundle-"))
	})

	afterEach(() => {
		rmSync(bundle, { recursive: true, force: true })
	})

	it("hands over what the bundle declares, under the bundle's own names", () => {
		const declared = declaring(
			JSON.stringify({
				mcpServers: { probe: { command: "python3", args: ["server.py"] } },
				other: "left alone",
			}),
		)

		expect(bundleServers(declared)).toEqual({
			probe: { command: "python3", args: ["server.py"] },
		})
	})

	// A session opens without the server rather than not at all.
	it("declares nothing for a bundle with no file, a broken one or a map-less one", () => {
		for (const contents of [
			undefined,
			"{ not json",
			JSON.stringify({ mcpServers: ["probe"] }),
			JSON.stringify([]),
		]) {
			expect(bundleServers(declaring(contents))).toEqual({})
		}
	})
})
