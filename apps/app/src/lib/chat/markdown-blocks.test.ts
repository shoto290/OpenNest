import { describe, expect, it } from "vitest"

import { isTableBlock } from "./markdown-blocks"

const TABLE = "| § | Subject |\n| --- | --- |\n| 1 | The mental model |"

describe("isTableBlock", () => {
	it("reads a header, its dashes and the rows below as a table", () => {
		expect(isTableBlock(TABLE)).toBe(true)
	})

	it("takes a table whose columns declare their alignment", () => {
		expect(isTableBlock("| a | b |\n| :-- | --: |\n| 1 | 2 |")).toBe(true)
	})

	it("takes a table written without its outer pipes", () => {
		expect(isTableBlock("a | b\n--- | ---\n1 | 2")).toBe(true)
	})

	it("takes a header with no row under it yet", () => {
		expect(isTableBlock("| a | b |\n| --- | --- |")).toBe(true)
	})

	it("leaves a paragraph that happens to hold pipes alone", () => {
		expect(isTableBlock("Run `a | b`\nthen `c | d`")).toBe(false)
	})

	it("leaves a table with a sentence above it alone", () => {
		expect(isTableBlock(`Here is what it holds:\n${TABLE}`)).toBe(false)
	})

	it("leaves a table with a sentence below it alone", () => {
		expect(isTableBlock(`${TABLE}\nAnd that is all of it.`)).toBe(false)
	})

	it("leaves an indented code sample alone", () => {
		expect(isTableBlock("    | a | b |\n    | --- | --- |")).toBe(false)
	})

	it("leaves a single line alone", () => {
		expect(isTableBlock("| a | b |")).toBe(false)
	})
})
