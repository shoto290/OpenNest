import type { ComponentType, ReactNode } from "react"
import { useState } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AgentDisclosure } from "@workspace/ui/components/agents/agent-disclosure"
import { Button } from "@workspace/ui/components/button"

/** The primitive spreads every motion prop, a surface far wider than a story
 * drives. Narrowing it here keeps the declarations this package emits portable
 * while the stories still render the real component. */
type AgentDisclosureArgs = {
	id?: string
	open: boolean
	openHeight?: string
	transition?: { duration: number }
	children?: ReactNode
}

const Disclosure = AgentDisclosure as ComponentType<AgentDisclosureArgs>

const TRACE = [
	"Read the nest manifest",
	"Rewrote the nest card",
	"Ran the checks",
]

const LONG_TRACE = [
	...TRACE,
	"Rewrote the nest list",
	"Pruned the unused tints",
	"Regenerated the nest manifest",
	"Ran the checks again",
	"Wrote the summary",
]

type TraceProps = {
	lines?: string[]
	/** An extra row, for the one story that checks a folded trace keeps its
	 * focusable content out of the tab order. */
	children?: ReactNode
}

const Trace = ({ lines = TRACE, children }: TraceProps) => (
	<ul className="space-y-1 pt-2 text-muted-foreground text-sm">
		{lines.map((line) => (
			<li key={line}>{line}</li>
		))}
		{children ? <li>{children}</li> : null}
	</ul>
)

const Toggled = () => {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col items-start gap-2">
			<Button
				aria-expanded={open}
				aria-controls="reveal"
				onClick={() => setOpen((current) => !current)}
				size="sm"
				variant="outline"
			>
				{open ? "Hide the trace" : "Show the trace"}
			</Button>
			<AgentDisclosure id="reveal" open={open}>
				<Trace>
					<a
						className="underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
						href="https://nestbook.example/runs/482"
					>
						Open the full run
					</a>
				</Trace>
			</AgentDisclosure>
		</div>
	)
}

const meta = preview.meta({
	title: "AI/AgentDisclosure",
	component: Disclosure,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The reveal every collapsible agent surface shares: content wipes down from its top edge on the way in and clips back up on the way out, opening a touch slower than it closes so the arrival reads as content and the dismissal as gone. It animates a clip path and a 4px lift rather than the height itself, which keeps the reveal off the layout thread. Closed, it is inert and hidden from assistive tech, so a folded trace is not in the tab order. Under `prefers-reduced-motion` the wipe drops and only the opacity remains. It draws nothing: bring your own trigger, spacing and border.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-md">
				<Story />
			</div>
		),
	],
	args: {
		id: "reveal",
		open: true,
		children: <Trace />,
	},
	argTypes: {
		open: { control: "boolean" },
		openHeight: { control: "text" },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the two props it owns. Flip `open` to watch the wipe run both ways, and set `openHeight` to a fixed value when the revealed height is known before the content is. Check the wipe with the reduced-motion emulator on: the content should appear without moving.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const disclosure = canvasElement.querySelector("#reveal")

		await expect(disclosure).not.toHaveAttribute("aria-hidden", "true")
	},
})

export const Open = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The revealed state. Height resolves to `auto`, so the content sizes itself and a trace that grows while open pushes the surface below it rather than being clipped. Check that nothing inside is hidden from assistive tech and that the top edge is where the wipe originates.",
			},
		},
	},
})

export const Closed = meta.story({
	args: { open: false },
	parameters: {
		docs: {
			description: {
				story:
					"The folded state, and the reason this primitive exists rather than a `hidden` attribute: the content stays mounted — so reopening costs no remount and no refetch — while the element collapses to zero height, drops out of the accessibility tree, turns inert and stops taking pointer events. Check that it leaves no gap behind and that a screen reader never announces a folded trace.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const disclosure = canvasElement.querySelector("#reveal")

		await expect(disclosure).toHaveAttribute("aria-hidden", "true")
		await expect(disclosure).toHaveAttribute("inert")
	},
})

export const Toggle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The primitive in the shape it ships in: a trigger the surface owns, wired to `aria-expanded` and `aria-controls`, and the disclosure underneath. Check the keyboard path — the trigger takes focus, Enter opens it, and the link inside is unreachable by Tab until it does, because `inert` keeps a folded trace out of the tab order.",
			},
		},
	},
	render: () => <Toggled />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Show the trace" })
		const link = canvas.getByText("Open the full run")

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.tab()
		await expect(link).not.toHaveFocus()

		await userEvent.click(trigger)
		await expect(canvasElement.querySelector("#reveal")).not.toHaveAttribute(
			"inert",
		)
		await expect(
			canvas.getByRole("button", { name: "Hide the trace" }),
		).toHaveAttribute("aria-expanded", "true")
	},
})

export const FixedHeight = meta.story({
	args: { openHeight: "6rem", children: <Trace lines={LONG_TRACE} /> },
	parameters: {
		docs: {
			description: {
				story:
					"A reveal held to `6rem` while its content runs longer. Reach for `openHeight` when the surface must not resize as items stream in — a live run, a fixed panel — and pair it with a scroll container inside, since the disclosure itself clips rather than scrolls. Check that the overflow is cut cleanly at the bottom edge.",
			},
		},
	},
})

export const SlowReveal = meta.story({
	args: { transition: { duration: 0.8 } },
	parameters: {
		docs: {
			description: {
				story:
					"The built-in timing overridden through `transition`, slowed to 0.8s so the wipe can be watched frame by frame. Reach for it to inspect the motion, not to ship it: at this length the reveal stops feeling like a response. Note that an override replaces the whole transition, including the duration reduced motion would have zeroed — the wipe is still dropped under reduce, but the fade runs the full 0.8s.",
			},
		},
	},
})
