import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ConversationSettingsDialog,
	type ConversationSettingsDialogProps,
} from "@workspace/ui/components/conversation-settings-dialog"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"

const SEATED = CONVERSATION_BOTS.slice(0, 3)

const DialogHost = (props: ConversationSettingsDialogProps) => {
	const [open, setOpen] = useState(props.open)
	const [value, setValue] = useState(props.value)
	const [participants, setParticipants] = useState(props.participants)
	const [leadId, setLeadId] = useState(props.leadId)

	const dismiss = (id: string) => {
		const left = participants.filter((bot) => bot.id !== id)
		setParticipants(left)
		if (id === leadId && left[0]) {
			setLeadId(left[0].id)
		}
		props.onDismiss(id)
	}

	const recruit = (id: string) => {
		const recruited = props.bots.find((bot) => bot.id === id)
		if (recruited) {
			setParticipants([...participants, recruited])
		}
		props.onRecruit(id)
	}

	return (
		<ConversationSettingsDialog
			{...props}
			leadId={leadId}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onDismiss={dismiss}
			onLeadChange={(id) => {
				setLeadId(id)
				props.onLeadChange(id)
			}}
			onRecruit={recruit}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			open={open}
			participants={participants}
			value={value}
		/>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const openTab = async (
	name: string,
	userEvent: { click: (element: Element) => Promise<void> },
) => {
	const dialog = await dialogIn()
	await userEvent.click(within(dialog).getByRole("tab", { name }))
	return dialog
}

const meta = preview.meta({
	title: "Overlays/ConversationSettingsDialog",
	component: ConversationSettingsDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Everything a conversation is, behind one rail: its name, who takes part, the instructions every bot in it shares, and the one way to end it. The panes are split the way a reader changes their mind — renaming is a keystroke, changing who leads is a decision, deleting is a question — so the destructive pane sits below a separator and never next to the name field. The dialog holds no draft: every keystroke and every press is reported as it happens, which is what lets the screen persist a rename without a save button. The instructions pane is the conversation's own brief, shared by every bot seated — a bot's own instructions live in `BotSettingsDialog` instead. Reach for `ParticipantsPanel` for the seating on its own, `NewConversationDialog` for the conversation that does not exist yet.",
			},
		},
	},
	args: {
		open: true,
		value: {
			name: "Release desk",
			instructions:
				"Ship notes are written for the people running the update, not for us.",
		},
		participants: SEATED,
		leadId: SEATED[0]?.id ?? "",
		bots: CONVERSATION_BOTS,
		onClose: fn(),
		onValueChange: fn(),
		onLeadChange: fn(),
		onDismiss: fn(),
		onRecruit: fn(),
		onDelete: fn(),
	},
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens, on the general pane. Check that the header names the conversation, that typing in the name field reports the whole value rather than the keystroke, and that the four rail entries are reachable by keyboard with the danger one set apart. Pick `Participants` for the seating, `Instructions` for the shared brief, `Danger` for the deletion.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const inside = within(dialog)

		await expect(inside.getByRole("tab", { name: "General" })).toBeVisible()
		await userEvent.type(inside.getByLabelText("Name"), "!")

		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			instructions:
				"Ship notes are written for the people running the update, not for us.",
		})
	},
})

export const Participants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seating pane. Check that the bots are listed in joining order with one crown on the lead, that moving the crown reports that bot and leaves a single crown behind, and that the roster below never offers a bot already seated. `ParticipantsPanel` covers dismissal and the last-seat rule on its own.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Participants", userEvent)
		const inside = within(dialog)

		await expect(slotsIn(dialog, "participant")).toHaveLength(3)
		await expect(inside.queryByRole("button", { name: "Atlas" })).toBe(null)

		await userEvent.click(
			inside.getByRole("button", { name: "Give the lead to Clémence" }),
		)

		await expect(args.onLeadChange).toHaveBeenCalledWith("bot-clemence")
		await expect(slotsIn(dialog, "participant-lead")).toHaveLength(1)

		await userEvent.click(inside.getByRole("button", { name: "Dorian" }))
		await expect(args.onRecruit).toHaveBeenCalledWith("bot-dorian")
		await expect(slotsIn(dialog, "participant")[3]).toHaveTextContent("Dorian")
	},
})

export const Instructions = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The brief every bot in the conversation reads. Check that the field fills the pane rather than sitting as a two-line box — this is written in paragraphs — and that editing reports the whole value alongside the untouched name, so a screen persisting it never has to merge two sources.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Instructions", userEvent)

		const brief = within(dialog).getByRole("textbox", { name: "Instructions" })

		await userEvent.clear(brief)
		await userEvent.type(brief, "Answer in French.")

		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk",
			instructions: "Answer in French.",
		})
	},
})

export const Danger = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The deletion pane, reached from the rail entry set below the separator. Check that the pane itself deletes nothing: the press opens a question naming the conversation, and only the answer to that question reports anything.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await openTab("Danger zone", userEvent)

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Delete conversation" }),
		)

		const popup = await screen.findByRole("alertdialog")
		await expect(popup).toHaveTextContent("Delete Release desk?")
		await expect(args.onDelete).not.toHaveBeenCalled()

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete conversation" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const Empty = meta.story({
	args: {
		value: { name: "", instructions: "" },
		participants: CONVERSATION_BOTS.slice(0, 1),
		leadId: "bot-atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation renamed to nothing, with no brief and one bot left. Check that the header falls back to a placeholder name instead of showing an empty breadcrumb, and that the single seat cannot be given up — a conversation with nobody in it can no longer answer.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveTextContent("Untitled conversation")

		const participants = await openTab("Participants", userEvent)
		await expect(
			within(participants).getByRole("button", { name: "Dismiss Atlas" }),
		).toBeDisabled()
	},
})

export const LongContent = meta.story({
	args: {
		value: {
			name: "Release notes, incident retro and on-call handover for the desktop build",
			instructions:
				"Ship notes are written for the people running the update, not for us. Name the change, then what it breaks, then what to do about it — in that order, every time, however small the release. Never assume the reader has followed the thread.",
		},
		participants: LONG_NAMED_BOTS,
		leadId: "bot-release",
		bots: [...LONG_NAMED_BOTS, ...CONVERSATION_BOTS],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation and bots named at length, with a brief that runs past the fold. Check that the header truncates the name and keeps the `Settings` breadcrumb visible, that participant rows truncate rather than pushing their controls away, and that the instructions field scrolls inside the pane instead of stretching the dialog.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await openTab("Participants", userEvent)

		await expect(
			within(dialog).getByRole("button", {
				name: "Give the lead to Incident triage and on-call handover companion",
			}),
		).toBeVisible()
	},
})
