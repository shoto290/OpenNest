import { useState } from "react"
import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	Row,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BLOT_TINTS } from "@workspace/ui/components/bot-avatar"
import { blotTransform } from "@workspace/ui/components/bot-avatar-blot"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"

/** The three sizes the product draws this at: a roster row and a reply are the
 * same 40, the settings preview is 96. */
const SIZES = [40, 96, 24]

const blotShapeOf = (avatar: HTMLElement) =>
	slotsIn(avatar, "bot-avatar-blot")[0]?.getAttribute("transform")

/** Every place at once, on one identity: what the roster row, the settings column
 * and the reply each draw, side by side. */
const EveryPlace = (props: BotIdentityAvatarProps) => (
	<Row>
		{SIZES.map((size) => (
			<BotIdentityAvatar {...props} key={size} size={size} />
		))}
	</Row>
)

/** One bot, with a control that changes everything a reader is allowed to change
 * about it. Its id is the one thing that stays. */
const Rebranded = (props: BotIdentityAvatarProps) => {
	const [rebranded, setRebranded] = useState(false)

	return (
		<div className="flex flex-col items-start gap-4">
			<BotIdentityAvatar
				{...props}
				animal={rebranded ? "bear" : "rabbit"}
				blot={rebranded ? "red" : "blue"}
				working={rebranded}
			/>
			<Button
				onClick={() => setRebranded(!rebranded)}
				size="sm"
				variant="outline"
			>
				Change everything but the id
			</Button>
		</div>
	)
}

/** The same three, with a control that changes the bot. */
const Changing = (props: BotIdentityAvatarProps) => {
	const [wearing, setWearing] = useState(false)

	return (
		<div className="flex flex-col items-start gap-4">
			<EveryPlace
				{...props}
				animal={wearing ? "bear" : props.animal}
				image={wearing ? UPLOADED_AVATAR_IMAGE : undefined}
			/>
			<Button onClick={() => setWearing(!wearing)} size="sm" variant="outline">
				Change the bot
			</Button>
		</div>
	)
}

const meta = preview.meta({
	title: "Branding/BotIdentityAvatar",
	component: BotIdentityAvatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A bot's face, wherever it is shown: the roster row, its settings column, the replies it signs, the row that says it is working. One component for all of them, because a bot that picked a rabbit is a rabbit everywhere or it is not an identity — three renderings drift the moment one of them learns something the others do not. It draws and nothing else: no name, no live region, no layout. What tells one bot from another is its animal and the ink blot behind it; every bot at rest holds the same idle frame, so a resting panel says nothing about what anyone is doing. A picture wins over both and never moves, so work is said with the dot at its corner; an animal performs the work itself, in the pose the work is named after. Size is the only thing a call site changes.",
			},
		},
	},
	args: {
		animal: "rabbit",
		blot: "blue",
		seed: "bot-7",
		size: 96,
	},
	argTypes: {
		blot: { control: "select", options: [undefined, ...BLOT_TINTS] },
		seed: { control: "text" },
		size: { control: { type: "range", min: 16, max: 160, step: 8 } },
		working: { control: "boolean" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One bot at rest: the animal it was given, over the blot it was given, drawn once and left alone. Check that nothing moves, that the blot sits behind the whole animal without a stroke of its own, and that no activity dot is drawn — a bot doing nothing must look like a bot doing nothing. Pick `EveryBlot` for the other seven tints, `Working` for the same bot mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(
			within(avatar).getByRole("img", { name: "Bot avatar rabbit, idle" }),
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
					"The three sizes the product asks for — a roster row, a settings column, a reply — from one component and one identity. Check that they are the same drawing at three scales and not three drawings: the same animal, the same blot, the same round frame. Nothing else may differ, because nothing else is passed.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const drawn = botIdentityAvatars(canvasElement)

		await expect(drawn).toHaveLength(SIZES.length)
		for (const [index, avatar] of drawn.entries()) {
			await expect(avatar.getBoundingClientRect().width).toBeCloseTo(
				SIZES[index],
				0,
			)
			await expect(
				within(avatar).getByRole("img", { name: "Bot avatar rabbit, idle" }),
			).toBeVisible()
		}
	},
})

export const EveryBlot = meta.story({
	render: (args) => (
		<Row>
			<BotIdentityAvatar {...args} blot={undefined} />
			{BLOT_TINTS.map((blot) => (
				<BotIdentityAvatar {...args} blot={blot} key={blot} />
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The eight tints a bot can be marked with, and the bot marked with none. The names are the ones an agent file's `color` key reads. Seven inks came through the renaming untouched — `purple` is the lavender it always was; `orange` is the one that was drawn again, because the grey it inherited did not answer to the word. All eight are light on purpose: the ink line is near-black and the ear accent is coral, and both stop reading over anything darker — check that the outline, the eyes and the ears hold on every tint, and that the tint is the only thing that changes from one to the next. Switch the Storybook theme to dark: the tints do not flip, because a bot's mark is the same colour wherever it is shown. The first avatar draws no blot at all and must be identical to what the component rendered before blots existed.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [none, ...tinted] = botIdentityAvatars(canvasElement)

		await expect(none.querySelector('[data-slot="bot-avatar-blot"]')).toBeNull()
		await expect(
			tinted.map((avatar) =>
				avatar
					.querySelector('[data-slot="bot-avatar-blot"]')
					?.getAttribute("fill"),
			),
		).toEqual(BLOT_TINTS.map((blot) => `var(--bot-blot-${blot})`))
	},
})

export const Working = meta.story({
	args: { working: true, kind: "writing" },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The bot at work, in all three places. The animal doing the work is the bot's own and it keeps its blot throughout — a run must never put a different creature or a different mark on the screen than the one the reader chose — and the pose is the work: writing, searching, thinking, or listening while it waits on the reader. Every size also wears the dot, sized from the avatar so it reads the same on a 24px reply as on a 96px preview. Open this in Storybook for the movement; the test browser forces reduced motion.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
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
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(
			within(avatar).getByRole("img", { name: "Bot avatar rabbit, listening" }),
		).toBeVisible()
	},
})

export const Uploaded = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE },
	render: (args) => <EveryPlace {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A bot wearing a picture its reader uploaded. It wins over the animal and its blot in every place — a bot with a photograph is that photograph on the roster, in its settings and beside its replies — and it is decorative in all of them: the row, the column and the reply each name the bot in their own text, so the image says nothing twice. Check that no animal is drawn beside it. Pick `UploadedWorking` for the same picture mid-run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			)
			await expect(avatar.querySelector("svg")).toBeNull()
		}
	},
})

export const UploadedWorking = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE, working: true, kind: "searching" },
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
		for (const avatar of botIdentityAvatars(canvasElement)) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
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
		const drawn = () => botIdentityAvatars(canvasElement)

		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toBeNull()
		}

		await userEvent.click(
			canvas.getByRole("button", { name: "Change the bot" }),
		)
		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toHaveAttribute(
				"src",
				UPLOADED_AVATAR_IMAGE,
			)
			await expect(avatar.querySelector("svg")).toBeNull()
		}

		await userEvent.click(
			canvas.getByRole("button", { name: "Change the bot" }),
		)
		for (const avatar of drawn()) {
			await expect(avatar.querySelector("img")).toBeNull()
			await expect(
				within(avatar).getByRole("img", { name: "Bot avatar rabbit, idle" }),
			).toBeVisible()
		}
	},
})

export const Unseeded = meta.story({
	args: { seed: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A bot drawn without an id — a preview, a story, anything with no bot behind it yet. It gets the blot exactly as it was authored, so nothing that existed before shapes did has moved. Put it beside `Default`, whose bot is seeded onto a half turn: the tint and the animal are the same and only the blot has turned. Pick `Branding/Bot Avatar → BlotShapes` for all eight poses at once.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(blotShapeOf(avatar)?.endsWith(blotTransform())).toBe(true)
	},
})

export const Seeded = meta.story({
	render: (args) => <Rebranded {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"What the id buys: press the button and the bot is renamed in every way a reader can rename it — a different animal, a different tint, and mid-run rather than at rest — and its blot holds the shape it has always had. The shape is derived from the id and from nothing else, and it is drawn outside the node the animation engine rewrites, so neither an edit nor a frame of movement can touch it. Check that the blot is perfectly still while the animal works.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const [avatar] = botIdentityAvatars(canvasElement)
		const before = blotShapeOf(avatar)

		await userEvent.click(
			canvas.getByRole("button", { name: "Change everything but the id" }),
		)
		await expect(blotShapeOf(botIdentityAvatars(canvasElement)[0])).toBe(before)
	},
})
