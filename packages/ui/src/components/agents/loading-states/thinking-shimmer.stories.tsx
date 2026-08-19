import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ThinkingShimmer } from "@workspace/ui/components/agents/loading-states/thinking-shimmer"
import { Icons } from "@workspace/ui/components/icons"

const DURATIONS = [0.9, 1.8, 4]

const meta = preview.meta({
	title: "AI/ThinkingShimmer",
	component: ThinkingShimmer,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The label of a turn that has started but has nothing to show yet. A highlight sweeps a muted line of text from end to end, which reads as work in progress without spending a spinner on it — the words stay the message, the motion is only the tempo. It renders a bare `span` and inherits its size, so it drops into any row. It announces nothing on its own: the surface around it owns the live region, as `AgentActivity` and `BotWorking` both do, so one turn never produces two announcements.",
			},
		},
	},
	args: { children: "Thinking…" },
	argTypes: {
		duration: { control: { type: "number", min: 0.4, step: 0.1 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the label and its tempo. Keep the label short — the sweep crosses the whole string, so a sentence turns the effect into a wave nobody can read. Check that the text stays legible at every point of the pass, which is what the muted-to-foreground gradient is tuned for.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Thinking…")).toBeVisible()
	},
})

export const CustomLabel = meta.story({
	args: { children: "Reading the nest manifest" },
	parameters: {
		docs: {
			description: {
				story:
					"The label naming the step instead of the state. Reach for it once the run knows what it is doing — a named step tells a waiting reader more than `Thinking…` ever will. Check that a longer label still finishes its sweep in one pass rather than reading as two.",
			},
		},
	},
})

export const Cadence = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same label at three tempos: 0.9s reads as urgent, the 1.8s default as working, 4s as patient. `duration` is the seconds one pass takes, so a longer label at a short duration feels faster than the number suggests. Reach here when tuning a surface that runs several shimmers at once — they should share a duration or they will beat against each other.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-2 text-sm">
			{DURATIONS.map((duration) => (
				<ThinkingShimmer duration={duration} key={duration}>
					{`Working at ${duration}s`}
				</ThinkingShimmer>
			))}
		</div>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Working at 0.9s")).toBeVisible()
	},
})

export const InAStatusRow = meta.story({
	args: { className: "text-xs" },
	parameters: {
		docs: {
			description: {
				story:
					"How a surface actually mounts it: inside its own live region, beside a glyph, at the row's type size. `className` merges rather than replaces, so a size or a tracking override lands while the built-in weight holds. Check that a screen reader announces the label once, from the row, and never narrates the motion.",
			},
		},
	},
	render: (args) => (
		<div
			className="flex items-center gap-2 text-muted-foreground"
			role="status"
		>
			<Icons.Thinking aria-hidden="true" className="size-4" />
			<ThinkingShimmer {...args} />
		</div>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent("Thinking…")
	},
})
