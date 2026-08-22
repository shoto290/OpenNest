import { describe, expect, it } from "vitest"

import { toRelativeTime } from "@workspace/ui/lib/relative-time"

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0)

const ago = (ms: number, locale = "en") => toRelativeTime(NOW - ms, locale, NOW)

describe("toRelativeTime", () => {
	it("reads a moment at the largest distance that fits it", () => {
		expect(ago(90_000)).toBe("1 minute ago")
		expect(ago(7_200_000)).toBe("2 hours ago")
		expect(ago(172_800_000)).toBe("2 days ago")
		expect(ago(1_209_600_000)).toBe("2 weeks ago")
		expect(ago(63_072_000_000)).toBe("2 years ago")
	})

	it("says now for anything under a minute", () => {
		expect(ago(0)).toBe("now")
		expect(ago(45_000)).toBe("now")
	})

	it("says it in the language it is asked in", () => {
		expect(ago(7_200_000, "fr")).toBe("il y a 2 heures")
	})
})
