import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import { SpaceDangerZone } from "@workspace/ui/components/space-settings-dialog/space-danger-zone"

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "Forms/SpaceDangerZone",
	component: SpaceDangerZone,
	parameters: {
		layout: "padded",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The one action in a space's settings that cannot be undone, kept behind a question — the same group a bot's settings ends on, told about a space. It states what leaves with the space before the reader presses anything, then names the space again in the confirmation, so a reader who opened the wrong settings finds out there rather than after. The destructive tone is carried by a hairline border rather than a fill, so the group reads as serious without shouting over the panel. The question is its own: the group opens and closes it, and `onDelete` fires only on the second press. On the last space left the control stays put and goes inert, and the sentence states the reason in place of the consequence. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	args: {
		spaceName: "Release desk",
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
					"The resting state: a heading, the sentence naming everything that goes with the space, and a single destructive button. Nothing here deletes anything — the press only asks. Check that the group takes the full width of the panel but the button does not, so the action never reads as the panel's primary one. Pick `LastSpace` for the space that refuses to go.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Delete space" })

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
					"The confirmation, mounted already open. It names the space in the title, repeats the consequence in full rather than shortening it to `Are you sure?`, and puts Cancel first so the safe way out is the one the hand reaches. Check that Escape cancels and that nothing is reported — `defaultConfirming` is read once as the group mounts, so it is not a knob to flip.",
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

export const Deleted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. The reader opens the question, backs out of it once — a question nobody answered is not news — then presses through: `onDelete` fires exactly once. The group deletes nothing itself, which leaves the screen free to close the settings, undo, or fail loudly.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete space" }))
		await userEvent.click(
			within(await confirmation()).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(canvas.getByRole("button", { name: "Delete space" }))
		await userEvent.click(
			within(await confirmation()).getByRole("button", {
				name: "Delete space",
			}),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const LastSpace = meta.story({
	args: { isDeletable: false },
	parameters: {
		docs: {
			description: {
				story:
					"The only space the reader owns. Check that the control is still shown but disabled rather than hidden — a reader looking for it deserves to learn why it will not work — that the sentence states the reason in place of the consequence, and that pressing it opens no question and reports nothing. Pick `Deleted` for the space that can go.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const trigger = canvas.getByRole("button", { name: "Delete space" })

		await expect(trigger).toBeDisabled()
		await expect(
			canvas.getByText(
				"The last space cannot be deleted — the app always keeps one.",
			),
		).toBeVisible()

		fireEvent.click(trigger)
		await expect(screen.queryByRole("alertdialog")).toBe(null)
		await expect(args.onDelete).not.toHaveBeenCalled()
	},
})

export const Empty = meta.story({
	args: { spaceName: "Untitled space" },
	parameters: {
		docs: {
			description: {
				story:
					"A space nobody has named, as the dialog hands it down. Check that the confirmation still has something to name it by rather than asking `Delete ?` — the fallback is passed in as a name, so the group never has to know a space can be nameless.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete space" }))
		await expect(await confirmation()).toHaveTextContent(
			"Delete Untitled space?",
		)
	},
})
