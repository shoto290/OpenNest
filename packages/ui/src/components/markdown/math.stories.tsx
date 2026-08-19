import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import { MarkdownMath } from "@workspace/ui/components/markdown/math"

const DISPLAY_SOURCE = "\\sum_{i=1}^{n} o_i = \\frac{3n}{4}"

const INLINE_SOURCE = "n = 40"

const MALFORMED_SOURCE = "\\frac{1}{"

const TYPESETTER_ARRIVES = { timeout: 10_000 }

const meta = preview.meta({
	title: "AI/MarkdownMath",
	component: MarkdownMath,
	parameters: {
		docs: {
			description: {
				component:
					"Typesets one expression, the `$…$` or `$$…$$` a `remark-math` node carries. KaTeX and its stylesheet are fetched on mount, so a document without math never loads them: until the typesetter lands the expression stands as the text the author typed, in the box the typeset version will take, and the block around it holds its place. That same text is what stays for a source KaTeX cannot parse and for one that would cost more than an expression may — nothing is ever thrown and the block is never blanked. `trust` is off, so no command in a source can reach the output whoever wrote it.",
			},
		},
	},
	args: { source: DISPLAY_SOURCE, display: true },
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`display` on: the expression takes a block of its own and KaTeX centres it. Glyphs paint in `currentColor`, so one render reads in both themes — flip the theme layout toolbar to side-by-side. Check that an expression wider than the block scrolls on its own axis instead of widening it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() =>
				expect(
					canvasElement.querySelector(".katex-display"),
				).toBeInTheDocument(),
			TYPESETTER_ARRIVES,
		)
	},
})

export const Inline = meta.story({
	args: { source: INLINE_SOURCE, display: false },
	parameters: {
		docs: {
			description: {
				story:
					"`display` off: the expression is a span inside running prose, replaced in place once the typesetter lands. Check that it sits on the text baseline rather than pushing the line box open, and that the paragraph keeps its box while the source is swapped for the render.",
			},
		},
	},
	render: (args) => (
		<p>
			The sync covered <MarkdownMath {...args} /> nests, one of them empty.
		</p>
	),
	play: async ({ canvasElement }) => {
		await waitFor(
			() => expect(canvasElement.querySelectorAll(".katex")).toHaveLength(1),
			TYPESETTER_ARRIVES,
		)
	},
})

export const Unparseable = meta.story({
	args: { source: MALFORMED_SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"An unclosed fraction — what a stream mid-flight produces. Nothing throws and nothing is blanked: the source the author typed stays on screen, flagged in the destructive tone. The same text is what an expression past the cost bounds falls back to. Check that the failure reads as text rather than as a gap in the answer.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() =>
				expect(
					canvasElement.querySelectorAll(".katex-error").length,
				).toBeGreaterThan(0),
			TYPESETTER_ARRIVES,
		)
	},
})
