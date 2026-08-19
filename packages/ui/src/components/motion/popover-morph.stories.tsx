import { useState } from "react"
import { expect, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import { Button } from "@workspace/ui/components/button"
import {
	MorphPopover,
	MorphPopoverContent,
	MorphPopoverTrigger,
} from "@workspace/ui/components/motion/popover-morph"

const SIDES = ["bottom", "top"] as const
const ALIGNS = ["end", "start"] as const
const SIDE_OFFSETS = [0, 8, 24]
const RADII = [4, 16, 28]

const Panel = () => (
	<div className="w-56 p-3 text-sm">
		<p className="font-medium text-foreground">Session storage</p>
		<p className="mt-1 text-muted-foreground text-xs leading-5">
			Transcripts are kept on this machine until you clear them.
		</p>
	</div>
)

const ControlledPopover = () => {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col items-center gap-3">
			<MorphPopover open={open} onOpenChange={setOpen}>
				<MorphPopoverTrigger>
					<Button variant="outline">Details</Button>
				</MorphPopoverTrigger>
				<MorphPopoverContent>
					<Panel />
				</MorphPopoverContent>
			</MorphPopover>
			<p className="text-muted-foreground text-xs">
				Panel is {open ? "open" : "closed"}
			</p>
		</div>
	)
}

const meta = preview.meta({
	title: "Overlays/MorphPopover",
	component: MorphPopover,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A panel that appears to grow out of the corner of its trigger. It is laid out at full size from the first frame, then clipped down to the corner nearest the trigger and unclipped as one piece — so nothing inside reflows while it opens, and the text never reads as stretching. The panel is portalled to `document.body` at fixed viewport coordinates, which is what lets it escape an overflow or a stacking context an ancestor imposes. Closes on Escape and on an outside press; controlled through `open` or left to itself with `defaultOpen`. The trigger clones its single child to carry `aria-haspopup`, `aria-expanded` and `aria-controls`, so pass a real button rather than a `div`. Under `prefers-reduced-motion` the panel simply appears at full opacity — no fade, because half-transparent text on the page is both unreadable and motion the reader opted out of. Reach for it for a panel a reader interacts with; a label that only describes belongs in `Tooltip`.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<MorphPopover>
			<MorphPopoverTrigger>
				<Button variant="outline">Storage</Button>
			</MorphPopoverTrigger>
			<MorphPopoverContent>
				<Panel />
			</MorphPopoverContent>
		</MorphPopover>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a button, a panel below it, aligned to its right edge. Check that the panel unfolds from the corner closest to the trigger rather than from its own centre, that the shadow follows the clipped shape while it grows, and that Escape closes it — a reader who opened it by accident must be able to leave from the keyboard.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Storage" })

		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(trigger)
		await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
	},
})

export const Placements = meta.story({
	render: () => (
		<div className="grid grid-cols-2 gap-6 py-24">
			{SIDES.map((side) =>
				ALIGNS.map((align) => (
					<MorphPopover key={`${side}-${align}`}>
						<MorphPopoverTrigger>
							<Button variant="outline">{`${side} · ${align}`}</Button>
						</MorphPopoverTrigger>
						<MorphPopoverContent side={side} align={align}>
							<Panel />
						</MorphPopoverContent>
					</MorphPopover>
				)),
			)}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every combination of `side` and `align`. The clip corner and the transform origin are both derived from the pair, so the panel always grows out of the corner it is anchored to — open each one and check the growth starts where the trigger touches the panel, never from the far corner. There is no automatic flip here: pick the pair that keeps the panel on screen at the size the trigger actually sits.",
			},
		},
	},
})

export const Offsets = meta.story({
	render: () => (
		<Row>
			{SIDE_OFFSETS.map((sideOffset) => (
				<MorphPopover key={sideOffset}>
					<MorphPopoverTrigger>
						<Button variant="outline">{`${sideOffset}px`}</Button>
					</MorphPopoverTrigger>
					<MorphPopoverContent sideOffset={sideOffset}>
						<Panel />
					</MorphPopoverContent>
				</MorphPopover>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`sideOffset`, the gap between trigger and panel. At 0 the panel reads as an extension of the button, which suits a menu; the 8px default reads as a separate surface, which suits anything a reader has to fill in. Past roughly 24px the link between the two breaks and the panel starts looking unanchored.",
			},
		},
	},
})

export const Radii = meta.story({
	render: () => (
		<Row>
			{RADII.map((radius) => (
				<MorphPopover key={radius}>
					<MorphPopoverTrigger>
						<Button variant="outline">{`${radius}px`}</Button>
					</MorphPopoverTrigger>
					<MorphPopoverContent radius={radius}>
						<Panel />
					</MorphPopoverContent>
				</MorphPopover>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`radius` has to be set through the prop rather than through a class: the same number drives the border radius, the clip-path's rounding and the shadow's shape, so a Tailwind rounding class alone would round the box while the clip stayed square and the corner would flash during the morph. Check that no corner squares off mid-open at 28.",
			},
		},
	},
})

export const OpenByDefault = meta.story({
	render: () => (
		<MorphPopover defaultOpen>
			<MorphPopoverTrigger>
				<Button variant="outline">Storage</Button>
			</MorphPopoverTrigger>
			<MorphPopoverContent>
				<Panel />
			</MorphPopoverContent>
		</MorphPopover>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`defaultOpen` for a panel that is already open on first paint — a coach mark, or a panel restored with the screen. It still opens with the morph rather than appearing, since the position is only known once the portal has measured the trigger; check there is no flash at the top-left corner of the page before it lands.",
			},
		},
	},
	play: async () => {
		await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
	},
})

export const Controlled = meta.story({
	render: () => <ControlledPopover />,
	parameters: {
		docs: {
			description: {
				story:
					"`open` owned by the caller. Reach for this when something outside the popover has to close it — a route change, a save that succeeded, a second panel that must not be open at the same time. The component still reports Escape and outside presses through `onOpenChange`, so the caller stays the single source of truth. Check the caption follows both.",
			},
		},
	},
})

export const LongContent = meta.story({
	render: () => (
		<MorphPopover>
			<MorphPopoverTrigger>
				<Button variant="outline">Retention policy</Button>
			</MorphPopoverTrigger>
			<MorphPopoverContent>
				<div className="w-72 p-4 text-sm leading-6">
					<p className="font-medium text-foreground">Retention policy</p>
					<p className="mt-1 text-muted-foreground">
						Transcripts stay on this machine for ninety days, then move to the
						archive. Anything you pin is kept until you remove the pin, and
						clearing a workspace removes both at once.
					</p>
				</div>
			</MorphPopoverContent>
		</MorphPopover>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A panel tall enough that the clip has real distance to travel. The panel is measured at full size before it is clipped, so check the text never reflows while it opens — a paragraph that rewraps mid-morph is the tell that the width is being animated rather than the clip. Give the panel a fixed width for anything this long.",
			},
		},
	},
})
