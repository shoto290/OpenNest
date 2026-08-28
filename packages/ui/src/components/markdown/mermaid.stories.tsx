import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import { MarkdownMermaid } from "@workspace/ui/components/markdown/mermaid"

const FLOWCHART_SOURCE = `flowchart TD
	A["Read the nest"] --> B{"Any occupants?"}
	B -- none --> C["Archive the record"]
	B -- some --> D["Summarise the roster"]
	D --> E["Notify the owner"]`

const WIDE_SOURCE = `flowchart LR
	A["Receive the sync request"] --> B["Read every occupant record"]
	B --> C["Reconcile arrivals and departures"]
	C --> D["Recompute the occupancy counts"]
	D --> E["Write the report for the owner"]`

const MALFORMED_SOURCE = `flowchart TD
	A["Read the nest"] --> {{`

const DIAGRAM_ARRIVES = { timeout: 10_000 }

const diagramsIn = (canvasElement: HTMLElement) =>
	[
		...canvasElement.querySelectorAll('[role="group"][aria-label="Diagram"]'),
	].flatMap((frame) => [...(frame.shadowRoot?.querySelectorAll("svg") ?? [])])

const meta = preview.meta({
	title: "Conversation/Markdown/MarkdownMermaid",
	component: MarkdownMermaid,
	parameters: {
		docs: {
			description: {
				component:
					"Draws the diagram a `mermaid` fence declares. Mermaid is fetched on mount, so a document without a diagram never loads it, and the source holds the block until the drawing replaces it — a source mermaid cannot parse keeps that same source on screen instead of throwing. Colours are baked into the SVG, so the diagram is redrawn when the theme under it changes, read from the host itself rather than from the document: two themes side by side each get their own. Mermaid ships a stylesheet with every diagram, prefixed selectors and unprefixed keyframes alike, so the drawing goes into a shadow root — its CSS reaches this diagram and nothing else, while the tokens and the type it inherits still cross the boundary.",
			},
		},
	},
	args: { source: FLOWCHART_SOURCE },
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A flowchart, the diagram an agent reaches for most. The frame takes the hairline edge the markdown table already uses, and it is a tab stop so a keyboard can scroll it. Check that the palette follows the surface theme — flip the theme layout toolbar to side-by-side and confirm both are drawn — and that nothing mermaid ships leaks into the page around it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			DIAGRAM_ARRIVES,
		)

		const [diagram] = diagramsIn(canvasElement)

		await expect(diagram.textContent).toContain("Read the nest")
	},
})

export const WiderThanTheBlock = meta.story({
	args: { source: WIDE_SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"A left-to-right chain wider than the block that carries it. The diagram keeps its natural width rather than scaling every label down to fit, so the frame scrolls on its own axis and the block never grows. Check that the labels stay legible at their drawn size and that focusing the frame lights its edge before scrolling with the arrow keys.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await waitFor(
			() => expect(diagramsIn(canvasElement)).toHaveLength(1),
			DIAGRAM_ARRIVES,
		)

		const viewport = canvas.getByRole("group", { name: "Diagram" })

		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
	},
})

export const Unparseable = meta.story({
	args: { source: MALFORMED_SOURCE },
	parameters: {
		docs: {
			description: {
				story:
					"An edge that points nowhere — a diagram cut mid-stream reads exactly like this. Mermaid reports the failure by drawing nothing, so the frame stays hidden and the source stands in its place on the code surface. Check that nothing throws, that no error graphic of mermaid's own appears, and that the source keeps the indentation it was written with.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("group", { name: "Diagram" }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText(/Read the nest/)).toBeInTheDocument()
	},
})
