import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	NewConversationDialog,
	type NewConversationDialogProps,
} from "@workspace/ui/components/new-conversation-dialog"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"

const DialogHost = (props: NewConversationDialogProps) => {
	const [open, setOpen] = useState(props.open)

	return (
		<NewConversationDialog
			{...props}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			open={open}
		/>
	)
}

const ReopenableHost = (props: NewConversationDialogProps) => {
	const [open, setOpen] = useState(props.open)

	return (
		<>
			<button onClick={() => setOpen(true)} type="button">
				Reopen
			</button>
			<NewConversationDialog
				{...props}
				onClose={() => {
					setOpen(false)
					props.onClose()
				}}
				open={open}
			/>
		</>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const meta = preview.meta({
	title: "Settings/Conversation/NewConversationDialog",
	component: NewConversationDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The overlay that brings a conversation into being: an optional name, then the bots that take part, picked one at a time from a searchable roster. The order of the picks is the whole product decision here — the first bot picked leads, and the dialog shows that before the conversation exists rather than settling it afterwards, by drawing a chip per pick, in pick order, with a crown on the first. Removing a chip removes exactly that bot and promotes the next one only if the lead itself was removed. Only the bots are required: a conversation created with the name left empty is reported with an empty name, and it takes its name from its first message instead, which is why the create action waits on the picks alone. The dialog keeps its own draft and throws it away on close: it opens blank every time, so a half-filled attempt never leaks into the next one.",
			},
		},
	},
	args: {
		open: true,
		bots: CONVERSATION_BOTS,
		onClose: fn(),
		onCreate: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens, blank. Check that create is unavailable while nothing is picked, that picking two bots draws two chips in pick order with the crown on the first and turns create on with the name still empty, and that the conversation is then reported nameless. Pick `LeadHandover` for a named one, `Reopened` for the draft being thrown away, `Empty` for a search matching nothing.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)
		const create = inside.getByRole("button", { name: "Create conversation" })
		await expect(create).toBeDisabled()

		await userEvent.click(inside.getByRole("button", { name: "Atlas" }))
		await userEvent.click(inside.getByRole("button", { name: "Elia" }))

		const chips = slotsIn(dialog, "picked-bot")
		await expect(chips).toHaveLength(2)
		await expect(chips[0]).toHaveTextContent("Atlas")
		await expect(chips[0]).toHaveTextContent("Lead")
		await expect(chips[1]).not.toHaveTextContent("Lead")

		await expect(inside.getByLabelText("Name")).toHaveValue("")
		await expect(create).toBeEnabled()
		await userEvent.click(create)
		await expect(args.onCreate).toHaveBeenCalledWith({
			name: "",
			botIds: ["bot-atlas", "bot-elia"],
		})
	},
})

export const LeadHandover = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The reader changes their mind about who leads. Check that dismissing the first chip hands the crown to the second and leaves the rest in pick order, and that what is finally reported is the surviving ids in that same order — the dialog never reorders on its own.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await userEvent.type(inside.getByLabelText("Name"), "Handover")
		await userEvent.click(inside.getByRole("button", { name: "Atlas" }))
		await userEvent.click(inside.getByRole("button", { name: "Basile" }))
		await userEvent.click(inside.getByRole("button", { name: "Elia" }))

		await userEvent.click(inside.getByRole("button", { name: "Remove Atlas" }))

		const chips = slotsIn(dialog, "picked-bot")
		await expect(chips).toHaveLength(2)
		await expect(chips[0]).toHaveTextContent("Basile")
		await expect(chips[0]).toHaveTextContent("Lead")

		await userEvent.click(
			inside.getByRole("button", { name: "Create conversation" }),
		)
		await expect(args.onCreate).toHaveBeenCalledWith({
			name: "Handover",
			botIds: ["bot-basile", "bot-elia"],
		})
	},
})

export const Reopened = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A draft abandoned, then the dialog opened again. Check that the name, the search and every chip are gone — the draft belongs to one opening only. Reach for this whenever a change touches where the dialog keeps its state.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await userEvent.type(inside.getByLabelText("Name"), "Abandoned")
		await userEvent.type(inside.getByLabelText("Bots"), "atl")
		await userEvent.click(inside.getByRole("button", { name: "Atlas" }))
		await expect(slotsIn(dialog, "picked-bot")).toHaveLength(1)

		await userEvent.click(inside.getByRole("button", { name: "Cancel" }))
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		)

		await userEvent.click(screen.getByRole("button", { name: "Reopen" }))
		const reopened = await dialogIn()
		await expect(within(reopened).getByLabelText("Name")).toHaveValue("")
		await expect(within(reopened).getByLabelText("Bots")).toHaveValue("")
		await expect(slotsIn(reopened, "picked-bot")).toHaveLength(0)
	},
	render: (args) => <ReopenableHost {...args} />,
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A search no bot in the roster answers. Check that the message replaces the list inside the dialog and that create stays unavailable, since a search cannot pick anything. Clearing the search restores every bot.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await userEvent.type(inside.getByLabelText("Name"), "Nothing here")
		await userEvent.type(inside.getByLabelText("Bots"), "zzz")

		await expect(inside.getByText("No bot matches that search.")).toBeVisible()
		await expect(
			inside.getByRole("button", { name: "Create conversation" }),
		).toBeDisabled()
	},
})

export const LongContent = meta.story({
	args: { bots: LONG_NAMED_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"A roster of bots named past the dialog's width, all picked. Check that the chips wrap onto a second row and the names truncate instead of stretching the dialog, and that the list below keeps its own scroll rather than pushing the buttons off-screen.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		for (const bot of LONG_NAMED_BOTS) {
			await userEvent.click(inside.getByRole("button", { name: bot.name }))
		}

		await expect(slotsIn(dialog, "picked-bot")).toHaveLength(
			LONG_NAMED_BOTS.length,
		)
	},
})
