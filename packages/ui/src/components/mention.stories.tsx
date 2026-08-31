import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Markdown } from "@workspace/ui/components/markdown"
import { Mention } from "@workspace/ui/components/mention"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"
import { RosterProvider } from "@workspace/ui/components/roster"

const ROOM = [...CONVERSATION_BOTS.slice(0, 3), ...LONG_NAMED_BOTS]

const spaceAroundAvatar = (canvasElement: HTMLElement) => {
	const chip = canvasElement.querySelector('[data-slot="bot-mention"]')
	const avatar = chip?.querySelector('[data-slot="bot-identity-avatar"]')

	if (!avatar || !chip) throw new Error("The sentence drew no avatar")

	const around = chip.getBoundingClientRect()
	const drawn = avatar.getBoundingClientRect()

	return {
		left: drawn.left - around.left,
		above: drawn.top - around.top,
		below: around.bottom - drawn.bottom,
	}
}

const Conversation = ({ children }: { children: ReactNode }) => (
	<RosterProvider bots={ROOM}>
		<p className="max-w-md text-sm leading-6">{children}</p>
	</RosterProvider>
)

type MessageProps = { source: string }

const Message = ({ source }: MessageProps) => (
	<RosterProvider bots={ROOM}>
		<div className="max-w-md">
			<Markdown>{source}</Markdown>
		</div>
	</RosterProvider>
)

const pills = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll('[data-slot="bot-mention"]')

const HANDOVER =
	"I stopped at the failing migration — <@bot-basile> owns that script, and <@bot-ghost> wrote the fixture it reads."

const LITERAL = "Write `<@bot-atlas>` to name Atlas in a message."

const PAIR = "Ask <@bot-atlas> <@bot-atlas> to split the failing suite."

const CROWD =
	"Fan the migration out to <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> <@bot-atlas> and let <@bot-basile> collect the diffs."

const GHOST_PAIR = "<@bot-ghost> <@bot-ghost> were the ones holding that lock."

const LONG_PAIR = "Ask <@bot-release> <@bot-release> for the two changelogs."

const NEIGHBOURS = "Ask <@bot-atlas> <@bot-basile> to trade notes."

const APART = "Ask <@bot-atlas> first, then ask <@bot-atlas> for a second pass."

const meta = preview.meta({
	title: "Conversation/Message/Mention",
	component: Mention,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A bot named inside the words of a message. The transcript carries a mention as `<@bot-id>` in the text and this is what that id becomes: a chip in the flow of the sentence, avatar and name together, tinted from the colour it inherits so it reads the same in a bot's bubble and in the reader's own. The id is resolved against the bots the conversation holds — `RosterProvider` names them once around the transcript, so nothing threads a roster down to each message. An id the conversation does not know still draws a chip rather than leaking the raw `<@…>` at the reader: a silhouette and *Unknown bot*, which is what a mention of a bot that left looks like. The name truncates instead of pushing the line, and the avatar is hidden from screen readers so the mention is announced as the name alone. `Markdown` does the parsing, so a mention written inside code stays literal.",
			},
		},
	},
	args: { botId: "bot-atlas" },
	argTypes: {
		botId: {
			control: "select",
			options: [...ROOM.map((bot) => bot.id), "bot-ghost"],
		},
	},
	render: (args) => (
		<Conversation>
			Ask <Mention {...args} /> to take the next pass.
		</Conversation>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a bot the conversation holds. The chip is exactly as tall as the line it sits on, so it never pushes the line height, and the avatar keeps the same space on its left, above it and below it. Check that the avatar is the same drawing the roster gives that bot and that the words either side keep their spacing. Pick `Unknown` for an id the conversation cannot resolve.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Atlas")).toBeVisible()

		const { left, above, below } = spaceAroundAvatar(canvasElement)

		await expect(above).toBeCloseTo(left, 0)
		await expect(below).toBeCloseTo(left, 0)
	},
})

export const Unknown = meta.story({
	args: { botId: "bot-ghost" },
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a bot the conversation does not know — deleted, or never part of it. Check that the chip keeps its shape and dims rather than disappearing, that a silhouette replaces the avatar, and that the reader is told *Unknown bot* instead of being shown a raw id.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Unknown bot")).toBeVisible()
	},
})

export const LongName = meta.story({
	args: { botId: "bot-release" },
	parameters: {
		docs: {
			description: {
				story:
					"A bot whose name is a sentence of its own. Check that the chip truncates at a fixed width and the paragraph keeps wrapping normally — one long name never forces a line of its own.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-name"]',
		)

		if (!name) throw new Error("The chip drew no name")

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
	},
})

export const InText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"What a real message looks like: two mentions inside one paragraph, one resolved and one not, parsed out of the text by `Markdown`. Check that both chips sit in the flow rather than on their own line, and that the sentence reads as a sentence — the mention replaces the id, it does not interrupt the prose.",
			},
		},
	},
	render: () => <Message source={HANDOVER} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Basile")).toBeVisible()
		await expect(canvas.getByText("Unknown bot")).toBeVisible()
	},
})

export const InCode = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The escape hatch: a mention written inside code. Check that `<@bot-atlas>` between backticks stays the literal text a reader typed — a message explaining the syntax must be able to show it.",
			},
		},
	},
	render: () => <Message source={LITERAL} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("<@bot-atlas>")).toBeVisible()
		await expect(pills(canvasElement)).toHaveLength(0)
	},
})

export const Counted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same bot named twice in a row, which is how a message addresses two live instances of it. Check that the two tokens draw one chip carrying `2` rather than two chips side by side, that the space that separated them is gone, and that the chip is announced as *Atlas, 2 mentions* in one go instead of leaving a bare number for a screen reader to read alone.",
			},
		},
	},
	render: () => <Message source={PAIR} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(1)
		await expect(canvas.getByText("2")).toBeVisible()
		await expect(canvas.getByText("Atlas")).toBeVisible()
		await expect(canvas.getByText("2 mentions")).toBeInTheDocument()
	},
})

export const CountedToNine = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nine repeats of one bot, the widest count a single digit reaches, next to a bot named once. Check that the counted chip is exactly as tall as the plain one and sits on the same baseline, that the number sits inside the chip after the name, and that the digit is drawn in the tabular figures the rest of the app counts with.",
			},
		},
	},
	render: () => <Message source={CROWD} />,
	play: async ({ canvas, canvasElement }) => {
		const [counted, plain] = [...pills(canvasElement)]

		await expect(canvas.getByText("9")).toBeVisible()
		await expect(canvas.getByText("9 mentions")).toBeInTheDocument()

		const count = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-count"]',
		)

		if (!count) throw new Error("The chip drew no count")

		await expect(getComputedStyle(count).fontVariantNumeric).toContain(
			"tabular-nums",
		)

		const drawn = counted.getBoundingClientRect()
		const beside = plain.getBoundingClientRect()

		await expect(drawn.height).toBeCloseTo(beside.height, 1)
		await expect(drawn.top).toBeCloseTo(beside.top, 1)
	},
})

export const CountedUnknown = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A repeated id the conversation cannot resolve. Check that an unknown id collapses on exactly the same rule as a known one: one dimmed chip with a silhouette, *Unknown bot* and the count, never two identical unknown chips in a row.",
			},
		},
	},
	render: () => <Message source={GHOST_PAIR} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(1)
		await expect(
			canvasElement.querySelector('[data-unknown="true"]'),
		).not.toBeNull()
		await expect(canvas.getByText("Unknown bot")).toBeVisible()
		await expect(canvas.getByText("2 mentions")).toBeInTheDocument()
	},
})

export const CountedLongName = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A count on a bot whose name is a sentence of its own. Check that the name is still the part that truncates and that the count stays whole and inside the chip: a reader must never lose the number to an ellipsis.",
			},
		},
	},
	render: () => <Message source={LONG_PAIR} />,
	play: async ({ canvasElement }) => {
		const pill = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention"]',
		)
		const name = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-name"]',
		)
		const count = canvasElement.querySelector<HTMLElement>(
			'[data-slot="bot-mention-count"]',
		)

		if (!pill || !name || !count) throw new Error("The chip drew no count")

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(count.scrollWidth).toBe(count.clientWidth)
		await expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(
			pill.getBoundingClientRect().right,
		)
	},
})

export const DifferentBotsAdjacent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Two different bots named back to back. Check that adjacency alone collapses nothing: two ids means two chips, each with its own avatar and no count.",
			},
		},
	},
	render: () => <Message source={NEIGHBOURS} />,
	play: async ({ canvas, canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(2)
		await expect(canvas.getByText("Atlas")).toBeVisible()
		await expect(canvas.getByText("Basile")).toBeVisible()
		await expect(
			canvasElement.querySelectorAll('[data-slot="bot-mention-count"]'),
		).toHaveLength(0)
	},
})

export const RepeatedApart = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same bot named twice with words in between. Check that only whitespace collapses a repeat: prose between the two tokens means the reader wrote two mentions in two places, so the sentence keeps two chips and no count.",
			},
		},
	},
	render: () => <Message source={APART} />,
	play: async ({ canvasElement }) => {
		await expect(pills(canvasElement)).toHaveLength(2)
		await expect(
			canvasElement.querySelectorAll('[data-slot="bot-mention-count"]'),
		).toHaveLength(0)
	},
})
