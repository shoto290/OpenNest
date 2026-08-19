import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	DangerZone,
	type DangerZoneProps,
} from "@workspace/ui/components/bot-settings-dialog/danger-zone"

/** The group is controlled, so a story owns the answer to "is the question up?"
 * the way the settings dialog does. */
const DangerZoneHost = (props: DangerZoneProps) => {
	const [confirming, setConfirming] = useState(props.confirming)

	return (
		<DangerZone
			{...props}
			confirming={confirming}
			onConfirmingChange={(next) => {
				setConfirming(next)
				props.onConfirmingChange(next)
			}}
		/>
	)
}

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "AI/DangerZone",
	component: DangerZone,
	parameters: {
		layout: "padded",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The one action in a bot's settings that cannot be undone, kept behind a question. It states what leaves with the bot before the reader presses anything, then names the bot again in the confirmation — the reader who opened the wrong settings finds out there rather than after. The destructive tone is carried by a hairline border rather than a fill, so the group reads as serious without shouting over the panel above it. It is fully controlled: `confirming` is the screen's state and `onDelete` fires only on the second press. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
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
		botName: "Nest Keeper",
		confirming: false,
		onConfirmingChange: fn(),
		onDelete: fn(),
	},
	argTypes: {
		confirming: { control: "boolean" },
	},
	render: (args) => <DangerZoneHost {...args} />,
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the group. Change `botName` and check that it reaches the confirmation title, not only the panel — that is the whole reason the name is passed down. Flip `confirming` to raise the question without a press, which is how a screen restores it after a reload.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Delete bot" })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state: a heading, the sentence naming everything that goes with the bot, and a single destructive button. Nothing here deletes anything — the press only asks. Check that the group takes the full width of the panel but the button does not, so the action never reads as the panel's primary one.",
			},
		},
	},
})

export const Confirming = meta.story({
	args: { confirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The confirmation, mounted already open. It names the bot in the title, repeats the consequence in full rather than shortening it to `Are you sure?`, and puts Cancel first so the safe way out is the one the hand reaches. The whole screen dims behind it and focus is trapped inside — this is a question, not a notification. Check that Escape and the backdrop both cancel, and that neither reports a deletion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await expect(popup).toHaveTextContent("Delete Nest Keeper?")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()
		await expect(args.onConfirmingChange).toHaveBeenCalledWith(false)
	},
})

export const Cancelled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The path most readers take: they open the question and back out of it. Cancel closes the confirmation, reports the state change and touches nothing else, so the group returns exactly as it was and the bot is still there. Check that the trigger is still reachable afterwards — a cancelled question must not leave the group inert.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete bot" }))

		const popup = await confirmation()
		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()
		await expect(
			canvas.getByRole("button", { name: "Delete bot" }),
		).toBeVisible()
	},
})

export const Deleted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. The second press closes the question and fires `onDelete` once — the group deletes nothing itself, it only says the reader agreed, which leaves the screen free to close the settings, undo, or fail loudly. Check that the count is exactly one however fast the button is pressed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete bot" }))

		const popup = await confirmation()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete bot" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})
