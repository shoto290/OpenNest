import { describe, expect, it } from "bun:test"

import { singleAssetName } from "./build"

describe("singleAssetName", () => {
	it("keeps the only declared asset name", () => {
		expect(singleAssetName(["claude"])).toBe("claude")
	})

	it("accepts providers sharing one asset name", () => {
		expect(singleAssetName(["claude", "claude"])).toBe("claude")
	})

	it("fails when providers collide on different asset names", () => {
		expect(() => singleAssetName(["claude", "codex"])).toThrow(
			"bun build accepts one asset naming pattern, providers requested claude, codex",
		)
	})
})
