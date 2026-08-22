import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { botIdentityAvatars } from "@workspace/storybook/story-utils"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"

/** A picture a reader uploaded, inline so the story needs no host to load it. */
const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

/** The bot this conversation belongs to, as the app hands it over: a name, an
 * animal, the tint it was marked with and the id its blot is shaped from. */
const BOT = {
	name: "Nest Keeper",
	animal: "rabbit",
	blot: "blue",
	seed: "bot_4f8c21",
} as const

const meta = preview.meta({
	title: "AI/ChatEmptyState",
	component: ChatEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface OpenNest shows before a conversation holds any message. It carries the whole first-run decision: either Claude Code answers and the reader is sent to the composer, or it does not and the reader is sent to setup. When it answers, the screen belongs to the bot — its face is the mark and its name is the title — so opening an empty conversation says which bot is about to be talked to. It owns its own copy and holds no sidebar, roster, suggestion or navigation — compose it above a composer, never inside a chat screen shell.",
			},
		},
	},
	args: {
		onSetup: fn(),
		...BOT,
	},
	argTypes: {
		status: { control: "inline-radio", options: ["ready", "unavailable"] },
	},
})

export const Default = meta.story({
	args: { status: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a genuine first launch of one bot's conversation: Claude Code answered, the composer below is live, and the surface has to name the bot and point down to it. Check that the title is the bot's name, that the mark above it is that bot's face over its tint and reads as an ornament of the heading rather than a roster row, and that the guidance is the arrow hint and nothing else — no button competes with the composer for the first action. Pick `Unavailable` instead when the CLI is unreachable and typing would fail.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("heading", { name: BOT.name })).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
		await expect(
			canvas.getByText(/Type your first prompt in the composer below/),
		).toBeVisible()
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const WithSettings = meta.story({
	args: { status: "ready", onOpenSettings: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on the empty conversation of a host that can open the bot's settings: nothing has been said yet, so describing the bot is still worth offering beside the first prompt. Check that the action sits under the copy and above the arrow hint, that it reads as secondary — the first prompt is still the point of the screen — and that it names the settings exactly as the bar above and the roster row's menu do, so the same door is not called three things. Pick `Default` for a host that offers no way in from here.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const settings = canvas.getByRole("button", { name: "Bot settings" })

		await expect(
			canvas.getByText(/Type your first prompt in the composer below/),
		).toBeVisible()
		await userEvent.click(settings)
		await expect(args.onOpenSettings).toHaveBeenCalled()
	},
})

export const WithoutBlot = meta.story({
	args: { status: "ready", blot: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a bot that was never marked with a tint: the animal is drawn on nothing. Check that the mark still holds the same box as `Default` — the heading must not shift up when the tint behind the animal is gone. Pick `Default` for a bot that carries one.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(
			avatar.querySelector('[data-slot="bot-avatar-blot"]'),
		).toBeNull()
	},
})

export const WithPicture = meta.story({
	args: { status: "ready", image: UPLOADED_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a bot whose reader uploaded a picture: it wins over the animal here exactly as it does on the roster row. Check that the picture fills the same round box the drawing would have, so the title lands on the same baseline. Pick `Default` for a bot wearing its animal.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(avatar.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_IMAGE,
		)
	},
})

export const Unnamed = meta.story({
	args: { status: "ready", name: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the bot has no name yet — a conversation opened before its bot was named. Check that the title falls back to naming the product instead of showing an empty heading, and that the mark is still drawn. Pick `Default` once the bot carries a name.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Start with Claude Code" }),
		).toBeVisible()
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when OpenNest launched but its built-in agent is unreachable: the composer is disabled, so the empty state has to carry the only action left. This screen is about the agent, not about the bot — check that the bot's face and name give way to the alert mark and the agent copy, that the retry button is the single focusable target, and that the copy blames the unreachable agent rather than the prompt. Pick `Default` when Claude Code answers and the composer is live.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const setup = canvas.getByRole("button", { name: "Try again" })

		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await expect(canvas.queryByText(BOT.name)).toBeNull()
		await userEvent.click(setup)
		await expect(args.onSetup).toHaveBeenCalled()
	},
})
