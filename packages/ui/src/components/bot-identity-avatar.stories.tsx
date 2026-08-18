import { useState } from "react"
import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"

/** A picture a reader uploaded, inline so the story needs no host to load it. */
const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

/** The three sizes the product draws this at: a roster row and a reply are the
 * same 40, the settings preview is 96. */
const SIZES = [40, 96, 24]

const avatars = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="bot-identity-avatar"]',
		),
	)

/** Every place at once, on one identity: what the roster row, the settings column
 * and the reply each draw, side by side. */
const EveryPlace = (props: BotIdentityAvatarProps) => (
	<Row>
		{SIZES.map((size) => (
			<BotIdentityAvatar {...props} key={size} size={size} />
		))}
	</Row>
)

/** The same three, with a control that changes the bot. */
const Changing = (props: BotIdentityAvatarProps) => {
	const [wearing, setWearing] = useState(false)

	return (
		<div className="flex flex-col items-start gap-4">
			<EveryPlace
				{...props}
				animal={wearing ? "bear" : props.animal}
				image={wearing ? UPLOADED_IMAGE : undefined}
			/>
			<Button onClick={() => setWearing(!wearing)} size="sm" variant="outline">
				Change the bot
			</Button>
		</div>
	)
}

const meta = preview.meta({
	title: "AI/BotIdentityAvatar",
	component: BotIdentityAvatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A bot's face, wherever it is shown: the roster row, its settings column, the replies it signs, the row that says it is working. One component for all of them, because a bot that picked a rabbit is a rabbit everywhere or it is not an identity — three renderings drift the moment one of them learns something the others do not. It draws and nothing else: no name, no live region, no layout. A picture wins over the animal and never moves, so work is said with the dot at its corner; an animal performs the work itself, in the pose the work is named after, and holds a single still frame at rest. Size is the only thing a call site changes.",
			},
		},
	},
	args: {
		animal: "rabbit",
		pose: "curious",
		size: 96,
	},
	argTypes: {
		size: { control: { type: "range", min: 16, max: 160, step: 8 } },
		working: { control: "boolean" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One bot at rest: the animal it was given, in the pose it was given, drawn once and left alone. Check that nothing moves and that no activity dot is drawn — a bot doing nothing must look like a bot doing nothing. Pick `Working` for the same bot mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = avatars(canvasElement)

		await expect(
			within(avatar).getByRole("img", { name: "Bot avatar rabbit, curious" }),
		).toBeVisible()
		await expect(
			avatar.querySelector('[data-slot="bot-activity-dot"]'),
		).toBeNull()
	},
})

export const EverySize = meta.story({
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The three sizes the product asks for — a roster row, a settings column, a reply — from one component and one identity. Check that they are the same drawing at three scales and not three drawings: the same animal, the same pose, the same round frame. Nothing else may differ, because nothing else is passed.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const drawn = avatars(canvasElement)

		await expect(drawn).toHaveLength(SIZES.length)
		for (const [index, avatar] of drawn.entries()) {
			await expect(avatar.getBoundingClientRect().width).toBeCloseTo(
				SIZES[index],
				0,
			)
			await expect(
				within(avatar).getByRole("img", { name: "Bot avatar rabbit, curious" }),
			).toBeVisible()
		}
	},
})

export const Working = meta.story({
	args: { working: true, kind: "writing" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The bot at work, in all three places. The animal doing the work is the bot's own — a run must never put a different creature on the screen than the one the reader chose — and the pose is the work: writing, searching, thinking, or listening while it waits on the reader. Every size also wears the dot, sized from the avatar so it reads the same on a 24px reply as on a 96px preview. Open this in Storybook for the movement; the test browser forces reduced motion.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of avatars(canvasElement)) {
			await expect(
				within(avatar).getByRole("img", { name: "Bot avatar rabbit, writing" }),
			).toBeVisible()
			await expect(
				avatar.querySelector('[data-slot="bot-activity-dot"]'),
			).not.toBeNull()
		}
	},
})

export const Waiting = meta.story({
	args: { working: true, kind: "waiting" },
	parameters: {
		docs: {
			description: {
				story:
					"The one kind of work that is not named after its own pose: a bot waiting on the reader is listening, not idling. Reach for this to check that waiting still reads as attention rather than as rest, and that the bot's own animal is the one doing the listening.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = avatars(canvasElement)

		await expect(
			within(avatar).getByRole("img", { name: "Bot avatar rabbit, listening" }),
		).toBeVisible()
	},
})

export const Uploaded = meta.story({
	args: { image: UPLOADED_IMAGE },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A bot wearing a picture its reader uploaded. It wins over the animal in every place — a bot with a photograph is that photograph on the roster, in its settings and beside its replies — and it is decorative in all of them: the row, the column and the reply each name the bot in their own text, so the image says nothing twice. Check that no animal is drawn beside it. Pick `UploadedWorking` for the same picture mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of avatars(canvasElement)) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_IMAGE,
			)
			await expect(avatar.querySelector("svg")).toBeNull()
		}
	},
})

export const UploadedWorking = meta.story({
	args: { image: UPLOADED_IMAGE, working: true, kind: "searching" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A bot with a picture, working. The picture stays: swapping it for an animal that can move would put somebody else on the screen mid-run. A photograph cannot act, so the work is the dot at its corner and nothing else. Check that the dot is drawn at every size and that the picture is untouched.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of avatars(canvasElement)) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_IMAGE,
			)
			await expect(
				avatar.querySelector('[data-slot="bot-activity-dot"]'),
			).not.toBeNull()
		}
	},
})

export const BoundToOneBot = meta.story({
	render: (args) => <Changing {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"What one component buys: change the bot and every place changes with it. Press the button and all three sizes go from the rabbit to a picture together — there is no fourth rendering left to forget, which is what the roster row and the reply avatar each used to be. Check that the three never disagree at any point.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const drawn = () => avatars(canvasElement)

		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toBeNull()
		}

		await userEvent.click(
			canvas.getByRole("button", { name: "Change the bot" }),
		)
		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_IMAGE,
			)
			await expect(avatar.querySelector("svg")).toBeNull()
		}

		await userEvent.click(
			canvas.getByRole("button", { name: "Change the bot" }),
		)
		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toBeNull()
			await expect(
				within(avatar).getByRole("img", { name: "Bot avatar rabbit, curious" }),
			).toBeVisible()
		}
	},
})
