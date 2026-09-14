import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	pictureOf,
	slotIn,
	slotsIn,
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
	title: "Conversation/Message/ConversationEmptyState",
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
					"Reach for this on a conversation just created with several companions: the room is seated and waiting on its first message. Check that the heading is the conversation's name — not a companion's — that every seated companion's face is shown above it, that the count in the copy matches the faces, and that the arrow hint is the only guidance so nothing competes with the composer below. Pick `SingleBot` for a room seated with one companion.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "Ship the December release" }),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(3)
		await expect(canvas.getByText(/3 companions are ready/)).toBeVisible()
	},
})

export const SingleBot = meta.story({
	args: { bots: [KEEPER] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation seated with one companion only. Check that the copy turns singular rather than reading `1 companions`, and that the lone face still sits centered above the heading instead of drifting left. Pick `Default` for a room with several companions.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText(/1 companion is ready/)).toBeVisible()
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
					"Reach for this when one seated companion carries an uploaded picture and the others wear their drawn animal. Check that the picture fills the same round box the drawing would, so the row of faces keeps one baseline and one rhythm. Pick `Default` when every companion wears its animal.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(await pictureOf(avatar)).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
	},
})

const SUGGESTED: RosterBot[] = [
	KEEPER,
	SCOUT,
	WARDEN,
	{ id: "bot_7e3f18", name: "Moss Reader", animal: "owl", blot: "purple" },
	{ id: "bot_2b9a06", name: "Pebble Clerk", animal: "cat", blot: "pink" },
]

const NOBODY_TITLE = "Nobody is in this conversation yet"

const NOBODY_DESCRIPTION =
	"Type @ and pick a name. Whoever you mention joins, and they can bring in anyone else they need."

const suggestedPresses = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "conversation-suggested-bot")

export const Empty = meta.story({
	args: { bots: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation nobody is seated in and with nobody to suggest. Check that the @ mark, the title and the description replace the faces, the conversation name and the ready count, that no arrow hint is drawn, and that nothing follows the description. Pick `EmptyWithSuggestions` when companions can be pressed.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: NOBODY_TITLE }),
		).toBeVisible()
		await expect(canvas.getByText(NOBODY_DESCRIPTION)).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await expect(
			canvas.queryByText("Message a companion to start."),
		).not.toBeInTheDocument()
		await expect(canvas.queryByText("Ship the December release")).toBeNull()
		await expect(canvas.queryByRole("button")).toBeNull()
		await expect(canvas.getByText(NOBODY_DESCRIPTION).parentElement).toBe(
			slotIn(canvasElement, "conversation-empty-state").lastElementChild,
		)
	},
})

export const EmptyWithSuggestions = meta.story({
	args: { bots: [], suggestedBots: SUGGESTED, onSuggestedBotPress: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation nobody is seated in, with the companions the person talks to most offered below the copy. Check that the label sits above one outline press per companion, that each press carries a face and a name, and that pressing one hands exactly that companion back once: the press writes a mention into the draft, it never invites. Pick `Empty` when there is nobody to suggest.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(canvas.getByText("The ones you talk to most")).toBeVisible()
		await expect(suggestedPresses(canvasElement)).toHaveLength(5)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(5)
		await expect(
			canvas.queryByText("Message a companion to start."),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Twig Scout" }))

		await expect(args.onSuggestedBotPress).toHaveBeenCalledTimes(1)
		await expect(args.onSuggestedBotPress).toHaveBeenCalledWith(SCOUT)
	},
})

export const EmptyWithSuggestionsFocused = meta.story({
	args: { bots: [], suggestedBots: SUGGESTED, onSuggestedBotPress: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check a suggested companion reached from the keyboard. Check that the first press takes focus on the first tab and draws a visible ring around its pill. Pick `EmptyWithSuggestions` for the pointer path.",
			},
		},
	},
	play: async ({ canvas }) => {
		const press = canvas.getByRole("button", { name: "Nest Keeper" })

		await userEvent.tab()

		await expect(press).toHaveFocus()
		await expect(press.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(press).boxShadow).not.toBe("none")
	},
})

export const EmptyWithSuggestionsNarrow = meta.story({
	args: { bots: [], suggestedBots: SUGGESTED, onSuggestedBotPress: fn() },
	decorators: [
		(Story) => (
			<div className="w-80" data-testid="narrow-frame">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a narrow window, 320 pixels wide, where the five suggested companions cannot share one line. Check that the presses wrap onto further centered rows and that nothing scrolls sideways. Pick `EmptyWithSuggestions` for the nominal width.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const frame = canvas.getByTestId("narrow-frame")
		const rows = new Set(
			suggestedPresses(canvasElement).map(
				(press) => press.getBoundingClientRect().top,
			),
		)

		await expect(rows.size).toBeGreaterThan(1)
		await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth)
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
					"Reach for this on a long-named room seated with more companions than fit one line. Check that the heading wraps inside its measure instead of stretching the surface, and that the faces wrap onto a second centered row rather than overflowing. Pick `Default` for the nominal room.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(6)
	},
})
