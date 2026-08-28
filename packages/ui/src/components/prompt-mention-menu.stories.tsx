import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	PromptMentionMenu,
	type PromptMentionMenuProps,
} from "@workspace/ui/components/prompt-mention-menu"

const CROWDED_BOTS = [...CONVERSATION_BOTS, ...LONG_NAMED_BOTS]

const ComposedMenu = (props: PromptMentionMenuProps) => {
	const [draft, setDraft] = useState("@")

	return (
		<PromptMentionMenu {...props} query={draft.replace("@", "")}>
			<PromptInput aria-label="Prompt" onValueChange={setDraft} value={draft} />
		</PromptMentionMenu>
	)
}

const meta = preview.meta({
	title: "Conversation/Prompt/PromptMentionMenu",
	component: PromptMentionMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The mention popup of the composer: it lists the bots of the conversation, each with its avatar and its name, filters them against the typed query and answers the keyboard while focus stays in the textarea. A mention reaches exactly one bot — there is no row that reaches everyone — so a selection reports a single bot id and the menu closes on it. The bot that leads the conversation wears a crown and a screen-reader-only *Lead*, wherever the filtering leaves it in the list. It draws only: reading the arobase in the draft, owning `open` and `query`, and writing the mention back into the text all belong to the host. ArrowUp/ArrowDown travel and wrap, Enter and Tab select, Escape or a press outside dismisses, and a query matching no bot renders no menu at all. Reach for `PromptCommandMenu` for the slash commands of the same composer.",
			},
		},
	},
	args: {
		bots: CONVERSATION_BOTS,
		leadId: CONVERSATION_BOTS[0].id,
		open: true,
		query: "",
		onSelect: fn(),
		onDismiss: fn(),
		children: <PromptInput aria-label="Prompt" defaultValue="@" />,
	},
	argTypes: {
		open: { control: "boolean" },
		query: { control: "text" },
		leadId: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="flex h-[32rem] w-[34rem] max-w-full items-end">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: the menu is open on an empty query, so every bot of the conversation is listed and the first row is the active one. Check that the panel sits above the composer on its leading edge, that each row pairs an avatar with a name, that exactly one row carries the highlight, and that Escape reports a dismissal to the host.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(CONVERSATION_BOTS.length)
		await expect(options[0]).toHaveAttribute("aria-selected", "true")
		await expect(options[1]).toHaveAttribute("aria-selected", "false")

		await userEvent.keyboard("{Escape}")
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const Lead = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The bot that leads the conversation, marked. Check that the crown falls on the lead and on nobody else, that it never stands alone as the only sign of the role since *Lead* is announced beside it, and that the mark follows the bot rather than the first row.",
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(options[0]).toHaveAccessibleName("Atlas Lead")
		await expect(options[1]).toHaveAccessibleName("Basile")
	},
})

export const Filtered = meta.story({
	args: { query: "a" },
	parameters: {
		docs: {
			description: {
				story:
					"A typed query narrows the list to the bots whose name carries it, matched case-insensitively, and the highlight falls back to the first survivor. Check that the panel shrinks to the remaining rows and that clicking one reports that bot's id rather than the highlighted one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(5)
		await expect(options[0]).toHaveAccessibleName("Atlas Lead")

		await userEvent.click(options[1])
		await expect(args.onSelect).toHaveBeenCalledWith("bot-basile")
	},
})

export const LeadFilteredOut = meta.story({
	args: { query: "e" },
	parameters: {
		docs: {
			description: {
				story:
					"A query that leaves the lead out of the matches. Check that no crown is drawn at all — the mark states who leads, so a list without the lead in it carries none, and the first row is never crowned by position.",
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(options[0]).toHaveAccessibleName("Basile")
		await expect(canvas.queryByText("Lead")).not.toBeInTheDocument()
	},
})

export const KeyboardTravel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The keyboard contract, with focus never leaving the composer: ArrowDown and ArrowUp move the highlight by one and wrap at both ends, Enter and Tab select whatever is highlighted. Check that neither arrow moves the caret in the textarea and that Enter selects instead of submitting the prompt.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")
		const last = CONVERSATION_BOTS.length - 1

		await userEvent.keyboard("{ArrowUp}")
		await expect(options[last]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[0]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{ArrowDown}{ArrowDown}")
		await expect(options[2]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledWith("bot-clemence")

		await userEvent.keyboard("{Tab}")
		await expect(args.onSelect).toHaveBeenCalledTimes(2)
	},
})

export const LongContent = meta.story({
	args: { bots: CROWDED_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"More bots than the panel can show, two of them named far past their row. Check that the list scrolls instead of growing past the composer, that a long name truncates while the avatar and the crown stay whole, and that travelling with the arrows keeps the active row in view.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.keyboard("{ArrowUp}")

		const options = canvas.getAllByRole("option")
		const last = options[options.length - 1]

		await expect(last).toHaveAttribute("aria-selected", "true")
		await expect(canvas.getByRole("listbox").scrollTop).toBeGreaterThan(0)
	},
})

export const QueryChanged = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The composer drives the query for real: the highlight is moved down twice, then more of the name is typed. Check that the new match list starts on its first row again rather than keeping the old offset, and that typing never disturbs the menu the way the arrows do.",
			},
		},
	},
	render: (args) => <ComposedMenu {...args} />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("textbox", { name: "Prompt" }))
		await userEvent.keyboard("{ArrowDown}{ArrowDown}")

		await expect(canvas.getAllByRole("option")[2]).toHaveAttribute(
			"aria-selected",
			"true",
		)

		await userEvent.keyboard("do")

		const filtered = canvas.getAllByRole("option")
		await expect(filtered).toHaveLength(1)
		await expect(filtered[0]).toHaveAccessibleName("Dorian")
		await expect(filtered[0]).toHaveAttribute("aria-selected", "true")
	},
})

export const Empty = meta.story({
	args: { query: "zzz" },
	parameters: {
		docs: {
			description: {
				story:
					"The query matches no bot, so the menu renders nothing at all — no panel, no empty message, no keyboard capture. Check that the composer alone remains and that Enter reaches it, since the menu must not swallow a submission it has no row to answer with.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument()
	},
})
