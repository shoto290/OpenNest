import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	MissionThread,
	type MissionThreadProps,
} from "@workspace/ui/components/mission-thread"
import {
	MISSION_BOT,
	MISSION_EVENTS,
	MISSION_NOW,
	MISSION_TICKET,
	MISSION_TOOLS,
} from "@workspace/ui/components/missions.fixtures"

const WORKING_THREAD: Omit<MissionThreadProps, "onRetry" | "onSend"> = {
	bot: MISSION_BOT,
	ticket: MISSION_TICKET,
	tools: MISSION_TOOLS,
	state: "working",
	isClosed: false,
	events: MISSION_EVENTS,
	now: MISSION_NOW,
	hasFailedToRead: false,
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionThread",
	component: MissionThread,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A mission read end to end: its header, everything it recorded, and the composer that answers it. It is the thread surface the rest of the app already uses, filled with mission events rather than turns, so scrolling, anchoring and the jump control behave the way a reader expects. The screen that opens it and the send it hands off belong to the app.",
			},
		},
	},
	args: {
		...WORKING_THREAD,
		onRetry: fn(),
		onSend: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission running, with events behind it and a composer ready. Check that the header holds still while the feed scrolls, and that what is typed reaches `onSend` rather than being posted by the component itself.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const composer = canvas.getByRole("textbox")

		await userEvent.type(composer, "Take the second option.")
		await userEvent.keyboard("{Enter}")

		await expect(args.onSend).toHaveBeenCalledWith("Take the second option.")
	},
})

export const Empty = meta.story({
	args: { events: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A mission opened a second ago, with nothing recorded yet. Check that the feed is genuinely empty and that no placeholder shell takes the room the first event will need. Pick `Default` for the same thread once events land.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "mission-feed")[0],
		).toBeEmptyDOMElement()
	},
})

export const Closed = meta.story({
	args: { state: "done", isClosed: true },
	parameters: {
		docs: {
			description: {
				story:
					"A mission that has been closed. Check that the composer is disabled rather than hidden: the thread stays readable and the reader can see there is nothing more to say into it. Pick `Default` for the composer that still takes text.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("textbox")).toBeDisabled()
	},
})

export const Error = meta.story({
	args: { hasFailedToRead: true, events: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The read of the mission failed. Check that the notice takes the place of the feed rather than sitting above a half-filled one, that it says nothing was changed, and that the retry is the only way forward it offers. Pick `Empty` for a read that succeeded and found nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))

		await expect(args.onRetry).toHaveBeenCalled()
	},
})
