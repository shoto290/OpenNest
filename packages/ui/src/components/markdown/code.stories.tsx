import { expect, spyOn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	elementNode,
	MarkdownProse,
	textNode,
} from "@workspace/storybook/story-utils"
import {
	MarkdownCode,
	MarkdownPre,
} from "@workspace/ui/components/markdown/code"

const TYPESCRIPT_SOURCE = `import { readNest } from "@example/core"

export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}`

const UNKNOWN_LANGUAGE_SOURCE = `nest nest_42 {
	occupants 3
	archived no
}`

const LONG_SOURCE = Array.from(
	{ length: 240 },
	(_, index) => `export const nest${index} = { occupants: ${index % 7} }`,
).join("\n")

const fenceNode = (source: string, language?: string) =>
	elementNode("pre", [
		elementNode("code", [textNode(`${source}\n`)], {
			className: language ? [`language-${language}`] : [],
		}),
	])

const unfencedNode = elementNode("pre", [
	elementNode("span", [textNode("nest_42")]),
])

const paintedTokens = (fence: HTMLElement) =>
	fence.querySelectorAll("[style*='--code-token-light']").length

const meta = preview.meta({
	title: "AI/MarkdownCode",
	component: MarkdownPre,
	parameters: {
		docs: {
			description: {
				component:
					"The two renderers `<Markdown>` gives the parser for code. `MarkdownPre` takes a fenced block and paints it through the bundled highlighter, with a copy control that hands back the source byte for byte — read from the hast node, because a token tree cannot be copied back to text. `MarkdownCode` takes an inline span and keeps the parser's own markup, except for the one label `remark-math` writes, which is typeset rather than quoted. Both are wired through `MARKDOWN_COMPONENTS`; a screen never mounts them directly. Two fence labels never reach either one: `math` and `mermaid` take their own renderer.",
			},
		},
	},
	args: { node: fenceNode(TYPESCRIPT_SOURCE, "typescript") },
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A labelled fence, the shape an agent writes most. Check that the tokens are coloured in both themes — flip the theme layout toolbar to side-by-side — that the scroll viewport stops short of the copy control so no line hides behind it, and that tabbing into the block lights the viewport ring before reaching the button.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await expect(
			canvas.getByRole("group", { name: "Code snippet, typescript" }),
		).toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Copy code" }))
		await expect(writeText).toHaveBeenCalledWith(TYPESCRIPT_SOURCE)

		writeText.mockRestore()
	},
})

export const UnknownLanguage = meta.story({
	args: { node: fenceNode(UNKNOWN_LANGUAGE_SOURCE, "nestscript") },
	parameters: {
		docs: {
			description: {
				story:
					"A fence label is free-form, so an author can type one no grammar answers for. The block falls back to plain text rather than guessing a grammar, and the label the author typed is kept in the accessible name. Check that the source reads monochrome without losing its indentation, and that the copy control still returns the exact source.",
			},
		},
	},
	play: async ({ canvas }) => {
		const fence = canvas.getByRole("group", {
			name: "Code snippet, nestscript",
		})

		await expect(fence.textContent).toContain("occupants 3")
	},
})

export const BeyondHighlightBudget = meta.story({
	args: { node: fenceNode(LONG_SOURCE, "typescript") },
	parameters: {
		docs: {
			description: {
				story:
					"240 lines, past the budget where tokenising the whole fence would hold the first frame. Such a fence paints its source first and takes its colours on the pass after, so a long answer appears at once instead of after the highlighter. Check that every line is on screen from the start and that the colours land without the block jumping.",
			},
		},
	},
	play: async ({ canvas }) => {
		const fence = canvas.getByRole("group", {
			name: "Code snippet, typescript",
		})

		await expect(fence.textContent).toContain("nest239")
		await waitFor(() => expect(paintedTokens(fence)).toBeGreaterThan(0))
	},
})

export const WithoutFencedSource = meta.story({
	args: { node: unfencedNode, children: "nest_42" },
	parameters: {
		docs: {
			description: {
				story:
					"The fallback branch: a `pre` the parser did not build from a fence carries no code child, so there is no source to copy and no label to highlight against. The renderer steps aside and hands back the parser's own markup. Check that the block keeps the prose code surface instead of collapsing to bare text.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
		await expect(canvas.getByText("nest_42")).toBeInTheDocument()
	},
})

export const InlineCode = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`MarkdownCode` inside running prose. Nothing is added to the parser output here — the chip, its ring and its 0.9em size come from the prose class the renderer owns — so the same span reads on the page and on every bubble variant. Check that the chip sits on the text baseline instead of pushing the line box open.",
			},
		},
	},
	render: () => (
		<p>
			Call <MarkdownCode>readNest(id)</MarkdownCode> before{" "}
			<MarkdownCode>summarise(id)</MarkdownCode>, never the other way around.
		</p>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByText("readNest(id)")).toBeInTheDocument()
	},
})
