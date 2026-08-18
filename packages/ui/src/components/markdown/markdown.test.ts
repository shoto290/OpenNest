import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Markdown } from "@workspace/ui/components/markdown"

const FOOTNOTE_SOURCE = "Claim[^1]\n\n[^1]: the proof\n"

const MALFORMED_TABLE = "| a | b\n| ---\n| 1"

const render = (source: string) =>
	renderToStaticMarkup(createElement(Markdown, null, source))

/** Two blocks in one tree, split back into the markup each one owns. */
const renderTwice = (source: string) =>
	renderToStaticMarkup(
		createElement(
			"div",
			null,
			createElement(Markdown, null, source),
			createElement(Markdown, null, source),
		),
	)
		.split('<div data-slot="markdown"')
		.slice(1)

const capturedValues = (html: string, pattern: RegExp) =>
	[...html.matchAll(pattern)].map(([, value]) => value)

const definitionIds = (html: string) => capturedValues(html, /id="([^"]+)"/g)

const referenceFragments = (html: string) =>
	capturedValues(html, /href="#([^"]+)"/g)

describe("markdown constructions", () => {
	it("renders headings, emphasis and inline code", () => {
		const html = render(
			"# Title with `code`\n\n**bold** _italic_ ~~struck~~ `inline`",
		)

		expect(html).toContain("<h1>Title with <code>code</code></h1>")
		expect(html).toContain("<strong>bold</strong>")
		expect(html).toContain("<em>italic</em>")
		expect(html).toContain("<del>struck</del>")
	})

	it("renders lists nested three levels deep", () => {
		const html = render("- one\n\t- two\n\t\t- three\n\n1. first\n2. second")

		expect(html).toContain("<ol>")
		expect(html.match(/<ul>/g)).toHaveLength(3)
	})

	it("renders task lists as read-only named checkboxes", () => {
		const html = render("- [x] shipped\n- [ ] pending")

		expect(html).toContain('class="task-list-item"')
		expect(html).toContain('aria-label="Done"')
		expect(html).toContain('aria-label="To do"')
		expect(html.match(/disabled=""/g)).toHaveLength(2)
		expect(html.match(/checked=""/g)).toHaveLength(1)
	})

	it("renders blockquotes, thematic breaks and tables", () => {
		const html = render(
			"> quoted\n>\n> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n\n---\n",
		)

		expect(html).toContain("<blockquote>")
		expect(html).toContain("<hr/>")
		expect(html).toContain("<table><thead><tr><th>a</th>")
	})

	it("links a footnote to its definition", () => {
		const html = render(FOOTNOTE_SOURCE)
		const [reference] = referenceFragments(html)

		expect(reference).toBeDefined()
		expect(definitionIds(html)).toContain(reference)
	})

	it("keeps footnote ids distinct across instances on one page", () => {
		const [first, second] = renderTwice(FOOTNOTE_SOURCE)

		expect(definitionIds(first)).not.toEqual(definitionIds(second))
		expect(definitionIds(first)).toContain(referenceFragments(first)[0])
		expect(definitionIds(second)).toContain(referenceFragments(second)[0])
	})

	it("renders autolinks", () => {
		const html = render("Docs at https://opennest.dev and me@opennest.dev")

		expect(html).toContain('<a href="https://opennest.dev">')
		expect(html).toContain('<a href="mailto:me@opennest.dev">')
	})

	it("renders fenced code with its language", () => {
		const html = render("```ts\nconst nest = 1\n```")

		expect(html).toContain('<pre><code class="language-ts">')
	})
})

describe("markdown sanitizing", () => {
	it("drops script, style and iframe", () => {
		const html = render(
			'<script>alert(1)</script>\n\n<style>body{display:none}</style>\n\n<iframe src="https://evil.test"></iframe>',
		)

		expect(html).not.toContain("<script")
		expect(html).not.toContain("<style")
		expect(html).not.toContain("<iframe")
		expect(html).not.toContain("alert(1)")
	})

	it("drops event handler attributes", () => {
		const html = render(
			'<img src="x" onerror="alert(1)" />\n\n<p onclick="alert(1)">tap</p>',
		)

		expect(html).not.toContain("onerror=")
		expect(html).not.toContain("onclick=")
	})

	it("drops javascript urls while keeping the link text", () => {
		const html = render("[go](javascript:alert(1)) and [safe](https://ok.test)")

		expect(html).not.toContain("javascript:")
		expect(html).toContain("go")
		expect(html).toContain('href="https://ok.test"')
	})
})

describe("markdown resilience", () => {
	const MALFORMED = [
		"# unclosed **bold and `code",
		MALFORMED_TABLE,
		"[broken](https://ok.test\n\n> quote without end",
		"- [x unclosed task\n\t- [ ]",
		"```ts\nconst never = closed",
		":::unknown-block\ncontent\n:::",
	]

	it.each(MALFORMED)("does not throw on %j", (source) => {
		expect(() => render(source)).not.toThrow()
	})

	it("keeps malformed source readable", () => {
		expect(render(MALFORMED_TABLE)).toContain("| a | b")
	})

	it("renders an empty string without content", () => {
		expect(render("")).toMatch(/^<div [^>]*><\/div>$/)
	})
})
