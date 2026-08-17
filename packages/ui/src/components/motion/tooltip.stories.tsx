import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { Tooltip } from "@workspace/ui/components/motion/tooltip"

const SIDES = ["top", "right", "bottom", "left"] as const

const meta = preview.meta({
	title: "Primitives/Tooltip",
	component: Tooltip,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The label a control earns only once it is pointed at or focused. It clones its single child to listen for hover and focus, then draws the bubble in a portal at fixed viewport coordinates, so it escapes every ancestor's overflow and stacking context and stays pinned while the page scrolls. It describes, it never names: an icon-only control still needs its own `aria-label`, and the tooltip is wired as `aria-describedby` only while it is on screen. Hover-capable pointers only — a tap would leave it stuck open — and under reduced motion it fades in place instead of spawning. Reach for `Button`'s `tooltip` prop rather than this directly wherever the trigger is a button.",
			},
		},
	},
	args: { side: "top" },
	argTypes: {
		content: { control: "text" },
		side: { control: "inline-radio", options: SIDES },
		delay: { control: { type: "number", min: 0, step: 20 } },
	},
})

export const Playground = meta.story({
	args: {
		content: "Copy",
		children: <Button variant="outline">Hover me</Button>,
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Hover me" })

		await userEvent.hover(trigger)
		await waitFor(() =>
			expect(document.body.querySelector('[role="tooltip"]')).toBeVisible(),
		)

		await userEvent.unhover(trigger)
		await waitFor(() =>
			expect(document.body.querySelector('[role="tooltip"]')).toBeNull(),
		)
	},
})

export const Sides = meta.story({
	render: () => (
		<Row>
			{SIDES.map((side) => (
				<Tooltip key={side} side={side} content={`Opens ${side}`}>
					<Button variant="outline">{side}</Button>
				</Tooltip>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every side the bubble can take. Check that each one spawns from the edge of its trigger it is named for and settles a hair away from it, and that moving straight from one trigger to the next skips the opening delay — a warm toolbar should feel instant after the first label.",
			},
		},
	},
})

export const Keyboard = meta.story({
	render: () => (
		<Row>
			<Tooltip content="Copy">
				<Button variant="ghost" size="icon-xs" aria-label="Copy">
					<Icons.Copy />
				</Button>
			</Tooltip>
			<Tooltip content="Retry">
				<Button variant="ghost" size="icon-xs" aria-label="Retry">
					<Icons.Retry />
				</Button>
			</Tooltip>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Icon-only controls, reached by keyboard. Check that tabbing to one opens its label and leaving closes it, and that each button announces its own name from `aria-label` — the tooltip only ever describes, so a control that leans on it alone is unnamed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getByRole("button", { name: "Copy" })).toHaveFocus()
		await waitFor(() =>
			expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent(
				"Copy",
			),
		)
	},
})

export const LongContent = meta.story({
	render: () => (
		<Tooltip content="Copies the whole answer, not just this paragraph">
			<Button variant="outline">Copy</Button>
		</Tooltip>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A label longer than its trigger. The bubble never wraps, so check that a sentence this long still centres on the button rather than pushing it around, and keep labels to a few words — anything that needs a line break belongs in the interface, not in a tooltip.",
			},
		},
	},
})
