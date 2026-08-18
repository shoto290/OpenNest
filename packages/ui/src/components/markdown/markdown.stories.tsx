import { expect, fn, spyOn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/chat-turn"
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

const CODE_RUST = `\`\`\`rust
pub fn summarise(nest: &Nest) -> Summary {
	let occupants = nest.occupants.iter().filter(|o| o.active).count();
	Summary { id: nest.id.clone(), occupants }
}
\`\`\``

const CODE_PYTHON = `\`\`\`python
def summarise(nest_id: str) -> dict:
	nest = read_nest(nest_id)
	return {"id": nest.id, "occupants": len(nest.occupants)}
\`\`\``

const CODE_CSS = `\`\`\`css
.nest-card {
	display: grid;
	gap: 0.5rem;
	color: var(--foreground);
}
\`\`\``

const CODE_HTML = `\`\`\`html
<article class="nest-card">
	<h2>Nest 42</h2>
	<p>3 occupants</p>
</article>
\`\`\``

const CODE_YAML = `\`\`\`yaml
nest: nest_42
occupants: 3
archived: false
\`\`\``

const CODE_MARKDOWN = `\`\`\`md
# Nest 42

- 3 occupants
- archived: **no**
\`\`\``

const CODE_UNKNOWN = `\`\`\`elixir
def summarise(nest_id) do
	nest = Nest.read(nest_id)
	%{id: nest.id, occupants: length(nest.occupants)}
end
\`\`\`

A fence with no label at all:

\`\`\`
nest_42 archived at 18:04
\`\`\``

const CODE_COPY_SOURCE = `bun run test --project=unit\n\n\tbun run lint`

const CODE_COPY = `\`\`\`bash\n${CODE_COPY_SOURCE}\n\`\`\``

const CODE_LONG_SOURCE = `\`\`\`ts
${Array.from(
	{ length: 240 },
	(_, index) =>
		`export const nest${index} = { id: "nest_${index}", occupants: ${index % 7} }`,
).join("\n")}
\`\`\``

const CODE_LONG_LINE = `\`\`\`ts
const migration = { table: "nest_occupants", columns: ["id", "nest_id", "display_name", "joined_at", "left_at", "role"], indexes: ["nest_id_joined_at"] }
\`\`\``

const THEMATIC_BREAK = `The first pass finished.

---

The second pass started.`

const FOOTNOTES = `The sync dedupes on the client id[^dedupe], not on the timestamp[^clock].

[^dedupe]: Set in \`useTranscriptSocket\` before the cache merge.
[^clock]: Two hosts can disagree by seconds.`

const AUTOLINKS = `Docs live at https://opennest.dev and issues go to nest@opennest.dev.

An explicit [link](https://opennest.dev/changelog) reads the same.`

const DESTINATIONS = `Every link carries where it goes: [the changelog](https://opennest.dev/changelog), [our roadmap](https://www.opennest.dev/roadmap), and a URL typed bare, https://opennest.dev/docs.

Mail stays with the reader: nest@opennest.dev.`

const DECEPTIVE_LINKS = `Userinfo hides the host: [https://opennest.dev@evil.test/reports](https://opennest.dev@evil.test/reports).

A text with no scheme parses as nothing: [opennest.dev/download](https://evil.test/payload).

A homograph reads as latin: [https://\u043Epennest.dev/login](https://\u043Epennest.dev/login).

Emphasis is an element, not a string: [**https://opennest.dev**](https://evil.test/steal).

A protocol-relative href would move this very window: [https://opennest.dev](//evil.test/steal).

A mailto under a web address opens a draft, not a page: [https://opennest.dev](mailto:steal@evil.test).`

const INERT_SCHEMES = `A scheme this app cannot open is not a link: [join the channel](irc://opennest.dev/nest).

Neither is a path that would resolve against this window: [settings](/settings).

Neither is a script: [looks like a link](javascript:alert('nest')).`

const LONG_URL = `https://opennest.dev/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a`

const FRAGMENT_LINK = `The counts come from the last sync[^count], and the method sits in the [summary](#summary) closing this answer.

[^count]: Measured on the client, after the cache merge.`

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

const USER_BLOCK = `Run \`bun run test\` before merging — the dedupe now lives in \`useTranscriptSocket\`, next to the cache merge, and not in the store, see [the changelog](https://opennest.dev/changelog):

\`\`\`bash
bun run test --project=unit
\`\`\``

/** One block of each kind, back to back, opened by a paragraph long enough to wrap:
 * every boundary the parser puts a newline across, in one bubble. */
const ADJACENT_BLOCKS = `The archive pass finished at 09:12, and every block below follows the one before it with nothing between them but the margin the prose rules declare.

- read the nest
- summarise the occupants
- archive the record

\`\`\`ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
\`\`\`

| nest | occupants |
| :--- | ---: |
| nest_42 | 3 |
| nest_43 | 0 |

Two nests archived since the last pass.`

/** A quote and a list item that each hold blocks of their own — the boundaries a rule
 * placed on the root alone would reach, and one placed on the leaves alone would miss. */
const NESTED_BLOCKS = `> The sync ran twice.
>
> The second pass found nothing.

1. Read the nest.

   Then summarise what it holds.

   - resident
   - visitor

2. Archive the record.`

/** Every host that carries an author's own spacing: a pasted paragraph, a padded column,
 * a list item wrapped by hand, a code span, a table cell and a quote. */
const PRESERVED_WHITESPACE = `Walk me through every package.

Start with the design system,
then the Tauri shell,
and anything crossing between them.

nest_42   active
nest_43       empty

A code span keeps its own run: \`a     b\` beside \`a b\`.

- one item, pasted
  across two lines

| cell | padded |
| --- | --- |
| a     b | a b |

> quoted line one
> and quoted line two`

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

/** What the code viewport leaves between its own edge and the copy control. */
const clearanceOf = (viewport: HTMLElement, copy: HTMLElement) =>
	copy.getBoundingClientRect().left - viewport.getBoundingClientRect().right

/** `leading-6` at chat size: the height a stray newline between two blocks would add. */
const BLANK_LINE = 24

/** What four extra spaces measure at chat size. A collapsed run measures nothing. */
const SPACE_RUN = 8

const markdownRootsOf = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll<HTMLElement>('[data-slot="markdown"]')

const gapsBetweenChildren = (element: Element) => {
	const rects = [...element.children].map((child) =>
		child.getBoundingClientRect(),
	)

	return rects.slice(1).map((rect, index) => rect.top - rects[index].bottom)
}

/** Every space the renderer left between two blocks, at any depth: a stray newline inside
 * anything holding blocks rather than words is what paints as a blank line. */
const blockGapsIn = (root: HTMLElement) =>
	[root, ...root.querySelectorAll("blockquote, li, ul, ol")].flatMap(
		gapsBetweenChildren,
	)

const contentRangeOf = (element: Element) => {
	const range = document.createRange()
	range.selectNodeContents(element)

	return range
}

/** How many lines the browser painted for this element's text, whatever the source said. */
const renderedLinesOf = (element: Element) =>
	new Set(
		[...contentRangeOf(element).getClientRects()].map(({ top }) =>
			Math.round(top),
		),
	).size

/** The width the text of an element actually took, spaces included. */
const textWidthOf = (element: Element) =>
	contentRangeOf(element).getBoundingClientRect().width

const textNodesOf = (element: Element) => {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	const nodes: Text[] = []

	while (walker.nextNode()) nodes.push(walker.currentNode as Text)

	return nodes
}

/** Where a word landed, whatever markup the renderer wrapped it in. Measured on the
 * glyph itself, so whitespace ahead of it is exactly what moves it. */
const wordLeftOf = (element: Element, word: string) => {
	const text = textNodesOf(element).find(({ data }) =>
		data.includes(word),
	) as Text
	const start = text.data.indexOf(word)
	const range = document.createRange()
	range.setStart(text, start)
	range.setEnd(text, start + word.length)

	return range.getBoundingClientRect().left
}

const paintedTokens = (fence: HTMLElement) =>
	fence.querySelectorAll("[style*='--code-token-light']").length

const meta = preview.meta({
	title: "AI/Markdown",
	component: Markdown,
	parameters: {
		docs: {
			description: {
				component:
					"Renders one markdown block — the payload of a single chat bubble — as GFM. Every author goes through the same allowlist: raw `script`, `style` and `iframe` never reach the tree, `on*` attributes and `javascript:` URLs are dropped, so user prose and agent prose are equally safe. Typography comes from the prose class this module owns, which MessageBubbleContent also applies, so a block reads the same inside or outside a bubble. A fenced block goes through the bundled highlighter and carries its own copy control, and a table is framed, scrollable and copyable through `markdown/table.tsx`. Links are read as destinations, never as text: every web link opens outside the app with no referrer and carries the host taken from its href alone, a fragment stays in the answer, a scheme the app cannot open renders as plain text, and a long link is clipped at the bubble width rather than widening it — its destination the last thing to go.",
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
					"Inline code next to a fenced block. The fence label picks the grammar and the block is tokenised through the same bundled highlighter the standalone `CodeBlock` uses — no grammar is fetched, so the same source always paints the same colours. Check that the tokens read in both themes, that inline code keeps its chip while the fence drops it, and that the code viewport stops before the copy control instead of running under it.",
			},
		},
	},
})

export const CodeFenceRust = meta.story({
	args: { children: CODE_RUST },
	parameters: {
		docs: {
			description: {
				story:
					"Rust, the language of the Tauri host. Check that `pub fn`, the borrow and the closure are coloured apart from the identifiers, and that the sample keeps its shape at chat size.",
			},
		},
	},
})

export const CodeFencePython = meta.story({
	args: { children: CODE_PYTHON },
	parameters: {
		docs: {
			description: {
				story:
					"Python, the most common fence a model reaches for after TypeScript. Check that the keyword, the type hints and the dict literal separate, and that the indentation survives the token spans.",
			},
		},
	},
})

export const CodeFenceCss = meta.story({
	args: { children: CODE_CSS },
	parameters: {
		docs: {
			description: {
				story:
					"CSS, the language a bot answers styling questions in. Check that the selector, the properties and the `var()` reference are told apart, so a custom property is readable at a glance.",
			},
		},
	},
})

export const CodeFenceHtml = meta.story({
	args: { children: CODE_HTML },
	parameters: {
		docs: {
			description: {
				story:
					"Markup inside a fence — the case where highlighting and sanitizing meet. The tags are code, never elements: check that the snippet renders as text with coloured tags and attributes, and that nothing in it reaches the DOM as markup.",
			},
		},
	},
})

export const CodeFenceYaml = meta.story({
	args: { children: CODE_YAML },
	parameters: {
		docs: {
			description: {
				story:
					"YAML, the shape a config answer takes. Check that keys, string values and booleans separate, and that the two-space rhythm of the source is preserved.",
			},
		},
	},
})

export const CodeFenceMarkdown = meta.story({
	args: { children: CODE_MARKDOWN },
	parameters: {
		docs: {
			description: {
				story:
					"Markdown inside markdown, written with the `md` alias. Check that the fence shows the source — heading marker, list markers and the literal asterisks — instead of rendering it as a heading and a list.",
			},
		},
	},
})

export const CodeFenceUnknownLanguage = meta.story({
	args: { children: CODE_UNKNOWN },
	parameters: {
		docs: {
			description: {
				story:
					"A fence for a grammar we do not bundle. Check that the block renders the source verbatim in the foreground colour instead of blanking or throwing on the missing grammar — a fence with no label at all lands here too.",
			},
		},
	},
})

export const CodeFenceOverflow = meta.story({
	args: { children: CODE_LONG_LINE },
	parameters: {
		docs: {
			description: {
				story:
					"One line far wider than the bubble. Check that the fence scrolls on its own instead of stretching the bubble, that the scroll region takes focus from the keyboard with a visible ring, and that arrow keys move it.",
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
	play: async ({ canvas, userEvent }) => {
		const fence = canvas.getByRole("group", { name: /^Code snippet/ })
		const copy = canvas.getByRole("button", { name: "Copy code" })
		const bubble = fence.closest("[data-slot='message-bubble']")
		const resting = getComputedStyle(fence).boxShadow

		await expect(fence.scrollWidth).toBeGreaterThan(fence.clientWidth)
		await expect(bubble?.scrollWidth).toBe(bubble?.clientWidth)
		await expect(clearanceOf(fence, copy)).toBeGreaterThan(0)

		fence.scrollLeft = fence.scrollWidth

		await expect(fence.scrollLeft).toBeGreaterThan(0)
		await expect(clearanceOf(fence, copy)).toBeGreaterThan(0)

		await userEvent.tab()

		await expect(fence).toHaveFocus()
		await expect(getComputedStyle(fence).boxShadow).not.toBe(resting)
	},
})

export const CodeFenceCopy = meta.story({
	args: { children: CODE_COPY },
	parameters: {
		docs: {
			description: {
				story:
					"The copy affordance a fence carries, driven here through a stubbed clipboard so the story never touches the real one. The source keeps a blank line and a tab so the assertion is byte-level: check that the button is reachable by keyboard, that its name swaps to Copied, and that what leaves is exactly what the author typed — not the highlighted markup, not a retabbed line, not the trailing newline the parser adds.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = fn()
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		})

		await userEvent.click(canvas.getByRole("button", { name: "Copy code" }))
		await canvas.findByRole("button", { name: "Copied" })
		Reflect.deleteProperty(navigator, "clipboard")

		await expect(writeText).toHaveBeenCalledWith(CODE_COPY_SOURCE)
	},
})

export const CodeFenceLongSource = meta.story({
	args: { children: CODE_LONG_SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"240 lines — past the budget where tokenising the whole fence would hold the first frame. Such a fence paints its source text first and takes its colours on the pass after, so a long answer appears at once instead of after the highlighter. Check that every line is there from the start and that the colours land without the block jumping.",
			},
		},
	},
	play: async ({ canvas }) => {
		const fence = canvas.getByRole("group", { name: /^Code snippet/ })

		await expect(fence.textContent).toContain("nest239")
		await waitFor(() => expect(paintedTokens(fence)).toBeGreaterThan(0))
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
					"A bare URL, a bare email and an explicit link. What the parser inferred gets the same treatment as what an author typed: both web links leave in a new window with no referrer and state their host, while the email opens a mail client in place rather than an empty tab. Check that all three underline identically — a reader should not be able to tell which one was typed as markdown — and that they stay reachable by keyboard with a visible focus ring.",
			},
		},
	},
	play: async ({ canvas }) => {
		const autolink = canvas.getByRole("link", {
			name: "https://opennest.dev (opennest.dev)",
		})

		await expect(autolink).toHaveAttribute("target", "_blank")
		await expect(autolink).toHaveAttribute("rel", "noreferrer noopener")
		await expect(
			canvas.getByRole("link", { name: "nest@opennest.dev" }),
		).not.toHaveAttribute("target")
	},
})

export const Destinations = meta.story({
	args: { children: DESTINATIONS },
	parameters: {
		docs: {
			description: {
				story:
					"The rule, stated plainly: a web link always ends with the host its href resolves to, whether the text is a label, a subdomain or the URL itself. Nothing is compared, so nothing can be fooled — the repetition on a bare URL is the price of never guessing. The host separates itself by weight and parentheses rather than by a dimmer colour: a destination is what a reader checks before clicking, so it never trades contrast for hierarchy, least of all on a solid bubble. Ahead of it sits the favicon, asked of one service for every host and never of the host itself — a link must not tell its destination that a message was read, from which address, at what time. The icon is decoration and nothing more: it is artwork the destination controls, and a site imitating another serves the icon it imitates, so the host spelled out beside it stays the part that cannot lie. Check that mail keeps the reader inside their own client, and that the mark reaches neither a screen reader nor a copied transcript.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("link", { name: "the changelog (opennest.dev)" }),
		).toHaveAttribute("target", "_blank")
		await expect(
			canvas.getByRole("link", { name: "our roadmap (www.opennest.dev)" }),
		).toBeInTheDocument()
	},
})

export const DestinationsWithoutIcons = meta.story({
	args: { children: DESTINATIONS },
	parameters: {
		docs: {
			description: {
				story:
					"The same links with the icon service unreachable — offline, behind a CSP, or simply slow. Each icon leaves the tree the moment it fails and gives the host initial back its place: a broken image paints a broken image, and a transcript is not the place for one. Check that the mark keeps its size so no line shifts as icons arrive or fail, and that the destination is unchanged either way.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		for (const link of canvas.getAllByRole("link")) {
			link.querySelector("img")?.dispatchEvent(new Event("error"))
		}

		await waitFor(() =>
			expect(canvasElement.querySelectorAll("a img")).toHaveLength(0),
		)
		await expect(
			canvas.getByRole("link", { name: "the changelog (opennest.dev)" }),
		).toBeInTheDocument()
	},
})

export const DeceptiveLinks = meta.story({
	args: { children: DECEPTIVE_LINKS },
	parameters: {
		docs: {
			description: {
				story:
					"The six pairs a review used to defeat comparing text with href. Userinfo, a missing scheme, a punycode homograph, emphasis instead of a plain string, a protocol-relative href aimed at this very window, and a mailto wearing a web address — each one reads truthfully now, because the host comes from the href and the text is never consulted. Check that the homograph reports its punycode form, and that the protocol-relative link leaves in a new window instead of replacing the app.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByText("(evil.test)")).toHaveLength(4)
		await expect(canvas.getByText("(xn--pennest-8ig.dev)")).toBeInTheDocument()
		await expect(
			canvas.getByRole("link", { name: "https://opennest.dev" }),
		).not.toHaveAttribute("target")
	},
})

export const InertSchemes = meta.story({
	args: { children: INERT_SCHEMES },
	parameters: {
		docs: {
			description: {
				story:
					"Only http, https, mailto, tel and a same-document fragment stay clickable. An unknown scheme, a path that would resolve against the app window and a script URL all keep their words and lose their anchor. Check that the text reads as prose — no underline, no pointer, nothing to click — and that the sentence around it is untouched.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("link")).not.toBeInTheDocument()
		await expect(canvas.getByText(/join the channel/)).toBeInTheDocument()
	},
})

export const LongUrl = meta.story({
	args: { children: LONG_URL },
	parameters: {
		docs: {
			description: {
				story:
					"A signed report URL pasted alone, the shape that stretches a bubble across the transcript. The URL is clipped with an ellipsis at the bubble width and the destination follows it, wrapping to a second line rather than being cut: the one part a reader cannot afford to lose is where the link goes. Check that the bubble keeps the width of the surrounding turns and that the host reads in full.",
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
		const link = canvas.getByRole("link")
		const host = canvas.getByText("(opennest.dev)")
		const text = link.firstElementChild as HTMLElement
		const bubble = canvasElement.querySelector(
			'[data-slot="message-bubble-content"]',
		) as HTMLElement

		await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
		await expect(host.scrollWidth).toBe(host.clientWidth)
		await expect(host.getBoundingClientRect().right).toBeLessThanOrEqual(
			Math.ceil(bubble.getBoundingClientRect().right),
		)
	},
})

export const FragmentLink = meta.story({
	args: { children: FRAGMENT_LINK },
	parameters: {
		docs: {
			description: {
				story:
					"A footnote reference, its backlink and an explicit `#` link. None of them leaves the app, so none opens a window and none states a host: they move the reader inside the answer they are already reading. Check that the footnote reference and the return arrow both scroll within the block.",
			},
		},
	},
	play: async ({ canvas }) => {
		const inDocument = canvas
			.getAllByRole("link")
			.filter((link) => link.getAttribute("href")?.startsWith("#"))

		await expect(inDocument.length).toBeGreaterThan(1)
		for (const link of inDocument) {
			await expect(link).not.toHaveAttribute("target")
		}
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
					"What a reader types, in the solid bubble that carries their own turn. The bubble surface is `bg-primary`, the hardest case for a code chip and for a link destination: both are tinted from the foreground rather than the background, so the chip and the host stay visible on amber in both themes instead of dissolving into it. Flip the theme layout toolbar to side-by-side and check the inline chip, the fence and the dimmed host against the bubble.",
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

export const AdjacentBlocks = meta.story({
	args: { children: ADJACENT_BLOCKS },
	parameters: {
		docs: {
			description: {
				story:
					"Paragraph, list, fence and table one after another, in the two turns a transcript is made of. A turn sets `whitespace-pre-wrap` so a pasted prompt keeps what its author typed, and the parser leaves a newline between every two blocks — inherited by the container holding them, each of those newlines paints as a blank line. The containers collapse it instead, so the only space between two blocks is the margin the prose rules declare, while the opening paragraph still wraps on words at the bubble edge and the fence keeps its tabs from `pre` alone. Check that the rhythm is identical on the solid bubble and the muted one.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<UserTurn>
				<Markdown {...args} />
			</UserTurn>
			<AssistantTurn>
				<Markdown {...args} />
			</AssistantTurn>
		</div>
	),
	play: async ({ canvasElement }) => {
		const roots = markdownRootsOf(canvasElement)

		await expect(roots).toHaveLength(2)

		for (const root of roots) {
			const [opening] = root.querySelectorAll("p")
			const [code] = root.querySelectorAll('[data-slot="markdown-fence"] code')
			const [signature, body] = code.children

			await expect(Math.max(...blockGapsIn(root))).toBeLessThan(BLANK_LINE)
			await expect(renderedLinesOf(opening)).toBeGreaterThan(1)
			await expect(opening.scrollWidth).toBe(opening.clientWidth)
			await expect(renderedLinesOf(code)).toBe(4)
			await expect(wordLeftOf(body, "const")).toBeGreaterThan(
				wordLeftOf(signature, "export"),
			)
		}
	},
})

export const NestedBlocks = meta.story({
	args: { children: NESTED_BLOCKS },
	parameters: {
		docs: {
			description: {
				story:
					"The same boundary one level down: a quote holding two paragraphs, and a numbered item holding a paragraph and a list of its own. A list item is the one element that is both a container and a leaf — it collapses only once it wraps its content in blocks, which is exactly when a newline inside it would show. Check that the quote reads as two paragraphs rather than four, and that the nested list sits under its item at the same rhythm as any other pair of blocks.",
			},
		},
	},
	render: (args) => (
		<AssistantTurn>
			<Markdown {...args} />
		</AssistantTurn>
	),
	play: async ({ canvasElement }) => {
		const [root] = markdownRootsOf(canvasElement)

		await expect(root.querySelectorAll("blockquote p")).toHaveLength(2)
		await expect(Math.max(...blockGapsIn(root))).toBeLessThan(BLANK_LINE)
	},
})

export const PreservedWhitespace = meta.story({
	args: { children: PRESERVED_WHITESPACE },
	parameters: {
		docs: {
			description: {
				story:
					"What the reader typed, kept: a paste broken across three lines, a column padded to line up, a list item wrapped by hand, a code span holding a run of spaces, a table cell holding another, and a quote written across two lines. Whitespace is markup between blocks and text inside them, so only what holds blocks collapses it — every leaf here reads it as the author's. A proportional face cannot make padded columns meet, but it must not swallow the padding either. Check that nothing reflows into fewer lines than it was written on.",
			},
		},
	},
	render: (args) => (
		<UserTurn>
			<Markdown {...args} />
		</UserTurn>
	),
	play: async ({ canvasElement }) => {
		const [root] = markdownRootsOf(canvasElement)
		const [, pasted, padded, spans] = root.querySelectorAll("p")
		const [item] = root.querySelectorAll("li")
		const [paddedCode, plainCode] = spans.querySelectorAll("code")
		const [paddedCell, plainCell] = root.querySelectorAll("td")
		const [quoted] = root.querySelectorAll("blockquote p")

		await expect(renderedLinesOf(pasted)).toBe(3)
		await expect(renderedLinesOf(padded)).toBe(2)
		await expect(
			wordLeftOf(padded, "empty") - wordLeftOf(padded, "active"),
		).toBeGreaterThan(SPACE_RUN)
		await expect(renderedLinesOf(item)).toBe(2)
		await expect(
			textWidthOf(paddedCode) - textWidthOf(plainCode),
		).toBeGreaterThan(SPACE_RUN)
		await expect(
			textWidthOf(paddedCell) - textWidthOf(plainCell),
		).toBeGreaterThan(SPACE_RUN)
		await expect(renderedLinesOf(quoted)).toBe(2)
	},
})
