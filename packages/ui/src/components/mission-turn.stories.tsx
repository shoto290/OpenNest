import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
import {
	CLOSED_MISSION_CARD,
	MISSION_BOT,
	WAITING_MISSION_CARD,
} from "@workspace/ui/components/missions.fixtures"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"

const OPENING_AUTHOR: MessageAuthor = {
	id: "bot-ada-martin",
	name: MISSION_BOT.name,
	animal: MISSION_BOT.animal,
}

const OPENING_ANSWER =
	"That one is wide enough to run on its own, so I opened a mission for it and I will report here when it lands."

const meta = preview.meta({
	title: "Conversation/Missions/MissionTurn",
	component: MissionTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A mission as it lands in the transcript it was opened from: the card sits in the content column of the bot that opened it, past the avatar gutter and no wider than a soft bubble, with no author line of its own. Reach for it in a conversation feed; the card on its own is `MissionCard`.",
			},
		},
	},
	args: { mission: WAITING_MISSION_CARD, onOpen: fn() },
})

export const Opened = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A running mission on its own row. Check that the card starts where a bubble starts, stops before the far edge, and that a pointer and a keyboard both reach the mission thread.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const card = canvas.getByRole("button")

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenCalledWith(WAITING_MISSION_CARD.id)
	},
})

export const UnderTheTurnThatOpenedIt = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The row as a reader meets it, right under the answer that opened the mission. Check that the card lines up with the bubble above it and that the bot is named once, by the turn, not twice.",
			},
		},
	},
	render: (args) => (
		<>
			<TurnGroup>
				<AssistantTurn author={OPENING_AUTHOR}>{OPENING_ANSWER}</AssistantTurn>
			</TurnGroup>
			<MissionTurn {...args} />
		</>
	),
})

export const Closed = meta.story({
	args: { mission: CLOSED_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A mission that ran to the end stays in the transcript, carrying its final state. Check that it steps back from the running one without leaving the feed.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button")).toHaveAttribute(
			"data-closed",
			"true",
		)
	},
})
