import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	PICKED_PICTURE_FILE,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BotPictureField } from "@workspace/ui/components/bot-picture-field"
import type { BotIdentity } from "@workspace/ui/components/bot-settings"

const IDENTITY: BotIdentity = { animal: "owl", blot: "blue" }

const meta = preview.meta({
	title: "Forms/BotPictureField",
	component: BotPictureField,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A bot's picture, as the control that sets it: the same round target the reader's own picture wears, in the same size, with the remove button pinned on the same corner. What differs is the empty state — a bot with no picture is never a blank, it has a face the engine draws, so the circle shows that face rather than a person glyph and the edge stays solid. Pressing it opens the picker; a file dropped on it or pasted into it goes the same way. It holds nothing: the picked file and the removal both go straight to the host, which stores the picture and writes it back as `image`.",
			},
		},
	},
	args: {
		identity: { ...IDENTITY, image: UPLOADED_AVATAR_IMAGE },
		seed: "bot-7",
		onPick: fn(),
		onRemove: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A bot wearing a picture. Check that the picture fills the circle rather than sitting in a box inside it, that the remove button sits on the bottom trailing corner without covering the face, and that both press targets only report — the field draws what it is given and nothing moves until the host writes back. Pick `Drawn` for the bot that has no picture yet.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const input = canvas.getByLabelText("Avatar image file")

		await expect(
			canvas.getByRole("button", { name: "Change picture" }),
		).toBeVisible()
		await userEvent.upload(input, PICKED_PICTURE_FILE)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
		await expect(input).toHaveValue("")

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove picture" }),
		)
		await expect(args.onRemove).toHaveBeenCalledTimes(1)
	},
})

export const Drawn = meta.story({
	args: { identity: IDENTITY },
	parameters: {
		docs: {
			description: {
				story:
					"The bot that never uploaded one. Check that the circle carries the animal the bot is drawn as, on the blot it wears, rather than an empty outline — the fallback is the real face, so the reader sees what taking the picture off would give back. It names itself `Add picture`, and no remove button is reachable by pointer or by Tab: there is nothing to take off.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
		await expect(
			canvasElement.querySelector('svg[role="img"]'),
		).toHaveAttribute("aria-label", "Bot avatar owl, idle")

		await userEvent.upload(
			canvas.getByLabelText("Avatar image file"),
			PICKED_PICTURE_FILE,
		)
		await expect(args.onPick).toHaveBeenCalledWith(PICKED_PICTURE_FILE)
	},
})

export const States = meta.story({
	render: (args) => (
		<div className="flex items-center gap-8">
			<div id="bot-picture-drawn-hover">
				<BotPictureField {...args} identity={IDENTITY} />
			</div>
			<div id="bot-picture-drawn-focus">
				<BotPictureField {...args} identity={IDENTITY} />
			</div>
			<div id="bot-picture-filled-hover">
				<BotPictureField {...args} />
			</div>
			<div id="bot-picture-remove-hover">
				<BotPictureField {...args} />
			</div>
		</div>
	),
	parameters: {
		pseudo: {
			hover: [
				"#bot-picture-drawn-hover button",
				"#bot-picture-filled-hover button",
				"#bot-picture-remove-hover button:last-of-type",
			],
			focusVisible: "#bot-picture-drawn-focus button",
		},
		docs: {
			description: {
				story:
					"The drawn face under a pointer and under a keyboard, then the worn picture and its remove button under a pointer. Check that hover warms the edge without moving the face, that the focus ring reads against the blot behind it, and that the ring on the round control is not clipped by its own overflow. Two Tabs cover a worn picture — the control, then remove — and the file input behind them is not a stop of its own.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		await expect(canvas.getAllByRole("button")[0]).toHaveFocus()
	},
})
