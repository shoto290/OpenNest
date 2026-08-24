import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"

const confirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const meta = preview.meta({
	title: "Overlays/ConfirmDialog",
	component: ConfirmDialog,
	parameters: {
		layout: "centered",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The question that stands between a reader and something they cannot undo. Reach for it wherever a press deletes: it dims the page and traps focus, so it reads as a question rather than as a notification, and it puts Cancel first so the safe way out is the one the hand reaches. The title names the thing, never the action alone — a reader who opened the wrong row finds out here rather than after — and the description repeats the consequence in full instead of shortening it to `Are you sure?`. It owns its own open state and reports nothing until the second press: `onConfirm` fires once, and a cancelled question is not news. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
			},
		},
	},
	args: {
		trigger: "Delete skill",
		triggerClassName: buttonVariants({ variant: "destructive", size: "sm" }),
		title: "Delete Release notes?",
		description:
			"Its description and its body go with it. This cannot be undone.",
		confirmLabel: "Delete skill",
		onConfirm: fn(),
	},
	argTypes: {
		defaultOpen: { control: false },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The resting state: the trigger alone, nothing asked yet. Check that the trigger wears whatever `triggerClassName` says and nothing else — the dialog draws the question, the caller draws the button that opens it.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Delete skill" }),
		).toBeVisible()
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})

export const Confirming = meta.story({
	args: { defaultOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"The question, mounted already up — reach for this to review the wording without a press. Check that the title names the thing being deleted, that Cancel sits before the destructive button, and that Escape closes it without reporting anything.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await confirmation()

		await expect(popup).toHaveTextContent("Delete Release notes?")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
	},
})

export const Cancelled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The path most readers take: they open the question and back out of it. Check that the trigger is still reachable afterwards — a cancelled question must not leave the surface inert — and that nothing was reported, because a question nobody answered is not news.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete skill" }))

		const popup = await confirmation()
		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).not.toHaveBeenCalled()
		await expect(
			canvas.getByRole("button", { name: "Delete skill" }),
		).toBeVisible()
	},
})

export const Confirmed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The accepted path, and the only one that reports anything. The second press closes the question and fires `onConfirm` exactly once — the dialog deletes nothing itself, it only says the reader agreed, which leaves the surface free to close, undo, or fail loudly.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete skill" }))

		const popup = await confirmation()
		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete skill" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onConfirm).toHaveBeenCalledTimes(1)
	},
})
