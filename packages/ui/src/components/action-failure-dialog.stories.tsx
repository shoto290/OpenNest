import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ActionFailureDialog } from "@workspace/ui/components/action-failure-dialog"

const report = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

const DESCRIPTION =
	"The space was not created. Nothing was saved, and your bots are untouched."

const meta = preview.meta({
	title: "Overlays/ActionFailureDialog",
	component: ActionFailureDialog,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The report that an action already failed. Reach for it where a write reached a disk or a host and came back refused: it dims the page and traps focus, so the failure is read before anything else on the surface. It asks nothing — the title names what did not happen and the description says what the reader still has, which is the sentence a reader needs before deciding whether to press again. Both strings belong to the caller; the dialog holds no copy of its own beyond its two labels. Focus lands on Try again, because a reader who opened this dialog came to retry, and Close sits before it so the way out is still the first thing the eye meets. `onRetry` fires once, both actions go quiet while it is in flight, and a rejection holds the dialog on the same description instead of closing on a press that changed nothing.",
			},
		},
	},
	args: {
		defaultOpen: true,
		title: "Space could not be created",
		description: DESCRIPTION,
		onRetry: fn(),
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
					"The failure as it lands: both actions live, nothing retried yet. Check that the popup is an `alertdialog` named by its title and described by its description, that Close reads before Try again, and that focus is already on Try again so a returning press needs no travel.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await report()
		const actions = within(popup).getAllByRole("button")

		await expect(popup).toHaveAccessibleName("Space could not be created")
		await expect(popup).toHaveAccessibleDescription(DESCRIPTION)
		await expect(actions[0]).toHaveTextContent("Close")
		await expect(actions[1]).toHaveTextContent("Try again")
		await expect(actions[0]).toBeEnabled()
		await expect(actions[1]).toBeEnabled()
		await waitFor(() => expect(actions[1]).toHaveFocus())
		await expect(args.onRetry).not.toHaveBeenCalled()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onRetry).not.toHaveBeenCalled()
	},
})

export const Loading = meta.story({
	args: {
		onRetry: fn(() => new Promise<void>(() => undefined)),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The retry still in flight. Both actions are disabled while the caller works, so a slow write cannot be fired twice and the reader cannot walk out from under a press they already made. The dialog holds on the same description: nothing is claimed until the callback answers.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await report()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Try again" }),
		)

		await waitFor(() =>
			expect(
				within(popup).getByRole("button", { name: "Try again" }),
			).toBeDisabled(),
		)
		await expect(
			within(popup).getByRole("button", { name: "Close" }),
		).toBeDisabled()
		await expect(popup).toBeVisible()
		await expect(args.onRetry).toHaveBeenCalledTimes(1)
	},
})

export const Error = meta.story({
	args: {
		retryFailureLabel: "That did not work either. Nothing was created.",
		onRetry: fn(() => Promise.reject(new window.Error("creation refused"))),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The retry that failed in turn. The dialog stays up on the same description — the first failure is still true — and `retryFailureLabel` is announced beneath it in the destructive token, so the second refusal reads as new information rather than as a repeat. Both actions come back live. Without a `retryFailureLabel` the dialog still holds, silently: pass one wherever the retry can reject.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await report()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Try again" }),
		)

		const alert = await within(popup).findByRole("alert")
		await expect(alert).toHaveTextContent(
			"That did not work either. Nothing was created.",
		)
		await expect(popup).toHaveTextContent(DESCRIPTION)
		await expect(popup).toBeVisible()
		await expect(
			within(popup).getByRole("button", { name: "Try again" }),
		).toBeEnabled()
		await expect(
			within(popup).getByRole("button", { name: "Close" }),
		).toBeEnabled()
		await expect(args.onRetry).toHaveBeenCalledTimes(1)
	},
})
