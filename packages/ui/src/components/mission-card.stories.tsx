import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	MissionCard,
	type MissionCardModel,
} from "@workspace/ui/components/mission-card"
import {
	CLOSED_MISSION_CARD,
	WAITING_MISSION_CARD,
} from "@workspace/ui/components/missions.fixtures"

const LONG_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	bot: {
		...WAITING_MISSION_CARD.bot,
		name: "Anastasia Konstantinopoulou-Whitfield",
	},
	objective:
		"Follow every package this workspace depends on, read what each release changed, and open a mission for anything that touches the design tokens or the public component surface.",
	ticket: {
		externalId: "OPE-1042",
		title:
			"Rework the mission thread so a reader can follow a run that spans several days without losing the ticket it answers",
	},
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionCard",
	component: MissionCard,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A mission as it reads in the conversation it was opened from: who runs it, what it is for, which ticket it answers and where it stands. The whole card is the way into the mission thread, so it is one button rather than a surface with a link inside it. Reach for it in a transcript; the thread itself is `MissionThread`.",
			},
		},
	},
	args: { ...WAITING_MISSION_CARD, onOpen: fn() },
})

export const Waiting = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission still running, stopped on a question for its reader. Check that the objective reads at full contrast, that the badge dot on the avatar and the pill both say it is waiting, and that a pointer and a keyboard reach the same mission. Pick `Closed` for the form a finished mission takes.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const card = canvas.getByRole("button")

		await userEvent.click(card)
		await expect(args.onOpen).toHaveBeenCalledWith(WAITING_MISSION_CARD.id)

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenCalledTimes(2)
	},
})

export const Closed = meta.story({
	args: CLOSED_MISSION_CARD,
	parameters: {
		docs: {
			description: {
				story:
					"A mission that ran to the end. Check that the card steps back: no surface tint, the objective in muted text, no badge dot on the avatar, and the pill saying it is done. It stays a button, because the thread it summarises is still worth reading. Pick `Waiting` for the form that has to stand out beside it.",
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

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A long name, a long objective and a long ticket title, in a container squeezed to 320 pixels. Check that all three wrap instead of truncating, that the pill never leaves the card, and that the card grows taller rather than wider. Read it at 200 percent zoom too: nothing scrolls sideways.",
			},
		},
	},
	render: () => (
		<div className="w-80 max-w-full">
			<MissionCard {...LONG_MISSION_CARD} onOpen={fn()} />
		</div>
	),
})
