import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	Row,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	AvatarGroup,
	type AvatarGroupProps,
	type ConversationParticipant,
} from "@workspace/ui/components/avatar-group"
import { BOT_BADGES } from "@workspace/ui/components/badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"

const SIZES = [24, 40, 96]

const ATLAS: ConversationParticipant = {
	id: "atlas",
	name: "Atlas",
	animal: "rabbit",
	blot: "blue",
}

const BEACON: ConversationParticipant = {
	id: "beacon",
	name: "Beacon",
	animal: "owl",
	blot: "orange",
}

const CINDER: ConversationParticipant = {
	id: "cinder",
	name: "Cinder",
	animal: "bear",
	blot: "red",
}

const DUNE: ConversationParticipant = {
	id: "dune",
	name: "Dune",
	animal: "cat",
	blot: "green",
}

const EMBER: ConversationParticipant = {
	id: "ember",
	name: "Ember",
	animal: "mouse",
	blot: "purple",
}

const CROWD = [ATLAS, BEACON, CINDER, DUNE, EMBER]

const frameOf = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "conversation-avatar")[0]

const heldIn = (frame: HTMLElement) => slotsIn(frame, "bot-identity-avatar")

const countIn = (frame: HTMLElement) =>
	slotsIn(frame, "conversation-avatar-overflow")[0]

const cornerRatioOf = (node: HTMLElement) => {
	const radius = getComputedStyle(node).borderTopLeftRadius
	return radius.endsWith("%")
		? Number.parseFloat(radius) / 100
		: Number.parseFloat(radius) / node.getBoundingClientRect().width
}

const expectCentred = async (frame: HTMLElement, held: HTMLElement[]) => {
	const box = frame.getBoundingClientRect()
	const boxes = held.map((bot) => bot.getBoundingClientRect())
	const left = Math.min(...boxes.map((tile) => tile.left)) - box.left
	const right = box.right - Math.max(...boxes.map((tile) => tile.right))

	await expect(left).toBeGreaterThan(0)
	await expect(left).toBeCloseTo(right, 0)
}

const poseOf = (held: HTMLElement) =>
	held.querySelector("svg")?.getAttribute("aria-label")

const EverySize = (props: AvatarGroupProps) => (
	<Row>
		{SIZES.map((size) => (
			<AvatarGroup {...props} key={size} size={size} />
		))}
	</Row>
)

const BesideItsBot = (props: AvatarGroupProps) => (
	<Row>
		<AvatarGroup {...props} />
		<BotIdentityAvatar
			animal={ATLAS.animal}
			blot={ATLAS.blot}
			name={ATLAS.name}
			seed={ATLAS.id}
			size={props.size}
		/>
	</Row>
)

const meta = preview.meta({
	title: "Branding/AvatarGroup",
	component: AvatarGroup,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The face of a room: the bots it holds, drawn inside one frame. It exists because a bot and a conversation live in the same lists — the roster, the header of the column beside it — and a room of one bot would otherwise be pixel for pixel that bot's own row. So the kind is carried by shape and never by a word: a bot floats free, a room is held in a container. The frame takes the same square a bot avatar takes, so nothing in the column moves between the two kinds; only what fills the square changes. Up to three bots are drawn; past three the fourth cell of the grid, free by construction, holds how many were left out. It draws and nothing else — no name, no layout — and a room within its three faces is hidden from a screen reader, because three avatar labels in front of a room name bury the name. A room that overflows is the one exception: it announces its count as the label of the square, since nothing else in the row says it.",
			},
		},
	},
	args: {
		participants: [ATLAS, BEACON],
		size: 96,
	},
	argTypes: {
		badge: { control: "select", options: [undefined, ...BOT_BADGES] },
		size: { control: { type: "range", min: 24, max: 160, step: 8 } },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A room of two. Both bots sit inside the frame, each keeping the animal and the blot it wears everywhere else, and the frame is what says these two are somewhere together rather than side by side in a list. Check that the bots stay inside the frame and that the frame draws a border of its own — that border is the whole signal. Pick `OneBot` for the case this component was built for, `Crowded` for what happens past three.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)
		const held = heldIn(frame)

		await expect(held).toHaveLength(2)
		await expect(frame).toHaveAttribute("aria-hidden", "true")
		await expect(
			Number.parseFloat(getComputedStyle(frame).borderTopWidth),
		).toBeGreaterThan(0)

		await expectCentred(frame, held)
	},
})

export const OneBot = meta.story({
	args: { participants: [ATLAS] },
	render: (args) => <BesideItsBot {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reason this component exists, shown as the pair it has to be told apart from: a room holding Atlas on the left, Atlas himself on the right. Same footprint, same bot, and no text anywhere — what separates them is that one is held and one is not. The single bot is drawn smaller than the square so the frame stays readable all the way around it, which is what keeps the two legible at 24px in a roster and not only at this size.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)
		const [held] = heldIn(frame)
		const [, loose] = botIdentityAvatars(canvasElement)

		await expect(heldIn(frame)).toHaveLength(1)
		await expect(Math.round(frame.getBoundingClientRect().width)).toBe(
			Math.round(loose.getBoundingClientRect().width),
		)
		await expect(held.getBoundingClientRect().width).toBeLessThan(
			loose.getBoundingClientRect().width,
		)
		await expectCentred(frame, [held])
	},
})

export const Crowded = meta.story({
	args: { participants: CROWD },
	parameters: {
		docs: {
			description: {
				story:
					"A room of five. Three bots are held and the two left out are counted in the fourth cell, bottom right — the one the odd number of faces leaves free — drawn as a rounded square on the tile the avatars sit on, so nothing about the frame widens or shifts. The count and the drawing cannot disagree, since the same slice decides both. It is the only thing here a screen reader hears: the square carries `+2` as its label, and the faces stay silent.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)
		const held = heldIn(frame)
		const count = countIn(frame)

		await expect(held).toHaveLength(3)
		await expect(count).toHaveTextContent("+2")
		await expect(frame).toHaveAccessibleName("+2")

		const tiles = held.map((bot) => bot.getBoundingClientRect())
		const box = count.getBoundingClientRect()

		await expect(tiles[0].right).toBeLessThanOrEqual(tiles[1].left)
		await expect(tiles[0].bottom).toBeLessThanOrEqual(tiles[2].top)
		await expect(box.left).toBeGreaterThanOrEqual(tiles[2].right)
		await expect(box.top).toBeGreaterThanOrEqual(tiles[1].bottom)
		await expect(Math.round(box.width)).toBe(Math.round(tiles[0].width))
		await expect(Math.round(box.height)).toBe(Math.round(box.width))
		await expect(cornerRatioOf(count)).toBeCloseTo(cornerRatioOf(frame), 2)
		await expectCentred(frame, held)
	},
})

export const EveryPlace = meta.story({
	render: (args) => <EverySize {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The three places a room is drawn: the rail at 24px, a roster row at 40px, a header or a settings column at 96px. The frame, the inset around the bots and the gap between them all follow the size, so the shape reads the same at every one of them and no call site hand-tunes a number.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frames = slotsIn(canvasElement, "conversation-avatar")

		await expect(frames).toHaveLength(SIZES.length)
		for (const [index, frame] of frames.entries()) {
			await expect(Math.round(frame.getBoundingClientRect().width)).toBe(
				SIZES[index],
			)
			await expectCentred(frame, heldIn(frame))
		}
	},
})

export const Working = meta.story({
	args: {
		participants: [ATLAS, { ...BEACON, working: true, kind: "writing" }],
		badge: "attention",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A room where one bot is running. That bot animates inside the frame exactly as it would on its own row and holds the pose it was given, while the quiet one beside it stays a still frame — the frame changes nothing about how a bot says it is working. The dot belongs to the room rather than to the bot: one badge in the corner of the square, in the same corner a bot avatar puts it, so a mixed list never grows a cluster of dots on one row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)
		const [resting, running] = heldIn(frame)

		await expect(poseOf(resting)).toBe("Bot avatar rabbit, idle")
		await expect(poseOf(running)).toBe("Bot avatar owl, writing")
		await expect(slotsIn(frame, "bot-activity-dot")).toHaveLength(1)
	},
})

export const Uploaded = meta.story({
	args: {
		participants: [{ ...ATLAS, image: UPLOADED_AVATAR_IMAGE }, BEACON],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A room holding a bot that wears a picture its reader uploaded. The picture is held by the frame like any other bot, clipped to the same round shape it has on its own row, and it never moves — which is exactly why the frame matters here: a photograph in a list of drawn animals already looks like an exception, and the container is what still says this one is a room.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)
		const [uploaded] = heldIn(frame)

		await expect(uploaded.querySelector("img")).toBeVisible()
	},
})

export const Empty = meta.story({
	args: { participants: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A room with nobody in it yet — the state a reader sees for the half second between pressing new conversation and picking who joins. The frame is drawn on its own and holds the square, so the row it sits in is laid out before its bots arrive and nothing jumps when they do.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const frame = frameOf(canvasElement)

		await expect(heldIn(frame)).toHaveLength(0)
		await expect(Math.round(frame.getBoundingClientRect().width)).toBe(96)
	},
})
