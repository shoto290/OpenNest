import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AWAITING_DIFF_COMMIT,
	BOT_COMMITS,
} from "@workspace/ui/components/bot-settings-dialog/history.fixtures"
import { HistoryPanel } from "@workspace/ui/components/bot-settings-dialog/history-panel"

const [NEWEST] = BOT_COMMITS

const meta = preview.meta({
	title: "AI/HistoryPanel",
	component: HistoryPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything that has ever changed in a bot's bundle, newest first, written for a reader who does not read diffs: the title leads, the body says what it meant, and under both is who made the change and how long ago. The diff is secondary and stays folded away — opening one asks the host for it and shows it once it arrives, so nothing is fetched for a commit nobody opened. Undo asks its question first and is answered upstream as a new commit: nothing in this list is ever removed.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[28rem] w-[36rem] flex-col gap-4 overflow-y-auto p-5">
				<Story />
			</div>
		),
	],
	args: {
		commits: BOT_COMMITS,
		botName: "Nest Keeper",
		onLoadDiff: fn(),
		onRevert: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bundle both hands have written in. Check the order first — newest at the top, whatever order the host handed them in — then that each row says who and when in the reader's own words: their own changes are signed `You`, the bot's carry the bot's name, and the moment is a distance rather than a timestamp. A commit with no body keeps its row without an empty line in it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const titles = canvas
			.getAllByRole("listitem")
			.map((row) => row.textContent ?? "")

		await expect(titles[0]).toContain("Switched the model to Claude Sonnet 4.5")
		await expect(titles[0]).toContain("Nest Keeper")
		await expect(titles[1]).toContain("You")
		await expect(canvas.getByText("Created the bundle")).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { commits: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A bot nobody has changed yet. One sentence and nothing else — there is no action to offer here, because a change is made on the other tabs rather than on this one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Nothing has been changed in this bot yet."),
		).toBeVisible()
		await expect(canvas.queryAllByRole("listitem")).toHaveLength(0)
	},
})

export const ExpandedDiff = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A commit opened on its changes. Check that opening it asks the host for the diff exactly once, that added and removed lines are told apart by their colour rather than by counting the leading characters, and that the disclosure says `Hide changes` once it is open. The rest of the list is untouched: opening one commit closes none.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [first] = canvas.getAllByRole("button", { name: "Show changes" })
		if (!first) throw new Error("The list is missing its disclosures")

		await userEvent.click(first)

		await expect(args.onLoadDiff).toHaveBeenCalledWith(NEWEST?.id)
		await expect(first).toHaveAttribute("aria-expanded", "true")
		const diff = canvas.getByRole("group", { name: /Changes/ })
		await expect(diff).toHaveTextContent('+ "model": "sonnet-4-5",')
		await expect(diff).toHaveTextContent('- "model": "haiku-4-5",')
		await expect(
			canvas.getAllByRole("button", { name: "Show changes" }),
		).toHaveLength(3)
	},
})

export const DiffLoading = meta.story({
	args: { commits: [AWAITING_DIFF_COMMIT] },
	parameters: {
		docs: {
			description: {
				story:
					"A commit opened while its diff is still being read. The row says so in place of the code block rather than collapsing back or holding an empty frame, and the spinner stops for a reader who asked for less motion.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Show changes" }))

		await expect(canvas.getByText("Loading the changes…")).toBeVisible()
	},
})

export const Undoing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The one action a row carries. Check that it never acts on the press: the question names the commit it was asked on and says what undoing does, and only the second press reports it. Cancelling reports nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const [undo] = canvas.getAllByRole("button", { name: "Undo" })
		if (!undo) throw new Error("The list is missing its undo")

		await userEvent.click(undo)

		const question = await screen.findByRole("alertdialog")
		await expect(question).toHaveTextContent(
			"Undo “Switched the model to Claude Sonnet 4.5”?",
		)
		await expect(args.onRevert).not.toHaveBeenCalled()

		await userEvent.click(
			within(question).getByRole("button", { name: "Undo this change" }),
		)

		await expect(args.onRevert).toHaveBeenCalledWith(NEWEST?.id)
	},
})
