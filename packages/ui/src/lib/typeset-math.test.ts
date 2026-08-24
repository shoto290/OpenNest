import { describe, expect, it } from "vitest"

import { typesetMath } from "@workspace/ui/lib/typeset-math"

const matrix = (size: number) => {
	const row = Array.from({ length: size }, (_, column) => column).join(" & ")
	return `\\begin{matrix}${Array.from({ length: size }, () => row).join(" \\\\ ")}\\end{matrix}`
}

describe("typeset math", () => {
	it("typesets an expression a reader can follow", () => {
		const html = typesetMath({
			display: true,
			source: "c(n) = \\sum_{i=1}^{n} \\frac{o_i}{2^{i}}",
		})

		expect(html).toContain("katex")
		expect(html.length).toBeLessThan(65_536)
	})

	it("typesets a matrix that stays inside the bounds", () => {
		expect(typesetMath({ display: true, source: matrix(8) })).toContain("katex")
	})

	it("hands back nothing when the source is past the bound", () => {
		expect(typesetMath({ display: true, source: matrix(100) })).toBe("")
	})

	it("hands back nothing when a source inside the bound would typeset past it", () => {
		const source = matrix(20)

		expect(source.length).toBeLessThan(4_096)
		expect(typesetMath({ display: true, source })).toBe("")
	})

	it("keeps the source of an expression it cannot parse", () => {
		expect(typesetMath({ display: false, source: "\\frac{1}{" })).toContain(
			"\\frac{1}{",
		)
	})
})
