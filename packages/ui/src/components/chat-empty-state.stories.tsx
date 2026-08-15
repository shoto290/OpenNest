import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"

const meta = preview.meta({
	title: "AI/ChatEmptyState",
	component: ChatEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface OpenNest shows on first launch, before any message exists. It carries the whole first-run decision: either Claude Code answers and the user is sent to the composer, or it does not and the user is sent to setup. It owns its own copy and holds no sidebar, roster, suggestion or navigation — compose it above a composer, never inside a chat screen shell.",
			},
		},
	},
	args: {
		onSetup: fn(),
	},
	argTypes: {
		status: { control: "inline-radio", options: ["ready", "unavailable"] },
	},
})

export const Default = meta.story({
	args: { status: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a genuine first launch: Claude Code answered, the composer below is live, and the surface only has to name the product and point down to it. Check that the guidance is the arrow hint and nothing else — no button competes with the composer for the first action. Pick `Unavailable` instead when the CLI is unreachable and typing would fail.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(/Type your first prompt in the composer below/),
		).toBeVisible()
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when OpenNest launched but the Claude Code CLI is missing or unreachable: the composer is disabled, so the empty state has to carry the only action left. Check that the setup button is the single focusable target and that the copy blames the missing CLI rather than the prompt. Pick `Default` when Claude Code answers and the composer is live.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const setup = canvas.getByRole("button", { name: "Set up Claude Code" })

		await userEvent.click(setup)
		await expect(args.onSetup).toHaveBeenCalled()
	},
})
