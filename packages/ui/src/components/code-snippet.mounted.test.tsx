// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CodeSnippet } from "@workspace/ui/components/code-snippet"
import {
	isCodeLanguageWarm,
	warmCodeLanguage,
} from "@workspace/ui/lib/code-highlight"

const SOURCE = "const answer = 42"

const tokensIn = (container: HTMLElement) =>
	container.querySelectorAll("code span span").length

describe("CodeSnippet before its language is warm", () => {
	afterEach(cleanup)

	it("paints plain text, then colours it once the language warms", () => {
		expect(isCodeLanguageWarm("tsx")).toBe(false)

		const { container } = render(<CodeSnippet code={SOURCE} language="tsx" />)

		expect(container.textContent).toContain(SOURCE)
		expect(tokensIn(container)).toBe(0)

		act(() => {
			warmCodeLanguage("tsx")
		})

		expect(container.textContent).toContain(SOURCE)
		expect(tokensIn(container)).toBeGreaterThan(0)
	})
})
