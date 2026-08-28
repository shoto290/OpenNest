import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"

const MARK = (
	<BotIdentityAvatar
		animal="rabbit"
		blot="blue"
		name="Nest Keeper"
		seed="bot_4f8c21"
		size={64}
	/>
)

const meta = preview.meta({
	title: "Conversation/Message/EmptyStateShell",
	component: EmptyStateShell,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The frame every empty conversation surface is drawn in: a centered column holding a mark, a heading over its description, an optional action and an optional arrow hint. It owns the spacing and the type scale only — it reads no copy and knows no bot, so `ChatEmptyState` and `ConversationEmptyState` stay the components an app mounts. Reach for it directly only to add a third empty surface to the transcript region.",
			},
		},
	},
	args: {
		"data-slot": "empty-state-shell",
		mark: MARK,
		title: "Nest Keeper",
		description:
			"OpenNest talks to its built-in agent. Nothing leaves your device.",
		hint: "Type your first prompt in the composer below",
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read the frame at its nominal fill: a mark, a heading, one line of copy and the arrow hint, with no action between them. Check that the gap above and below the title block is even and that the hint sits last, so the composer below the surface stays the first thing to act on. Pick `WithAction` when the host has a button to offer.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Nest Keeper" }),
		).toBeVisible()
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const WithAction = meta.story({
	args: {
		action: <Button onClick={fn()}>Bot settings</Button>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the surface carries a secondary way out beside the composer. Check that the action lands between the copy and the hint — never after it — so the arrow stays the last thing read. Pick `WithoutHint` when the action is the only thing left to do.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Bot settings" }),
		).toBeVisible()
		await expect(
			canvas.getByText(/Type your first prompt in the composer below/),
		).toBeVisible()
	},
})

export const WithoutHint = meta.story({
	args: {
		hint: undefined,
		action: <Button onClick={fn()}>Try again</Button>,
		title: "Claude Code is not available",
		description: "OpenNest cannot reach its built-in agent.",
		mark: null,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the composer below is dead and the action on the surface is the only thing a reader can do. Check that dropping the hint closes the column cleanly instead of leaving a trailing gap, and that the button is the single focusable target. Pick `WithAction` while the composer is still live.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("button")).toHaveLength(1)
		await expect(canvas.queryByText(/composer below/)).toBeNull()
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"Ship the December release, then plan the January retrospective with everyone involved",
		description:
			"Six bots are seated here and waiting on your first message, and every one of them reads the whole room before answering.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a long-named room whose copy runs past one line. Check that both the heading and the description wrap inside the same measure rather than stretching the surface wider. Pick `Default` for the nominal length.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading")).toBeVisible()
	},
})
