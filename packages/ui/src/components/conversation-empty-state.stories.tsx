import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import type { RosterBot } from "@workspace/ui/components/roster"

const KEEPER: RosterBot = {
	id: "bot_4f8c21",
	name: "Nest Keeper",
	animal: "rabbit",
	blot: "blue",
}
const SCOUT: RosterBot = {
	id: "bot_9a2b40",
	name: "Twig Scout",
	animal: "mouse",
	blot: "orange",
}
const WARDEN: RosterBot = {
	id: "bot_1c7d55",
	name: "Shell Warden",
	animal: "koala",
	blot: "green",
}

const SEATED = [KEEPER, SCOUT, WARDEN]

const meta = preview.meta({
	title: "AI/ConversationEmptyState",
	component: ConversationEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What a conversation shows in place of its transcript while nothing has been said in it. Unlike the single-bot empty state, this room is already set up — every seated bot is here and the lead is ready to answer — so the surface has nothing to configure and no error to report: it names the room, shows who is in it, and points down to the composer. It owns its own copy and draws no header, roster or composer — mount it as the only child of the transcript region.",
			},
		},
	},
	args: {
		title: "Ship the December release",
		bots: SEATED,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation just created with several bots: the room is seated and waiting on its first message. Check that the heading is the conversation's name — not a bot's — that every seated bot's face is shown above it, that the count in the copy matches the faces, and that the arrow hint is the only guidance so nothing competes with the composer below. Pick `SingleBot` for a room seated with one bot.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "Ship the December release" }),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(3)
		await expect(
			canvas.getByText(/3 bots are seated here and waiting/),
		).toBeVisible()
	},
})

export const SingleBot = meta.story({
	args: { bots: [KEEPER] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation seated with one bot only. Check that the copy turns singular rather than reading `1 bots`, and that the lone face still sits centered above the heading instead of drifting left. Pick `Default` for a room with several bots.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(/1 bot is seated here and waiting/),
		).toBeVisible()
	},
})

export const WithPicture = meta.story({
	args: {
		bots: [{ ...KEEPER, image: UPLOADED_AVATAR_IMAGE }, SCOUT, WARDEN],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when one seated bot carries an uploaded picture and the others wear their drawn animal. Check that the picture fills the same round box the drawing would, so the row of faces keeps one baseline and one rhythm. Pick `Default` when every bot wears its animal.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(avatar?.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"Ship the December release, then plan the January retrospective with everyone involved",
		bots: [
			...SEATED,
			{ id: "bot_7e3f18", name: "Moss Reader", animal: "owl", blot: "purple" },
			{ id: "bot_2b9a06", name: "Pebble Clerk", animal: "cat", blot: "pink" },
			{ id: "bot_8d4c73", name: "Fern Guide", animal: "bear", blot: "cyan" },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a long-named room seated with more bots than fit one line. Check that the heading wraps inside its measure instead of stretching the surface, and that the faces wrap onto a second centered row rather than overflowing. Pick `Default` for the nominal room.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(6)
	},
})
