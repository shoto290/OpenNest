import { describe, expect, it } from "vitest"

import { isSettingsShortcut } from "@workspace/ui/hooks/use-settings-shortcut"

const chord = (event: Partial<KeyboardEvent>) =>
	isSettingsShortcut(event as KeyboardEvent)

describe("isSettingsShortcut", () => {
	it("reads Meta and Comma", () => {
		expect(chord({ key: ",", metaKey: true })).toBe(true)
	})

	it("ignores Comma on its own", () => {
		expect(chord({ key: ",", metaKey: false })).toBe(false)
	})

	it("ignores another key under Meta", () => {
		expect(chord({ key: "k", metaKey: true })).toBe(false)
	})
})
