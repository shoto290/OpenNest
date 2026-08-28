import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	BotPicker,
	type BotPickerProps,
} from "@workspace/ui/components/new-conversation-dialog/bot-picker"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"

const PickerHost = (props: BotPickerProps) => {
	const [search, setSearch] = useState(props.search)
	const [pickedIds, setPickedIds] = useState(props.pickedIds)

	return (
		<BotPicker
			{...props}
			onPick={(id) => {
				setPickedIds((picked) =>
					picked.includes(id)
						? picked.filter((each) => each !== id)
						: [...picked, id],
				)
				props.onPick(id)
			}}
			onSearchChange={(next) => {
				setSearch(next)
				props.onSearchChange(next)
			}}
			pickedIds={pickedIds}
			search={search}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Conversation/BotPicker",
	component: BotPicker,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The half of the new-conversation dialog that answers *who takes part*: one search field over one list of bots, each row an avatar and a name. A row is a toggle, not a link — it reports the bot it was pressed on and wears `aria-pressed` plus a tick once that bot is in, so a reader who tabs the list knows what is already picked without looking at the chips. The picker owns no state: the search string and the picked ids are handed to it and every press is reported up, because the order those ids arrive in is what decides the lead. Reach for `PickedBots` for the chips that same pick draws, and for `NewConversationDialog` for the two of them wired together.",
			},
		},
	},
	args: {
		bots: CONVERSATION_BOTS,
		pickedIds: [],
		search: "",
		onPick: fn(),
		onSearchChange: fn(),
	},
	render: (args) => <PickerHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The list as it opens, nothing picked and nothing typed. Check that every bot shows its avatar and its name, that pressing a row reports that bot's id, and that the row it was pressed on comes back pressed with a tick. Pick `Empty` for a search that matches nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const rows = canvas.getAllByRole("button")
		await expect(rows).toHaveLength(CONVERSATION_BOTS.length)

		const basile = canvas.getByRole("button", { name: "Basile" })
		await expect(basile).toHaveAttribute("aria-pressed", "false")

		await userEvent.click(basile)
		await expect(args.onPick).toHaveBeenLastCalledWith("bot-basile")
		await expect(basile).toHaveAttribute("aria-pressed", "true")
	},
})

export const Picked = meta.story({
	args: { pickedIds: ["bot-atlas", "bot-elia"] },
	parameters: {
		docs: {
			description: {
				story:
					"Two bots already in. Check that exactly those two rows are pressed and carry a tick, and that pressing a pressed row reports it again so the dialog can take it back out — the chip's cross is not the only way back.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const atlas = canvas.getByRole("button", { name: "Atlas" })
		await expect(atlas).toHaveAttribute("aria-pressed", "true")
		await expect(
			canvas.getByRole("button", { name: "Basile" }),
		).toHaveAttribute("aria-pressed", "false")

		await userEvent.click(atlas)
		await expect(args.onPick).toHaveBeenLastCalledWith("bot-atlas")
		await expect(atlas).toHaveAttribute("aria-pressed", "false")
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A search no bot answers. Check that the message takes the list's place rather than sitting under an empty one, and that clearing the search brings every bot back. This is the only empty state the picker has — a roster with no bot in it at all is `NewConversationDialog`'s problem, not the picker's.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const search = canvas.getByLabelText("Bots")
		await userEvent.type(search, "zzz")

		await expect(canvas.getByText("No bot matches that search.")).toBeVisible()
		await expect(canvas.queryByRole("list")).not.toBeInTheDocument()

		await userEvent.clear(search)
		await expect(
			canvas.getAllByRole("button", { name: /Atlas|Basile/ }),
		).toHaveLength(2)
	},
})

export const Searching = meta.story({
	args: { search: "a" },
	parameters: {
		docs: {
			description: {
				story:
					"A search that narrows the list without emptying it, matched on the name and ignoring case. Check that only the matching bots remain and that picking one still reports the right id — filtering must never shift which row belongs to which bot.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const list = canvas.getByRole("list")
		await expect(within(list).getAllByRole("button").length).toBeLessThan(
			CONVERSATION_BOTS.length,
		)

		await userEvent.click(canvas.getByRole("button", { name: "Atlas" }))
		await expect(args.onPick).toHaveBeenLastCalledWith("bot-atlas")
	},
})

export const LongContent = meta.story({
	args: { bots: LONG_NAMED_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"Bots named far past the width of the dialog. Check that each name truncates on one line with the avatar and the tick holding their place, and that no row grows taller than its neighbour.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			slotsIn(canvas.getByRole("list"), "bot-picker-row"),
		).toHaveLength(LONG_NAMED_BOTS.length)
	},
})
