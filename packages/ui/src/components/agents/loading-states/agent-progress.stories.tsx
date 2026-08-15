import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AgentProgress } from "@workspace/ui/components/agents/loading-states/agent-progress"

const meta = preview.meta({
	title: "AI/AgentProgress",
	component: AgentProgress,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A step the agent is on, with a clock on it. It times itself from mount unless a screen owns the number, and `running` pauses the ticking without moving the origin — a surface that hides the row can stop repainting a time nobody reads. Pass `indicator={null}` when the surface already shows who is working, as `BotWorking` does.",
			},
		},
	},
	args: { label: "Churning" },
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to audition a label with the built-in grid. Check that the grid keeps its cadence while the clock counts, and that the two never fight for the eye.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toBeVisible()
	},
})

export const Controlled = meta.story({
	args: { label: "Reading the repo", elapsedSeconds: 74.4 },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the screen already knows how long the step has run — a resumed session, or a duration the transport reported. Check that the row shows minutes past sixty seconds and that no internal timer fights the given value.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("1m 14.4s")).toBeVisible()
	},
})

export const WithoutIndicator = meta.story({
	args: { label: "No name · Bash · npm test", indicator: null },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this inside a surface that carries its own working visual, where a second glyph would only compete. Check that the label and clock hold the row on their own without the grid's width.",
			},
		},
	},
})
