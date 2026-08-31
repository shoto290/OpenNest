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

const ROW_GAP = 8

const slotsOf = (row: HTMLElement) => {
	const name = row.querySelector('[data-slot="prompt-mention-name"]')
	const count = row.querySelector('[data-slot="prompt-mention-count"]')

	if (!name || !count) throw new Error("The row drew no counted name")

	return {
		name: name.getBoundingClientRect(),
		count: count.getBoundingClientRect(),
	}
}

const CountingMenu = (props: PromptMentionMenuProps) => {
	const [counts, setCounts] = useState<Record<string, number>>({
		"bot-atlas": 1,
	})

	return (
		<PromptMentionMenu
			{...props}
			counts={counts}
			onSelect={(id) => {
				props.onSelect(id)
				setCounts((named) => ({ ...named, [id]: (named[id] ?? 0) + 1 }))
			}}
		/>
	)
}

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
					"The mention popup of the composer: it lists the bots of the conversation, each with its avatar and its name, filters them against the typed query and answers the keyboard while focus stays in the textarea. A mention reaches exactly one bot — there is no row that reaches everyone — so a selection reports a single bot id and the menu closes on it. The bot that leads the conversation wears a crown and a screen-reader-only *Lead*, wherever the filtering leaves it in the list. A row whose bot the draft already names carries the count of those mentions before the crown, given by the host as data. It draws only: reading the arobase in the draft, owning `open` and `query`, and writing the mention back into the text all belong to the host. ArrowUp/ArrowDown travel and wrap, Enter and Tab select, Escape or a press outside dismisses, and a query matching no bot renders no menu at all. Reach for `PromptCommandMenu` for the slash commands of the same composer.",
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

export const Counted = meta.story({
	args: { counts: { "bot-basile": 1, "bot-clemence": 3 } },
	parameters: {
		docs: {
			description: {
				story:
					"The draft already names two of the listed bots, one once and one three times, and says nothing of the others. Check that the count reads as part of the name it counts, one row-gap after its last glyph and nowhere near the trailing edge, that the number is announced as a phrase rather than as a bare glyph, and that a bot the draft never names renders exactly as it does everywhere else — no zero, no placeholder.",
			},
		},
	},
	play: async ({ canvas }) => {
		const options = canvas.getAllByRole("option")

		await expect(canvas.getByText("\u00d71")).toBeVisible()
		await expect(canvas.getByText("\u00d73")).toBeVisible()

		await expect(options[1]).toHaveAccessibleName(
			"Basile 1 mention in the draft",
		)
		await expect(options[2]).toHaveAccessibleName(
			"Cl\u00e9mence 3 mentions in the draft",
		)
		await expect(options[3]).toHaveAccessibleName("Dorian")

		const { name, count } = slotsOf(options[1])

		await expect(count.left - name.right).toBeLessThanOrEqual(ROW_GAP + 1)
		await expect(
			options[1].getBoundingClientRect().right - count.right,
		).toBeGreaterThan(ROW_GAP * 4)
	},
})

export const CountedLead = meta.story({
	args: { counts: { "bot-atlas": 2 } },
	parameters: {
		docs: {
			description: {
				story:
					"The lead of the conversation, already named twice in the draft. Check that the count sits between the name and the crown so the crown stays the last thing on the row, and that the two marks are read in that same order rather than fighting for the trailing edge.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const row = canvas.getAllByRole("option")[0]

		await expect(row).toHaveAccessibleName("Atlas 2 mentions in the draft Lead")

		const count = canvasElement.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-count"]',
		)
		const crown = canvasElement.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-lead"]',
		)

		if (!count || !crown)
			throw new Error("The row drew no count beside a crown")

		await expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(
			crown.getBoundingClientRect().left,
		)
	},
})

export const CountedLongName = meta.story({
	args: { bots: CROWDED_BOTS, counts: { "bot-release": 4 } },
	parameters: {
		docs: {
			description: {
				story:
					"A count on a bot named far past the width of its row. Check that the name is the only part that gives way to an ellipsis and that the digits stay whole and inside the panel: a reader must never lose the number to the overflow of a name.",
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("option", { name: /Release notes editor/ })
		const named = row.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-name"]',
		)
		const counted = row.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-count"]',
		)

		if (!named || !counted) throw new Error("The row drew no count")

		await expect(named.scrollWidth).toBeGreaterThan(named.clientWidth)
		await expect(counted.scrollWidth).toBe(counted.clientWidth)

		const { name, count } = slotsOf(row)

		await expect(count.left - name.right).toBeLessThanOrEqual(ROW_GAP + 1)
		await expect(count.right).toBeLessThanOrEqual(
			row.getBoundingClientRect().right,
		)
	},
})

export const CountedAgain = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A row already at one, taken once more. Check that the count reads two the moment the row is picked, without the panel closing or the list reordering under the pointer, since the number answers the draft and not the selection.",
			},
		},
	},
	render: (args) => <CountingMenu {...args} />,
	play: async ({ canvas, userEvent }) => {
		const row = canvas.getAllByRole("option")[0]

		await expect(canvas.getByText("\u00d71")).toBeVisible()

		await userEvent.click(row)

		await expect(canvas.getByText("\u00d72")).toBeVisible()
		await expect(canvas.getByRole("listbox")).toBeInTheDocument()
	},
})
