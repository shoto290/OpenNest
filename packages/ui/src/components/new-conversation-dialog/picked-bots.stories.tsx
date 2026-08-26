import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"
import {
	PickedBots,
	type PickedBotsProps,
} from "@workspace/ui/components/new-conversation-dialog/picked-bots"

const ChipsHost = (props: PickedBotsProps) => {
	const [bots, setBots] = useState(props.bots)

	return (
		<PickedBots
			{...props}
			bots={bots}
			onDismiss={(id) => {
				setBots((each) => each.filter((bot) => bot.id !== id))
				props.onDismiss(id)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/PickedBots",
	component: PickedBots,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The bots picked for a conversation, in the order they were picked, as chips. The order is the point: the first chip is the lead, and it says so with a crown and a screen-reader-only *Lead*, never with the crown alone. Every chip carries its own cross, named after the bot it removes, and removing one leaves the rest in place — so the second chip is promoted only by removing the first, never by a reorder this component does on its own. It draws nothing when nothing is picked, which is what the dialog wants above an untouched picker. Reach for `BotPicker` for the list these chips come from.",
			},
		},
	},
	args: {
		bots: CONVERSATION_BOTS.slice(0, 3),
		onDismiss: fn(),
	},
	render: (args) => <ChipsHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Three bots picked. Check that only the first chip wears the crown and announces *Lead*, that each cross is named after its own bot, and that removing a middle chip leaves the lead untouched. Pick `LeadHandover` for what removing the lead does.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const chips = slotsIn(canvas.getByRole("list"), "picked-bot")
		await expect(chips).toHaveLength(3)
		await expect(
			slotsIn(canvas.getByRole("list"), "picked-bot-lead"),
		).toHaveLength(1)
		await expect(chips[0]).toHaveTextContent("Lead")

		await userEvent.click(canvas.getByRole("button", { name: "Remove Basile" }))
		await expect(args.onDismiss).toHaveBeenLastCalledWith("bot-basile")
		await expect(canvas.getByText("Atlas")).toBeVisible()
		await expect(canvas.queryByText("Basile")).not.toBeInTheDocument()
	},
})

export const LeadHandover = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Removing the lead rather than a follower. Check that the crown moves to whoever was second and that the rest keep the order they were picked in — the conversation always has exactly one lead, and it is always the leftmost chip.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Remove Atlas" }))

		const chips = slotsIn(canvas.getByRole("list"), "picked-bot")
		await expect(chips).toHaveLength(2)
		await expect(chips[0]).toHaveTextContent("Basile")
		await expect(chips[0]).toHaveTextContent("Lead")
		await expect(chips[1]).toHaveTextContent("Clémence")
	},
})

export const Single = meta.story({
	args: { bots: CONVERSATION_BOTS.slice(0, 1) },
	parameters: {
		docs: {
			description: {
				story:
					"One bot, which is therefore the lead. Check that the crown is drawn even with nobody to lead — the mark states a role the conversation keeps, not a comparison between chips.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			slotsIn(canvas.getByRole("list"), "picked-bot-lead"),
		).toHaveLength(1)
	},
})

export const LongContent = meta.story({
	args: { bots: LONG_NAMED_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"Bots whose names run past a chip's width. Check that the name truncates while the avatar, the crown and the cross stay whole and clickable, and that the row wraps to a second line rather than pushing the dialog wider.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", {
				name: "Remove Release notes editor for the desktop build",
			}),
		).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { bots: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing picked. Check that the component renders nothing at all — no empty row, no placeholder — so the dialog shows no gap above an untouched picker.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("list")).not.toBeInTheDocument()
	},
})
