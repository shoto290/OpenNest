import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	PreviewRail,
	type PreviewRailItem,
} from "@workspace/ui/components/motion/preview-rail"

const SECTIONS: PreviewRailItem[] = [
	{
		id: "intro",
		label: "Introduction",
		description: "What this workspace is for, in one screen.",
	},
	{
		id: "setup",
		label: "Setup",
		description: "Connect a repository and pick a default branch.",
	},
	{
		id: "agents",
		label: "Agents",
		description: "Give each agent a name, a scope and a model.",
	},
	{
		id: "review",
		label: "Review",
		description: "Approve tool calls before they touch the disk.",
	},
	{
		id: "shipping",
		label: "Shipping",
		description: "Open a pull request from a finished session.",
	},
]

const LINKS: PreviewRailItem[] = [
	{
		id: "docs",
		label: "Docs",
		ariaLabel: "Documentation, opens in a new tab",
		href: "#docs",
		target: "_blank",
		description: "Every command, with its flags.",
	},
	{
		id: "changelog",
		label: "Changelog",
		href: "#changelog",
		description: "What shipped, newest first.",
	},
	{
		id: "status",
		label: "Status",
		href: "#status",
		description: "Whether the transport is up.",
	},
]

const ControlledRail = () => {
	const [activeId, setActiveId] = useState("agents")

	return (
		<div className="flex flex-col gap-3">
			<PreviewRail
				label="Controlled sections"
				items={SECTIONS}
				activeId={activeId}
				onActiveChange={setActiveId}
				highlightActive
			/>
			<p className="text-muted-foreground text-xs">Reading {activeId}</p>
		</div>
	)
}

const meta = preview.meta({
	title: "Navigation/PreviewRail",
	component: PreviewRail,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A stack of ticks that stands in for a table of contents until a reader reaches for it. Each item is a tick whose length falls off with its distance from the one under the pointer, so the rail bulges around the cursor, and the item being pointed at names itself in a card that slides between positions on a shared layout id rather than reappearing at each stop. Every tick is a real button or anchor with its own accessible name — the ticks and the card are both `aria-hidden`, so nothing here is legible only through hover. Reach for it where a long page needs a spine that is nearly invisible at rest; where the sections must be readable without pointing, use a list. The preview follows hover and keyboard focus only, never the selection: `highlightActive` is what marks where the reader currently is. Under `prefers-reduced-motion` the ticks resize and the card moves with no transition.",
			},
		},
	},
	args: { items: SECTIONS, onActiveChange: fn(), onItemSelect: fn() },
	argTypes: {
		orientation: { control: "inline-radio", options: ["vertical", "horizontal"] },
		previewSide: { control: "inline-radio", options: ["before", "after"] },
		showPreview: { control: "boolean" },
		highlightActive: { control: "boolean" },
		itemSize: { control: { type: "range", min: 16, max: 48, step: 4 } },
		label: { control: "text" },
		items: { control: false },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: five sections, ticks at rest, no preview until the pointer arrives. Check that the bulge follows the cursor smoothly across neighbours rather than snapping tick by tick, and that the card names the item under the pointer and not the one selected.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const item = canvas.getByRole("button", { name: "Agents" })

		await userEvent.hover(item)
		await waitFor(() =>
			expect(
				canvas.getByText("Give each agent a name, a scope and a model."),
			).toBeVisible(),
		)
	},
})

export const Orientations = meta.story({
	render: () => (
		<div className="flex flex-col gap-8">
			<PreviewRail label="Vertical sections" items={SECTIONS} />
			<PreviewRail
				label="Horizontal sections"
				items={SECTIONS}
				orientation="horizontal"
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The rail on both axes. Vertical is the default and the one to reach for beside a long document — it sits in a margin that would otherwise be empty. Horizontal centres itself and lifts the card above the ticks, which suits a step indicator under a header. Note each rail is given its own `label`: two navigation landmarks with the same name are indistinguishable to anyone browsing by landmark.",
			},
		},
	},
})

export const PreviewSides = meta.story({
	render: () => (
		<div className="flex flex-col gap-8">
			<PreviewRail
				label="Card after the rail"
				items={SECTIONS}
				previewSide="after"
			/>
			<PreviewRail
				label="Card before the rail"
				items={SECTIONS}
				previewSide="before"
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Which side of the ticks the card lands on. Pick the side the page has room on: a rail pinned to the right edge needs `before` or the card runs off screen. `previewSide` is ignored on a horizontal rail, where the card always sits above the ticks.",
			},
		},
	},
})

export const WithoutPreview = meta.story({
	args: { showPreview: false, highlightActive: true },
	parameters: {
		docs: {
			description: {
				story:
					"`showPreview={false}` strips the card and leaves the ticks alone. Reach for it when the rail sits next to content that already names the section — a scroll spy beside visible headings — or where there is no room for a card at all. The ticks still bulge under the pointer, so the rail keeps its hit feedback.",
			},
		},
	},
})

export const HighlightActive = meta.story({
	args: { highlightActive: true, defaultActiveId: "review" },
	parameters: {
		docs: {
			description: {
				story:
					"`highlightActive` keeps the selected tick at full length while nothing is pointed at, so the rail shows where the reader is rather than going flat. Turn it on for a table of contents; leave it off where the rail is a launcher and no item is ever 'current'. Check the highlight moves to the pointer on hover and returns to the selection on leave.",
			},
		},
	},
})

export const AsLinks = meta.story({
	args: { items: LINKS, label: "Reference links" },
	parameters: {
		docs: {
			description: {
				story:
					"Items with an `href` render as anchors rather than buttons, so middle-click, the context menu and the status-bar preview all keep working, and the selected one reports `aria-current=\"page\"` instead of `location`. A `target=\"_blank\"` item gets `rel=\"noreferrer noopener\"` for free — and needs an `ariaLabel` saying so, since the tick cannot show it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const docs = canvas.getByRole("link", {
			name: "Documentation, opens in a new tab",
		})

		await expect(docs).toHaveAttribute("rel", "noreferrer noopener")
	},
})

export const WithCustomPreview = meta.story({
	args: {
		label: "Custom preview",
		renderPreview: (item: PreviewRailItem) => (
			<div className="w-64 rounded-2xl bg-foreground p-4 text-background">
				<p className="font-semibold text-sm">{item.label}</p>
				<p className="mt-1 text-xs leading-5 opacity-80">{item.description}</p>
			</div>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"`renderPreview` replaces the default card entirely — reach for it to show a thumbnail, a count, or anything the built-in title-and-description pair cannot carry. The card is inside an `aria-hidden` container, so whatever is rendered here is decoration: anything a reader must know belongs in the item's `ariaLabel`. Keep the width steady across items or the shared-layout move between them will read as a resize.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Setup" }))
		await waitFor(() =>
			expect(
				canvas.getByText("Connect a repository and pick a default branch."),
			).toBeVisible(),
		)
	},
})

export const Controlled = meta.story({
	render: () => <ControlledRail />,
	parameters: {
		docs: {
			description: {
				story:
					"`activeId` owned by the caller, which is what a scroll spy needs: the page decides which section is current and the rail only reports the clicks through `onActiveChange` and `onItemSelect`. Check the caption and the highlighted tick stay in step — an uncontrolled rail next to a scrolling document drifts on the first scroll.",
			},
		},
	},
})

export const SparseData = meta.story({
	args: { items: SECTIONS.slice(0, 2), label: "Two sections" },
	parameters: {
		docs: {
			description: {
				story:
					"Two items — enough to render, too few for the falloff to read as a bulge, since every tick is within one step of the pointer. Reach for a plain list below three or four items: the rail's whole argument is that it compresses a list too long to show, and at this length it only hides two labels.",
			},
		},
	},
})

export const ItemSizes = meta.story({
	render: () => (
		<div className="flex flex-col gap-8">
			<PreviewRail label="Dense rail" items={SECTIONS} itemSize={16} />
			<PreviewRail label="Roomy rail" items={SECTIONS} itemSize={40} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`itemSize` is the pitch between ticks in pixels, and it is the hit area as much as the spacing. The 24px default is already near the floor for a pointer — check that 16 is still clickable before reaching for it, and prefer trimming items over tightening the pitch on a rail a reader uses often.",
			},
		},
	},
})

export const InLayout = meta.story({
	render: () => (
		<PreviewRail label="Document sections" items={SECTIONS} highlightActive>
			<article className="max-w-prose space-y-3 pl-6">
				<h2 className="font-semibold text-foreground text-lg">Introduction</h2>
				<p className="text-muted-foreground text-sm leading-6">
					The rail sits in the margin of the document it indexes. It takes the
					width it needs and hands the rest to its children, so the page reads
					as one column with a spine rather than as two panes.
				</p>
				<p className="text-muted-foreground text-sm leading-6">
					Point at a tick: the card is drawn over this text rather than beside
					it, which is why it is hidden from readers and why nothing it says may be
					new.
				</p>
			</article>
		</PreviewRail>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The rail hosting the document it indexes through `children`. Check that the card floats over the prose without pushing it, and that the rail keeps its width when the article grows — the content sits in a `flex-1` box precisely so a long page cannot squeeze the ticks.",
			},
		},
	},
})
