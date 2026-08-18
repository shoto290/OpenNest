import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Markdown } from "@workspace/ui/components/markdown"

const FOOTNOTE_SOURCE = "Claim[^1]\n\n[^1]: the proof\n"

const ALIGNED_TABLE =
	"| left | centre | right | default |\n| :--- | :---: | ---: | --- |\n| a | b | c | d |"

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

const tokenColours = (html: string, theme: "light" | "dark") =>
	capturedValues(html, new RegExp(`--code-token-${theme}:([^;"]+)`, "g"))

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
		expect(html).toContain('data-slot="markdown-table"')
		expect(html).toContain("<thead><tr><th")
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

	/** One-line fences, so every colour captured belongs to the same line: a grammar that
	 * failed to resolve paints that line in one colour and fails the count. */
	const HIGHLIGHTED_FENCES = [
		"```ts\nconst nest = 1\n```",
		"```rust\nlet nest: usize = 1;\n```",
		"```python\nnest = read_nest(42)\n```",
		"```css\n.nest { color: red; }\n```",
		'```html\n<p class="nest">hi</p>\n```',
		"```yaml\nnest: 42\n```",
		"```md\n# Nest **42**\n```",
	]

	it.each(HIGHLIGHTED_FENCES)("paints more than one colour in %j", (source) => {
		const html = render(source)

		expect(new Set(tokenColours(html, "light")).size).toBeGreaterThan(1)
		expect(new Set(tokenColours(html, "dark")).size).toBeGreaterThan(1)
	})

	it("shows a long fence as source text before painting it", () => {
		const source = Array.from(
			{ length: 240 },
			(_, index) => `const nest${index} = ${index}`,
		).join("\n")
		const html = render(`\`\`\`ts\n${source}\n\`\`\``)

		expect(html).toContain("const nest239 = 239")
		expect(tokenColours(html, "light")).toEqual([])
	})

	it("renders an unknown fence label as its source text, unpainted", () => {
		const html = render("```elixir\n%{id: nest.id}\n```")

		expect(html).toContain("%{id: nest.id}")
		expect(new Set(tokenColours(html, "light"))).toEqual(
			new Set(["currentColor"]),
		)
	})
})

describe("markdown tables", () => {
	it("keeps every declared column alignment", () => {
		const html = render(ALIGNED_TABLE)

		expect(html.match(/text-align:left/g)).toHaveLength(2)
		expect(html.match(/text-align:center/g)).toHaveLength(2)
		expect(html.match(/text-align:right/g)).toHaveLength(2)
	})

	it("frames the table in a scrollable region with a copy action", () => {
		const html = render(ALIGNED_TABLE)

		expect(html).toContain('aria-label="Table"')
		expect(html).toContain('aria-label="Copy table"')
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
