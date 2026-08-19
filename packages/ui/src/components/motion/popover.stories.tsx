import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/motion/popover"

const SIDES = ["top", "bottom"] as const
const ALIGNS = ["start", "center", "end"] as const

const TRIGGER_MODES = ["click", "hover"] as const

const anchorLabel = (side: string, align: string) => `${side} ${align}`

const PANEL_TITLE = "Release notes"

const PANEL_NOTE = "Bots keep their transcript when the window is reopened."

const PanelBody = () => (
	<div className="flex flex-col gap-1">
		<p className="font-medium text-sm">{PANEL_TITLE}</p>
		<p className="text-muted-foreground text-xs">{PANEL_NOTE}</p>
	</div>
)

const PANEL = (
	<>
		<PopoverTrigger>
			<Button variant="outline">{PANEL_TITLE}</Button>
		</PopoverTrigger>
		<PopoverContent aria-label={PANEL_TITLE}>
			<PanelBody />
		</PopoverContent>
	</>
)

const meta = preview.meta({
	title: "Overlays/Popover",
	component: Popover,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					'A panel that oozes out of its own trigger: the surface behind both is blurred through an SVG goo filter, so the panel grows a liquid neck on its way out and swallows it on the way back. The panel is portalled to the body at fixed viewport coordinates, which is what lets it escape a sidebar\'s overflow, and it stays mounted-but-`inert` while closed. It anchors, it does not flip — `side` and `align` are honoured literally, so place it yourself rather than expecting collision detection. `role="dialog"` carries no name of its own: always pass `aria-label` to `PopoverContent`. Under reduced motion the goo filter is dropped and the panel simply appears.',
			},
		},
	},
	args: {
		children: PANEL,
		side: "bottom",
		align: "center",
		trigger: "click",
		onOpenChange: fn(),
	},
	argTypes: {
		side: { control: "inline-radio", options: SIDES },
		align: { control: "inline-radio", options: ALIGNS },
		trigger: { control: "inline-radio", options: TRIGGER_MODES },
		sideOffset: { control: { type: "number", min: 0, step: 2 } },
		panelRadius: { control: { type: "number", min: 0, step: 2 } },
		gooStrength: { control: { type: "range", min: 0, max: 20, step: 1 } },
	},
})

export const Playground = meta.story({
	args: { children: PANEL },
	parameters: {
		docs: {
			description: {
				story:
					"The knob story: turn `gooStrength` up to see how much of the neck survives between trigger and panel, and `sideOffset` to see how far it has to stretch. Check that the panel opens on the first click and closes on the second — the trigger toggles, it does not only open — and that `onOpenChange` fires once per gesture. Pick `Open` to review the resting shape without driving it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: PANEL_TITLE })

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await expect(
			await body.findByRole("dialog", { name: PANEL_TITLE }),
		).toBeVisible()
		await expect(args.onOpenChange).toHaveBeenLastCalledWith(true)

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
	},
})

export const Open = meta.story({
	args: { children: PANEL, defaultOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"The panel already out, which is what to review the surface against: the neck has retracted, the panel edge is crisp, and the trigger still reads as a button rather than a piece of the panel. Check that the panel keeps `sideOffset` of clearance below its trigger and that `aria-expanded` starts at `true`. Pick `Playground` to watch the transition instead of its end state.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		await expect(
			canvas.getByRole("button", { name: PANEL_TITLE }),
		).toHaveAttribute("aria-expanded", "true")
		await expect(
			await body.findByRole("dialog", { name: PANEL_TITLE }),
		).toBeVisible()
	},
})

export const Placements = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every anchor the primitive exposes: two sides by three alignments, all open at once. Check that `top` panels sit above their trigger and `bottom` below, that `start` and `end` line their panel edge up with the matching trigger edge, and that none of them flips when it runs short of room — this popover honours what you asked for, so a panel that would leave the viewport is a placement to fix at the call site. Pick `Open` for one panel at review size.",
			},
		},
	},
	render: () => (
		<div className="grid grid-cols-3 gap-x-20 gap-y-28 px-16 py-24">
			{SIDES.flatMap((side) =>
				ALIGNS.map((align) => (
					<Popover
						key={anchorLabel(side, align)}
						align={align}
						defaultOpen
						side={side}
					>
						<PopoverTrigger>
							<Button variant="outline" size="sm">
								{anchorLabel(side, align)}
							</Button>
						</PopoverTrigger>
						<PopoverContent aria-label={anchorLabel(side, align)}>
							<p className="text-sm">{anchorLabel(side, align)}</p>
						</PopoverContent>
					</Popover>
				)),
			)}
		</div>
	),
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)

		for (const side of SIDES) {
			for (const align of ALIGNS) {
				const label = anchorLabel(side, align)
				const panel = await body.findByRole("dialog", { name: label })
				const trigger = body.getByRole("button", { name: label })

				await waitFor(() => {
					const panelBox = panel.getBoundingClientRect()
					const triggerBox = trigger.getBoundingClientRect()

					expect(
						side === "top"
							? triggerBox.top - panelBox.bottom
							: panelBox.top - triggerBox.bottom,
					).toBeGreaterThan(0)

					const drift =
						align === "start"
							? panelBox.left - triggerBox.left
							: align === "end"
								? panelBox.right - triggerBox.right
								: (panelBox.left + panelBox.right) / 2 -
									(triggerBox.left + triggerBox.right) / 2

					expect(Math.abs(drift)).toBeLessThanOrEqual(1)
				})
			}
		}
	},
})

export const Dismiss = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three ways out, since the panel has no close button of its own: the trigger toggles it shut, Escape dismisses it from anywhere, and a pointer landing outside dismisses it too. Check that the button beside it still receives its own click on that same gesture — dismissing must not eat the press that caused it — and that the panel is `inert` once closed, so nothing inside it can be tabbed into. Pick `Playground` for the toggle on its own.",
			},
		},
	},
	render: () => (
		<div className="flex items-center gap-4">
			<Popover>
				<PopoverTrigger>
					<Button variant="outline">{PANEL_TITLE}</Button>
				</PopoverTrigger>
				<PopoverContent aria-label={PANEL_TITLE}>
					<PanelBody />
				</PopoverContent>
			</Popover>
			<Button variant="ghost">Elsewhere</Button>
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: PANEL_TITLE })
		const elsewhere = canvas.getByRole("button", { name: "Elsewhere" })

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.keyboard("{Escape}")
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.click(elsewhere)
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
	},
})

export const OnHover = meta.story({
	args: { children: PANEL, trigger: "hover" },
	parameters: {
		docs: {
			description: {
				story:
					'Reach for `trigger="hover"` on a panel that only previews — a peek at a resource, never a form — because a pointer that wanders off closes it. Check that the panel opens on hover and on Tab, that moving the pointer from the trigger into the panel does not close it on the way across the neck, and that leaving closes it after a short grace delay. Pick the default `click` mode for anything holding an action.',
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: PANEL_TITLE })

		await userEvent.hover(trigger)
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "true"),
		)
		await expect(
			await body.findByRole("dialog", { name: PANEL_TITLE }),
		).toBeVisible()

		await userEvent.unhover(trigger)
		await waitFor(() =>
			expect(trigger).toHaveAttribute("aria-expanded", "false"),
		)
	},
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A panel far wider than the trigger it grew from. Check that it stops at the `min(92vw, 20rem)` clamp and wraps instead of running off the viewport, and that the neck still reads as coming from the trigger rather than from the middle of a wide slab. Anything longer than this belongs in a dialog — see `Overlays/Dialog`.",
			},
		},
	},
	render: () => (
		<Popover defaultOpen>
			<PopoverTrigger>
				<Button variant="outline" size="sm">
					v0.4.0
				</Button>
			</PopoverTrigger>
			<PopoverContent aria-label={PANEL_TITLE}>
				<div className="flex flex-col gap-2">
					<p className="font-medium text-sm">{PANEL_TITLE}</p>
					<p className="text-muted-foreground text-xs">
						{PANEL_NOTE} The workspace shell paints its first frame before the
						roster resolves, so a cold start no longer stares at an empty
						column, and a tool result arriving after a stop no longer takes the
						window down with it.
					</p>
				</div>
			</PopoverContent>
		</Popover>
	),
})
