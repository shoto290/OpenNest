import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import { ConversationDangerZone } from "@workspace/ui/components/conversation-settings-dialog/conversation-danger-zone"

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "AI/ConversationDangerZone",
	component: ConversationDangerZone,
	parameters: {
		layout: "padded",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The one irreversible action in a conversation's settings, kept behind a question. It says up front what goes and what stays — the conversation and everything said in it go, the bots stay in the space — so a reader who confuses deleting a conversation with dismissing its bots finds out before pressing anything. The name is repeated in the confirmation, which is where a reader who opened the wrong conversation catches it. The group deletes nothing itself: `onDelete` fires only on the second press, leaving the screen free to close, undo or fail loudly. Reach for `DangerZone` for the same shape around a bot.",
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
		conversationName: "Release desk",
		onDelete: fn(),
	},
	argTypes: {
		defaultConfirming: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state: a heading, the sentence naming what leaves with the conversation, and a single destructive button. Nothing here deletes anything — the press only asks. Check that the group takes the panel's full width but the button does not, so the action never reads as the panel's primary one. Pick `Confirming` for the question already up, `Deleted` for the accepted path.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: "Delete conversation",
		})

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
	},
})

export const Confirming = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The confirmation, mounted already open — `defaultConfirming` is read once as the group mounts, so it is not a knob to flip. Check that the title names the conversation, that Cancel comes first so the safe way out is the one the hand reaches, and that Escape closes it without reporting a deletion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await expect(popup).toHaveTextContent("Delete Release desk?")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()
	},
})

export const Cancelled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The path most readers take: they open the question and back out of it. Check that Cancel reports nothing — a question nobody answered is not news — and that the trigger is still reachable afterwards, because a cancelled question must not leave the group inert.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete conversation" }),
		)

		const popup = await confirmation()
		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()
		await expect(
			canvas.getByRole("button", { name: "Delete conversation" }),
		).toBeVisible()
	},
})

export const Deleted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. Check that the second press closes the question and fires `onDelete` exactly once, however fast the button is pressed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete conversation" }),
		)

		const popup = await confirmation()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete conversation" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const LongContent = meta.story({
	args: {
		conversationName:
			"Release notes, incident retro and on-call handover for the desktop build",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation named at length. Check that the name reaches the confirmation title whole and wraps there rather than pushing the popup wider — the title is what identifies the conversation, so it is never the part that gets cut.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Delete conversation" }),
		)

		const popup = await confirmation()
		await expect(popup).toHaveTextContent("Release notes, incident retro")
	},
})
