import { expect, spyOn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"

const HEADINGS = `# Nest report
## Occupants
### Arrivals
#### Departures
##### Pending checks
###### Metadata

A paragraph between two headings, so the vertical rhythm is visible.

# Nest with \`readNest()\``

const EMPHASIS = `The sync is **required**, the retry is _optional_, and the old flag is ~~deprecated~~.

Call \`readNest(id)\` before \`summarise(id)\`, never the other way around.`

const LISTS = `Unordered:

- occupants
- arrivals
- departures

Ordered:

1. read the nest
2. summarise it
3. archive it`

const NESTED_LIST = `- occupants
	- resident
		- arrived this week
		- arrived last week
	- visitor
- structure
	- roof
		- repaired`

const TASK_LIST = `- [x] read the nest
- [x] summarise the occupants
- [ ] archive the record
- [ ] notify the owner`

const BLOCKQUOTE = `> The sync ran twice and the second pass found nothing.

Followed by prose.

> An outer quote
>
> > holding an inner one.`

const TABLE_IN_BLOCKQUOTE = `> Counts as of the last sync:
>
> | nest | occupants | archived |
> | --- | --- | --- |
> | nest_42 | 3 | no |
> | nest_43 | 0 | yes |
>
> Two rows changed since yesterday.`

const TABLE = `| nest | occupants | status | archived |
| :--- | ---: | :---: | --- |
| nest_42 | 3 | active | no |
| nest_43 | 0 | empty | yes |
| nest_44 | 12 | active | no |`

const WIDE_TABLE = `| nest | occupants | joined | left | role | invited by | last sync | note |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| nest_42 | 3 | 2026-01-04 | — | resident | nest_01 | 2026-08-18 09:12 | rejoined after the archive pass |
| nest_43 | 0 | 2025-11-27 | 2026-02-02 | visitor | nest_42 | 2026-08-18 09:12 | last occupant left before the sync |
| nest_44 | 12 | 2024-07-19 | — | resident | nest_01 | 2026-08-17 23:58 | the widest roster on record |`

const NARROW_TABLE = `| nest | occupants |
| --- | ---: |
| nest_42 | 3 |`

/** Every cell a spreadsheet could choke on. The `\t` is a real tab inside one
 * cell — the character that separates fields, sitting inside one of them. */
const AWKWARD_TABLE = `| cell | copies as |
| --- | --- |
| **bold** with \`code\` | inline markdown, flattened |
| left\tright | one field, not two |
| ![nest crest](nest-crest.png) | the alt text |
| pipe \\| inside | the escaped pipe |
|  | an empty field |`

const AWKWARD_TSV = [
	"cell\tcopies as",
	"bold with code\tinline markdown, flattened",
	"left right\tone field, not two",
	"nest crest\tthe alt text",
	"pipe | inside\tthe escaped pipe",
	"\tan empty field",
].join("\n")

const CODE = `Inline \`bun run storybook\` starts it, the fence carries the file:

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\``

const THEMATIC_BREAK = `The first pass finished.

---

The second pass started.`

const FOOTNOTES = `The sync dedupes on the client id[^dedupe], not on the timestamp[^clock].

[^dedupe]: Set in \`useTranscriptSocket\` before the cache merge.
[^clock]: Two hosts can disagree by seconds.`

const AUTOLINKS = `Docs live at https://opennest.dev and issues go to nest@opennest.dev.

An explicit [link](https://opennest.dev/changelog) reads the same.`

const HOSTILE = `<script>alert("nest")</script>

<style>body { display: none }</style>

<iframe src="https://evil.test"></iframe>

<img src="x" onerror="alert('nest')" />

[looks like a link](javascript:alert('nest'))

Prose after the payload still renders.`

const MALFORMED = `# unclosed **bold and \`code

| nest | occupants
| ---
| nest_42

[broken](https://opennest.dev

:::unknown-block
content
:::`

const FULL = `# Nest report

The sync ran **twice** and the second pass found ~~nothing~~ one change[^1].

## Occupants

1. read the nest
2. summarise it
	- resident
		- arrived this week

Progress:

- [x] read the nest
- [ ] archive the record

> | nest | occupants |
> | --- | --- |
> | nest_42 | 3 |

---

Run \`bun run test\` — docs at https://opennest.dev.

[^1]: nest_43 lost its last occupant.`

const USER_BLOCK = `Run \`bun run test\` before merging — the dedupe now lives in \`useTranscriptSocket\`, next to the cache merge, and not in the store:

\`\`\`bash
bun run test --project=unit
\`\`\``

const alignmentOf = (cell: HTMLElement) => getComputedStyle(cell).textAlign

/** The box the bubble clips against: if the table frame ever loses its clamp,
 * this is what starts scrolling. */
const bubbleContentOf = (canvasElement: HTMLElement) =>
	canvasElement.querySelector(
		'[data-slot="message-bubble-content"]',
	) as HTMLElement

const fragmentOf = (reference: HTMLElement) =>
	reference.getAttribute("href")?.slice(1) ?? ""

const definitionFor = (canvasElement: HTMLElement, fragment: string) =>
	canvasElement.querySelector(`[id="${fragment}"]`)

const meta = preview.meta({
	title: "AI/Markdown",
	component: Markdown,
	parameters: {
		docs: {
			description: {
				component:
					"Renders one markdown block — the payload of a single chat bubble — as GFM. Every author goes through the same allowlist: raw `script`, `style` and `iframe` never reach the tree, `on*` attributes and `javascript:` URLs are dropped, so user prose and agent prose are equally safe. Typography comes from the prose class this module owns, which MessageBubbleContent also applies, so a block reads the same inside or outside a bubble. Tables are framed, scrollable and copyable through `markdown/table.tsx`; syntax highlighting in the flow and link cards are still deliberately absent, each waiting on its own renderer module at `markdown/code.tsx` and `markdown/link.tsx`.",
			},
		},
	},
	args: { children: FULL },
	argTypes: { children: { control: "text" } },
	decorators: [
		(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>,
	],
})

export const Playground = meta.story({})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every construction at once, the way a long agent answer arrives. Check the vertical rhythm between blocks, that the first block has no top margin, and that headings, quote and footnote section all read in both themes — flip the theme layout toolbar to side-by-side.",
			},
		},
	},
})

export const Headings = meta.story({
	args: { children: HEADINGS },
	parameters: {
		docs: {
			description: {
				story:
					"Six levels plus a heading carrying inline code. Check that the scale stays legible at chat size — h1 and h2 take the slab heading face, h4 steps down in weight, h5 and h6 dim to a secondary tone — and that the code chip inside a heading keeps the heading weight while shrinking to 0.9em instead of breaking the line box.",
			},
		},
	},
})

export const Emphasis = meta.story({
	args: { children: EMPHASIS },
	parameters: {
		docs: {
			description: {
				story:
					"Bold, italic, strikethrough and inline code inside running prose. Check that struck text dims instead of disappearing, and that a code chip is readable on both the light and the dark surface.",
			},
		},
	},
})

export const Lists = meta.story({
	args: { children: LISTS },
	parameters: {
		docs: {
			description: {
				story:
					"Ordered and unordered lists after a lead-in paragraph. Check that the markers sit inside the content column rather than hanging into the gutter, and that the gap between a paragraph and the list it introduces stays tighter than the gap between two blocks.",
			},
		},
	},
})

export const NestedList = meta.story({
	args: { children: NESTED_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"Three levels of nesting. Check that each level changes marker — disc, circle, square — so depth is readable without counting indents, and that a nested list hugs its parent item instead of taking a full block margin.",
			},
		},
	},
})

export const TaskList = meta.story({
	args: { children: TASK_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"A GFM checklist as an agent reports progress. The boxes are read-only by design — the transcript is a record, not a form — so they render disabled and keep their checked state for screen readers. Check that the list marker is gone and that the box aligns with the first line of its label.",
			},
		},
	},
	play: async ({ canvas }) => {
		const boxes = canvas.getAllByRole("checkbox")

		await expect(boxes).toHaveLength(4)
		await expect(boxes[0]).toBeChecked()
		await expect(boxes[0]).toBeDisabled()
	},
})

export const Blockquote = meta.story({
	args: { children: BLOCKQUOTE },
	parameters: {
		docs: {
			description: {
				story:
					"A quote, prose, then a quote inside a quote. Check that the rule and the dimmed text mark the quote without boxing it, and that the nested level indents from the outer rule instead of restarting at the margin.",
			},
		},
	},
})

export const TableInBlockquote = meta.story({
	args: { children: TABLE_IN_BLOCKQUOTE },
	parameters: {
		docs: {
			description: {
				story:
					"The mixed case that breaks naive renderers: a GFM table nested in a quote, between two quoted paragraphs. Check that the framed table stays inside the quote rule, that the quote keeps its dimmed colour across the cells, and that the frame shrinks to the table rather than filling the quote.",
			},
		},
	},
})

export const Table = meta.story({
	args: { children: TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"All three declared alignments — left, right, centre — plus a column that declares none. Check that each column body follows its own header, that the undeclared column reads left rather than centred, and that the rules and the header fill hold in both themes: they are mixed from the foreground, so the same table reads on the page and on a solid bubble. Hover the table to raise the copy button.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [left, right, centre, plain] = canvas.getAllByRole("columnheader")

		await expect(alignmentOf(left)).toBe("left")
		await expect(alignmentOf(right)).toBe("right")
		await expect(alignmentOf(centre)).toBe("center")
		await expect(alignmentOf(plain)).toBe("left")
	},
})

export const TableWide = meta.story({
	args: { children: WIDE_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"Eight columns in a column built for prose. The table keeps every cell on one line and scrolls on its own axis instead of squeezing each column into wrapped fragments. Check that the frame stops at the container edge, that the scroll ends flush with the last column, and that `Tab` reaches the table itself — the viewport is a tab stop with a visible ring, so the arrow keys scroll it without a mouse.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })

		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)

		await userEvent.tab()
		await expect(viewport).toHaveFocus()

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Copy table" }),
		).toHaveFocus()
	},
})

export const TableNarrow = meta.story({
	args: { children: NARROW_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The other end: two short columns. The frame shrinks to the table rather than stretching a hairline box across the whole bubble, so a small table reads as a small object. Check that nothing scrolls here.",
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })

		await expect(viewport.scrollWidth).toBe(viewport.clientWidth)
	},
})

export const TableCopy = meta.story({
	args: { children: AWKWARD_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The copy action against the cells that break a naive extraction: inline markdown, an escaped pipe, an image with no text of its own, an empty cell, and a literal tab sitting inside a field. The clipboard is stubbed so the story never touches the real one. Every row must copy as exactly two fields — the tab inside a cell flattens to a space rather than opening a third column, and the image yields its alt text rather than a hole. Check that the button is reachable by keyboard, that the icon swaps to a check, and that the result is announced in the polite live region rather than by the icon alone.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await userEvent.click(canvas.getByRole("button", { name: "Copy table" }))

		await expect(writeText).toHaveBeenCalledWith(AWKWARD_TSV)
		await expect(
			await canvas.findByText("Table copied to clipboard"),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const TableInBubble = meta.story({
	args: { children: WIDE_TABLE },
	parameters: {
		docs: {
			description: {
				story:
					"The host case: a table wider than the bubble that carries it. The bubble must not grow to fit the table and must not spill it — the table scrolls inside it. Check that the frame sits inside the bubble padding and that the copy button clears the bubble edge.",
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })
		const content = bubbleContentOf(canvasElement)

		await expect(content.scrollWidth).toBe(content.clientWidth)
		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
	},
})

export const CodeFence = meta.story({
	args: { children: CODE },
	parameters: {
		docs: {
			description: {
				story:
					"Inline code next to a fenced block. The fence keeps its `language-ts` class so the highlighting ticket can pick it up in `markdown/code.tsx`; today it renders monochrome. Check that a long line scrolls inside the block instead of stretching the column, and that the code inside the fence drops the inline chip background.",
			},
		},
	},
})

export const ThematicBreak = meta.story({
	args: { children: THEMATIC_BREAK },
	parameters: {
		docs: {
			description: {
				story:
					"A horizontal rule between two passages. Check that the rule uses the border token — visible on light, not glaring on dark — and that it breathes more than a paragraph gap.",
			},
		},
	},
})

export const Footnotes = meta.story({
	args: { children: FOOTNOTES },
	parameters: {
		docs: {
			description: {
				story:
					"Two footnotes and the section GFM appends. Check that each reference jumps to its definition and back — the ids are scoped to this block, so the anchor resolves inside it and nowhere else — and that the section reads as an aside: rule on top, smaller dimmed text.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const fragment = fragmentOf(canvas.getByRole("link", { name: "1" }))

		await expect(fragment).not.toBe("")
		await expect(definitionFor(canvasElement, fragment)).toBeInTheDocument()
		await expect(canvas.getByText("Footnotes")).toBeInTheDocument()
	},
})

export const FootnotesTwice = meta.story({
	args: { children: FOOTNOTES },
	parameters: {
		docs: {
			description: {
				story:
					"Two blocks on one page, each carrying its own footnotes — the shape a transcript takes. Footnote ids are fixed strings in GFM, so they are scoped per block: check that clicking the first reference of the second block scrolls to that block's definition instead of jumping back up to the first one.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<Markdown {...args} />
			<Markdown {...args} />
		</div>
	),
	play: async ({ canvas, canvasElement }) => {
		const fragments = canvas.getAllByRole("link", { name: "1" }).map(fragmentOf)

		await expect(new Set(fragments).size).toBe(fragments.length)
		for (const fragment of fragments) {
			await expect(definitionFor(canvasElement, fragment)).toBeInTheDocument()
		}
	},
})

export const Autolinks = meta.story({
	args: { children: AUTOLINKS },
	parameters: {
		docs: {
			description: {
				story:
					"A bare URL, a bare email and an explicit link. Check that all three underline identically — a reader should not be able to tell which one was typed as markdown — and that they stay reachable by keyboard with a visible focus ring.",
			},
		},
	},
})

export const HostileMarkup = meta.story({
	args: { children: HOSTILE },
	parameters: {
		docs: {
			description: {
				story:
					"The security contract, rendered. A script, a style, an iframe, an `onerror` image and a `javascript:` link go in; nothing but the trailing paragraph and the inert link text comes out. Check that no layout collapses — a surviving `style` block would hide the page — and that the last paragraph still renders, proving the payload was dropped rather than aborting the block.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Prose after the payload still renders."),
		).toBeInTheDocument()
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
	},
})

export const Malformed = meta.story({
	args: { children: MALFORMED },
	parameters: {
		docs: {
			description: {
				story:
					"Unclosed emphasis, a truncated table, a half-written link and a block syntax we do not support — what a stream mid-flight or a distracted typist produces. Check that every line stays readable as source text: the renderer degrades to prose instead of blanking the bubble.",
			},
		},
	},
})

export const InMessageBubble = meta.story({
	args: { children: FULL },
	parameters: {
		docs: {
			description: {
				story:
					"The real host: one block inside one bubble. The bubble applies the same prose class the renderer owns, so nothing shifts when the HTML starts coming from here. Check the code chips and the quote rule against the muted bubble surface, and that long tables and fences stay inside the bubble width.",
			},
		},
	},
	render: (args) => (
		<MessageBubble>
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
})

export const InSolidBubble = meta.story({
	args: { children: USER_BLOCK },
	parameters: {
		docs: {
			description: {
				story:
					"What a reader types, in the solid bubble that carries their own turn. The bubble surface is `bg-primary`, the hardest case for a code chip: the renderer tints code from the foreground rather than the background, so the chip stays visible on amber in both themes instead of dissolving into it. Flip the theme layout toolbar to side-by-side and check the inline chip and the fence against the bubble.",
			},
		},
	},
	render: (args) => (
		<MessageBubble variant="solid" align="end">
			<MessageBubbleContent>
				<Markdown {...args} />
			</MessageBubbleContent>
		</MessageBubble>
	),
})
