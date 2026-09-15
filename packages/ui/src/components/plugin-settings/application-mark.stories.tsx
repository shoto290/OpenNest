import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { CURATED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationMark",
	component: ApplicationMark,
	parameters: {
		docs: {
			description: {
				component:
					"The slot an application's mark sits in. The mark comes from the application's data; without one, the slot shows the server glyph on the muted surface at the same size.",
			},
		},
	},
	args: { mark: CURATED_APPLICATIONS[0].mark },
})

export const WithMark = meta.story({
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("img")).not.toBeNull()
	},
})

export const WithoutMark = meta.story({
	args: { mark: undefined },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("img")).toBeNull()
		await expect(canvasElement.querySelector("svg")).not.toBeNull()
	},
})

const expectSlotWidth = async (canvasElement: HTMLElement, width: number) => {
	await expect(
		slotIn(canvasElement, "application-mark").getBoundingClientRect().width,
	).toBe(width)
}

export const Medium = meta.story({
	args: { size: "md" },
	parameters: {
		docs: {
			description: {
				story:
					"The 36 slot of a settings row. Pick `Card` for the application card in the conversation.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 36),
})

export const Card = meta.story({
	args: { size: "card" },
	parameters: {
		docs: {
			description: {
				story:
					"The 32 slot of the application card, in an install bubble and on the receipt.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 32),
})

export const Small = meta.story({
	args: { size: "sm" },
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 28),
})

export const ExtraSmall = meta.story({
	args: { size: "xsm" },
	parameters: {
		docs: {
			description: {
				story:
					"The 24 slot of the application editor header, beside the name of the application being edited.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 24),
})

export const Inline = meta.story({
	args: { size: "inline" },
	parameters: {
		docs: {
			description: {
				story:
					"The 22 slot that sits on the line of a question, before its text. Pick `Smallest` for the smallest slot.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 22),
})

export const Smallest = meta.story({
	args: { size: "xs" },
	parameters: {
		docs: {
			description: {
				story: "The 20 slot, the smallest the mark takes.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 20),
})
