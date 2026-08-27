import { describe, expect, it } from "bun:test"

import { shortTitle } from "./title"

describe("shortTitle", () => {
	it("keeps the line the provider answered", () => {
		expect(shortTitle("Migrer la base de données")).toBe(
			"Migrer la base de données",
		)
	})

	it("keeps only the first line the provider wrote", () => {
		expect(shortTitle("A short title\nand its explanation")).toBe(
			"A short title",
		)
	})

	it("skips the blank lines the provider opened with", () => {
		expect(shortTitle("\n\n  A short title  \n")).toBe("A short title")
	})

	it("cuts a long answer down to sixty characters", () => {
		const answered = "x".repeat(120)

		expect(shortTitle(answered)).toBe("x".repeat(60))
	})

	it("answers nothing for an empty answer", () => {
		expect(shortTitle("")).toBeNull()
		expect(shortTitle("   \n  \n")).toBeNull()
	})
})
