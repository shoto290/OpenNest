import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { botIdentityAvatars, pictureOf } from "@workspace/storybook/story-utils"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"

const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

const BOT = {
	name: "Nest Keeper",
	animal: "rabbit",
	blot: "blue",
	seed: "bot_4f8c21",
} as const

const meta = preview.meta({
	title: "Conversation/Message/ChatEmptyState",
	component: ChatEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface Kiroshi shows before a conversation holds any message. It carries the whole first-run decision: either Claude Code answers and the reader is sent to the composer, or it does not and the reader is sent to setup. When it answers, the screen belongs to the companion — its face is the mark and its name is the title — so opening an empty conversation says which companion is about to be talked to. It owns its own copy and holds no sidebar, roster, suggestion or navigation — compose it above a composer, never inside a chat screen shell.",
			},
		},
	},
	args: {
		onSetup: fn(),
		onSignIn: fn(),
		...BOT,
	},
	argTypes: {
		status: {
			control: "inline-radio",
			options: ["ready", "unavailable", "notConnected"],
		},
	},
})

export const Default = meta.story({
	args: { status: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a genuine first launch of one companion's conversation: Claude Code answered, the composer below is live, and the surface has to name the companion and point down to it. Check that the title is the companion's name, that the mark above it is that companion's face over its tint and reads as an ornament of the heading rather than a roster row, and that the guidance is the arrow hint and nothing else — no button competes with the composer for the first action. Pick `Unavailable` instead when the CLI is unreachable and typing would fail.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("heading", { name: BOT.name })).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
		await expect(
			canvas.getByText(/Message a companion to start\./),
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
					"Reach for this on the empty conversation of a host that can open the companion's settings: nothing has been said yet, so describing the companion is still worth offering beside the first message. Check that the action sits under the copy and above the arrow hint, that it reads as secondary — the first message is still the point of the screen — and that it names the settings exactly as the bar above and the roster row's menu do, so the same door is not called three things. Pick `Default` for a host that offers no way in from here.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const settings = canvas.getByRole("button", { name: "Companion settings" })

		await expect(
			canvas.getByText(/Message a companion to start\./),
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
					"Reach for this for a companion that was never marked with a tint: the animal is drawn on nothing. Check that the mark still holds the same box as `Default` — the heading must not shift up when the tint behind the animal is gone. Pick `Default` for a companion that carries one.",
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
					"Reach for this for a companion whose reader uploaded a picture: it wins over the animal here exactly as it does on the roster row. Check that the picture fills the same round box the drawing would have, so the title lands on the same baseline. Pick `Default` for a companion wearing its animal.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(await pictureOf(avatar)).toHaveAttribute("src", UPLOADED_IMAGE)
	},
})

export const Unnamed = meta.story({
	args: { status: "ready", name: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the companion has no name yet — a conversation opened before its companion was named. Check that the title falls back to naming the product instead of showing an empty heading, and that the mark is still drawn. Pick `Default` once the companion carries a name.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Start with the agent" }),
		).toBeVisible()
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when Kiroshi launched but its built-in agent is unreachable: the composer is disabled, so the empty state has to carry the only action left. This screen is about the agent, not about the companion — check that the companion's face and name give way to the alert mark and the agent copy, that the retry button is the single focusable target, and that the copy blames the unreachable agent rather than the prompt. Pick `Default` when Claude Code answers and the composer is live.",
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

export const NotConnected = meta.story({
	args: { status: "notConnected" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the agent answers but no Claude account is connected: talking to the companion cannot work until the reader signs in, so the empty state carries the sign-in action. Check that the alert mark replaces the companion's face, that the title says the reader is not signed in rather than blaming the agent, and that the sign-in button is the single focusable target. Pick `Unavailable` when the agent itself does not answer.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const signIn = canvas.getByRole("button", { name: "Sign in" })

		await expect(
			canvas.getByRole("heading", { name: "You're not signed in" }),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await userEvent.click(signIn)
		await expect(args.onSignIn).toHaveBeenCalled()
		await expect(args.onSetup).not.toHaveBeenCalled()
	},
})
