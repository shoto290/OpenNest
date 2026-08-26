import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BotMention } from "@workspace/ui/components/bot-mention"
import { ConversationBotsProvider } from "@workspace/ui/components/conversation-bots"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"

const ROOM = [...CONVERSATION_BOTS.slice(0, 3), ...LONG_NAMED_BOTS]

const Conversation = ({ children }: { children: ReactNode }) => (
	<ConversationBotsProvider bots={ROOM}>
		<p className="max-w-md text-sm leading-6">{children}</p>
	</ConversationBotsProvider>
)

const HANDOVER =
	"I stopped at the failing migration — <@bot-basile> owns that script, and <@bot-ghost> wrote the fixture it reads."

const meta = preview.meta({
	title: "AI/BotMention",
	component: BotMention,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A bot named inside the words of a message. The transcript carries a mention as `<@bot-id>` in the text and this is what that id becomes: a chip in the flow of the sentence, avatar and name together, tinted from the colour it inherits so it reads the same in a bot's bubble and in the reader's own. The id is resolved against the bots the conversation holds — `ConversationBotsProvider` names them once around the transcript, so nothing threads a roster down to each message. An id the conversation does not know still draws a chip rather than leaking the raw `<@…>` at the reader: a silhouette and *Unknown bot*, which is what a mention of a bot that left looks like. The name truncates instead of pushing the line, and the avatar is hidden from screen readers so the mention is announced as the name alone. `Markdown` does the parsing, so a mention written inside code stays literal.",
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
			Ask <BotMention {...args} /> to take the next pass.
		</Conversation>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mention of a bot the conversation holds. Check that the chip sits on the baseline of the sentence without pushing the line height, that the avatar is the same drawing the roster gives that bot, and that the words either side keep their spacing. Pick `Unknown` for an id the conversation cannot resolve.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Atlas")).toBeVisible()
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
			'[data-slot="bot-mention"] > span:last-child',
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
	render: () => (
		<ConversationBotsProvider bots={ROOM}>
			<div className="max-w-md">
				<Markdown>{HANDOVER}</Markdown>
			</div>
		</ConversationBotsProvider>
	),
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
	render: () => (
		<ConversationBotsProvider bots={ROOM}>
			<div className="max-w-md">
				<Markdown>
					{"Write `<@bot-atlas>` to name Atlas in a message."}
				</Markdown>
			</div>
		</ConversationBotsProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("<@bot-atlas>")).toBeVisible()
		await expect(
			canvasElement.querySelectorAll('[data-slot="bot-mention"]'),
		).toHaveLength(0)
	},
})
