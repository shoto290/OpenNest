import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	MissionHeader,
	type MissionHeaderProps,
} from "@workspace/ui/components/mission-header"
import {
	MISSION_BOT,
	MISSION_TICKET,
	MISSION_TOOLS,
} from "@workspace/ui/components/missions.fixtures"

const WORKING_HEADER: MissionHeaderProps = {
	bot: MISSION_BOT,
	ticket: MISSION_TICKET,
	tools: MISSION_TOOLS,
	state: "working",
}

const LONG_HEADER: MissionHeaderProps = {
	...WORKING_HEADER,
	bot: { ...MISSION_BOT, name: "Anastasia Konstantinopoulou-Whitfield" },
	ticket: {
		externalId: "OPE-1042",
		title:
			"Rework the mission thread so a reader can follow a run that spans several days without losing the ticket it answers",
	},
	tools: [
		...MISSION_TOOLS,
		"Repository read and write over a very long tool name",
		"Screenshot",
	],
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionHeader",
	component: MissionHeader,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The top of a mission thread: who runs it, which ticket it answers, what it is allowed to reach for, and where it stands. Reach for it inside `MissionThread`; on its own it is useful to check that a long ticket title and a long tool list still leave the state pill in place.",
			},
		},
	},
	args: WORKING_HEADER,
	render: (args) => (
		<div className="w-[36rem] max-w-full">
			<MissionHeader {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission a bot is working on right now. Check that the ticket identifier reads before its title, that every tool is named, and that the state pill keeps its place at the end of the first line rather than wrapping under the name.",
			},
		},
	},
})

export const Escalated = meta.story({
	args: { state: "waiting_human" },
	parameters: {
		docs: {
			description: {
				story:
					"The mission stopped and is waiting on a human. Check that the escalation is drawn by the badge dot on the avatar and by the words in the pill, and by nothing else: the header takes no border, no tint and no ring of its own, so a reader scanning several threads sees one mark move rather than a whole surface change. Pick `Default` for the state this one has to be distinguishable from.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dot = slotIn(canvasElement, "bot-activity-dot")

		await expect(dot).toHaveAttribute("data-badge", "attention")
		await expect(
			slotIn(canvasElement, "mission-header").className,
		).not.toContain("bot-badge-attention")
	},
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A long bot name, a ticket title written as a sentence and more tools than the row can hold, in a container squeezed to 320 pixels. Check that the name and the title wrap instead of truncating, that the tool badges wrap onto further lines, and that nothing pushes the state pill out of the header. Read it at 200 percent zoom too: the header grows taller, it never scrolls sideways.",
			},
		},
	},
	render: () => (
		<div className="w-80 max-w-full">
			<MissionHeader {...LONG_HEADER} />
		</div>
	),
})
