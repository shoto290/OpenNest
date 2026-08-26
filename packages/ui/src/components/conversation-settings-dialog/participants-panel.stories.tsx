import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	ParticipantsPanel,
	type ParticipantsPanelProps,
} from "@workspace/ui/components/conversation-settings-dialog/participants-panel"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"

const SEATED = CONVERSATION_BOTS.slice(0, 3)

const PanelHost = (props: ParticipantsPanelProps) => {
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
		<ParticipantsPanel
			{...props}
			leadId={leadId}
			onDismiss={dismiss}
			onLeadChange={(id) => {
				setLeadId(id)
				props.onLeadChange(id)
			}}
			onRecruit={recruit}
			participants={participants}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/ParticipantsPanel",
	component: ParticipantsPanel,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Who takes part in a conversation, and who leads it. The seated bots are listed in the order they joined — the list never reorders itself, because that order is the conversation's history — and exactly one of them wears the crown. Moving the crown is a press on another row's crown; dismissing is the cross beside it. The panel owns nothing but the search string: every press is reported up, so the screen decides what a dismissal or a handover means. Two rules are enforced here rather than upstream — the last bot seated cannot be dismissed, and a bot already seated is never offered again, so the roster below only ever shows bots that can actually be recruited. Reach for `BotPicker` for that roster on its own, and for `ConversationSettingsDialog` for the panel in its rail.",
			},
		},
	},
	args: {
		participants: SEATED,
		leadId: SEATED[0]?.id ?? "",
		bots: CONVERSATION_BOTS,
		onLeadChange: fn(),
		onDismiss: fn(),
		onRecruit: fn(),
	},
	render: (args) => <PanelHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Three bots seated, the first leading. Check that the crown sits on exactly one row, that pressing another row's crown reports that bot and leaves a single crown behind, and that the leading row offers no crown button of its own — it is already the lead, there is nothing to press. Pick `LastParticipant` for the row that cannot be dismissed, `Empty` for a conversation nobody else can join.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotsIn(canvasElement, "participant")).toHaveLength(3)
		await expect(slotsIn(canvasElement, "participant-lead")).toHaveLength(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "Give the lead to Basile" }),
		)

		await expect(args.onLeadChange).toHaveBeenCalledWith("bot-basile")
		await expect(slotsIn(canvasElement, "participant-lead")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "participant")[1]).toHaveTextContent(
			"Lead",
		)
	},
})

export const Dismissed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot is sent out of the conversation. Check that the dismissed bot is the one reported and the one that leaves the list, that the rows left keep their joining order, and that the roster below now offers that bot back — dismissing returns it to the space, it does not delete it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Dismiss Basile" }),
		)

		await expect(args.onDismiss).toHaveBeenCalledWith("bot-basile")

		const rows = slotsIn(canvasElement, "participant")
		await expect(rows).toHaveLength(2)
		await expect(rows[0]).toHaveTextContent("Atlas")
		await expect(rows[1]).toHaveTextContent("Clémence")
		await expect(canvas.getByRole("button", { name: "Basile" })).toBeVisible()
	},
})

export const Recruited = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot from the space joins. Check that the recruit is reported and lands at the bottom of the list, never at the top — joining does not take the crown — and that its row disappears from the roster once it is seated, so it cannot be recruited twice.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Elia" }))

		await expect(args.onRecruit).toHaveBeenCalledWith("bot-elia")

		const rows = slotsIn(canvasElement, "participant")
		await expect(rows).toHaveLength(4)
		await expect(rows[3]).toHaveTextContent("Elia")
		await expect(rows[3]).not.toHaveTextContent("Lead")
		await expect(canvas.queryByRole("button", { name: "Elia" })).toBe(null)
	},
})

export const LastParticipant = meta.story({
	args: {
		participants: CONVERSATION_BOTS.slice(0, 1),
		leadId: "bot-atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"One bot left. A conversation with nobody in it cannot answer, so the last seat is held: the dismiss control is disabled and a line under the list says why, rather than letting the press fail silently. Check that the crown stays on that row and that recruiting anyone from the roster below frees the dismissal again.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Dismiss Atlas" }),
		).toBeDisabled()
		await expect(slotsIn(canvasElement, "participants-last")).toHaveLength(1)
		await expect(args.onDismiss).not.toHaveBeenCalled()

		await userEvent.click(canvas.getByRole("button", { name: "Faust" }))
		await expect(
			canvas.getByRole("button", { name: "Dismiss Atlas" }),
		).toBeEnabled()
	},
})

export const Empty = meta.story({
	args: {
		participants: CONVERSATION_BOTS,
		bots: CONVERSATION_BOTS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Every bot of the space is already seated, so there is nobody left to recruit. Check that the search field goes with the roster instead of standing over an empty list — searching a set with nothing in it is a dead end — and that a sentence says why rather than leaving a gap. This is not the same as `BotPicker`'s empty state, which covers a search matching nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "participants-all-seated"),
		).toHaveLength(1)
		await expect(canvas.queryByLabelText("Bots")).toBe(null)
	},
})

export const LongContent = meta.story({
	args: {
		participants: LONG_NAMED_BOTS,
		leadId: "bot-release",
		bots: [...LONG_NAMED_BOTS, ...CONVERSATION_BOTS],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Bots named at length. Check that a name truncates on one line instead of wrapping or pushing the crown and the cross off the row — the two controls stay reachable at any name length, which is what makes the row operable rather than pretty.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", {
				name: "Dismiss Incident triage and on-call handover companion",
			}),
		).toBeVisible()
	},
})
