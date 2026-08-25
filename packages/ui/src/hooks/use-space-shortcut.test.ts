import { describe, expect, it } from "vitest"

import { spaceRankOf } from "@workspace/ui/hooks/use-space-shortcut"

const chord = (event: Partial<KeyboardEvent>) =>
	spaceRankOf(event as KeyboardEvent)

describe("spaceRankOf", () => {
	it("reads Meta and a digit as a rank counted from one", () => {
		expect(chord({ key: "1", metaKey: true })).toBe(1)
		expect(chord({ key: "9", metaKey: true })).toBe(9)
	})

	it("ignores a digit on its own", () => {
		expect(chord({ key: "3", metaKey: false })).toBe(0)
	})

	it("ignores a zero and a key that is not a digit", () => {
		expect(chord({ key: "0", metaKey: true })).toBe(0)
		expect(chord({ key: "b", metaKey: true })).toBe(0)
	})
})
