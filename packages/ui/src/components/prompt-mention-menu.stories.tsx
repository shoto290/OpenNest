import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectCompanionPictureSquare,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	CONVERSATION_BOTS,
	LONG_NAMED_BOTS,
} from "@workspace/ui/components/new-conversation-dialog/bots.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	type MentionBot,
	PromptMentionMenu,
	type PromptMentionMenuProps,
} from "@workspace/ui/components/prompt-mention-menu"

const CROWDED_BOTS = [...CONVERSATION_BOTS, ...LONG_NAMED_BOTS]

const SPACE_BOTS: MentionBot[] = [
	{
		id: "bot-atlas",
		name: "Atlas",
		title: "Editor",
		animal: "owl",
		blot: "blue",
	},
	{
		id: "bot-margaux",
		name: "Margaux",
		title: "Research",
		animal: "koala",
		blot: "red",
		isOutside: true,
	},
	{ id: "bot-basile", name: "Basile", animal: "cat", blot: "purple" },
	{
		id: "bot-nolan",
		name: "Nolan",
		animal: "chick",
		blot: "yellow",
		isOutside: true,
	},
	{ id: "bot-clemence", name: "Clémence", animal: "rabbit", blot: "pink" },
	{ id: "bot-dorian", name: "Dorian", animal: "bear", blot: "orange" },
	{
		id: "bot-octave",
		name: "Octave",
		animal: "dog",
		blot: "green",
		isOutside: true,
	},
	{ id: "bot-elia", name: "Elia", animal: "mouse", blot: "green" },
	{ id: "bot-faust", name: "Faust", animal: "dog", blot: "cyan" },
	{
		id: "bot-paloma",
		name: "Paloma",
		animal: "owl",
		blot: "pink",
		isOutside: true,
	},
	{ id: "bot-gaspard", name: "Gaspard", animal: "koala", blot: "yellow" },
	{ id: "bot-helene", name: "Hélène", animal: "chick", blot: "red" },
	{
		id: "bot-quentin",
		name: "Quentin",
		animal: "cat",
		blot: "cyan",
		isOutside: true,
	},
	{ id: "bot-ines", name: "Ines", animal: "bear", blot: "blue" },
	{
		id: "bot-rosalie",
		name: "Rosalie",
		animal: "rabbit",
		blot: "orange",
		isOutside: true,
	},
	{ id: "bot-jules", name: "Jules", animal: "mouse", blot: "purple" },
	{
		id: "bot-sacha",
		name: "Sacha",
		animal: "owl",
		blot: "green",
		isOutside: true,
	},
	{ id: "bot-kenza", name: "Kenza", animal: "dog", blot: "pink" },
	{
		id: "bot-theo",
		name: "Théo",
		animal: "koala",
		blot: "blue",
		isOutside: true,
	},
	{ id: "bot-lucien", name: "Lucien", animal: "cat", blot: "yellow" },
	{
		id: "bot-ursule",
		name: "Ursule",
		animal: "bear",
		blot: "red",
		isOutside: true,
	},
	{
		id: "bot-victor",
		name: "Victor",
		animal: "chick",
		blot: "cyan",
		isOutside: true,
	},
	{
		id: "bot-wanda",
		name: "Wanda",
		animal: "rabbit",
		blot: "purple",
		isOutside: true,
	},
	{
		id: "bot-xavier",
		name: "Xavier",
		animal: "mouse",
		blot: "orange",
		isOutside: true,
	},
	{
		id: "bot-yasmine",
		name: "Yasmine",
		animal: "owl",
		blot: "red",
		isOutside: true,
	},
	{
		id: "bot-zoe",
		name: "Zoé",
		animal: "dog",
		blot: "yellow",
		isOutside: true,
	},
	{
		id: "bot-ambre",
		name: "Ambre",
		animal: "koala",
		blot: "green",
		isOutside: true,
	},
	{
		id: "bot-bastien",
		name: "Bastien",
		animal: "cat",
		blot: "pink",
		isOutside: true,
	},
	{
		id: "bot-celeste",
		name: "Céleste",
		animal: "bear",
		blot: "cyan",
		isOutside: true,
	},
	{
		id: "bot-damien",
		name: "Damien",
		animal: "rabbit",
		blot: "blue",
		isOutside: true,
	},
]

const LONG_NAMED_SPACE_BOTS: MentionBot[] = [
	...CONVERSATION_BOTS,
	{ ...LONG_NAMED_BOTS[0], title: "Writer" },
	{ ...LONG_NAMED_BOTS[1], title: "On call", isOutside: true },
]

const NAME_TO_COUNT_GAP = 4

const ROW_EDGE_PADDING = 8

const ROW_GAP = 8

const TRAILING_SLOT_WIDTH = 56

const FOOTER_TEXT = /^Type a name to reach/

const namesOf = (options: HTMLElement[]) =>
	options.map(
		(option) =>
			option.querySelector('[data-slot="prompt-mention-name"]')?.textContent,
	)

const countedNameOf = (row: HTMLElement) => {
	const name = row.querySelector<HTMLElement>(
		'[data-slot="prompt-mention-name"]',
	)
	const count = row.querySelector<HTMLElement>(
		'[data-slot="prompt-mention-count"]',
	)

	if (!name || !count) throw new Error("The row drew no counted name")

	return {
		name,
		count,
		gap:
			count.getBoundingClientRect().left - name.getBoundingClientRect().right,
		tail:
			row.getBoundingClientRect().right - count.getBoundingClientRect().right,
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
			onSelect={(id, isOutside) => {
				props.onSelect(id, isOutside)
				setCounts((named) => ({ ...named, [id]: (named[id] ?? 0) + 1 }))
			}}
		/>
	)
}

const ComposedMenu = (props: PromptMentionMenuProps) => {
	const [draft, setDraft] = useState("@")

	return (
		<PromptMentionMenu {...props} query={draft.replace("@", "")}>
			<PromptInput
				aria-label="Message"
				onValueChange={setDraft}
				value={draft}
			/>
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
					"The mention popup of the composer, and the only way to bring a companion into a conversation. The host hands it every companion of the space, each flagged `isOutside` when it is not in the conversation yet. On an empty query it lists the first six companions already in the conversation and a footer counting how many more typing reaches; a typed query matches the whole space case-insensitively, companions of the conversation first, then a *Not in this conversation* boundary above the rest, drawn dimmed with an add glyph. Every row reserves the same trailing slot, carrying the crown of the lead or the add glyph. A mention reaches exactly one companion, so a selection reports a single companion id plus whether it was outside, and the menu closes on it. A row whose companion the draft already names carries the count of those mentions after its name, given by the host as data. It draws only: reading the arobase in the draft, owning `open` and `query`, and writing the mention back into the text all belong to the host. ArrowUp/ArrowDown travel and wrap, Enter and Tab select, Escape or a press outside dismisses, and a query matching no companion renders no menu at all. Reach for `PromptCommandMenu` for the slash commands of the same composer.",
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
		children: <PromptInput aria-label="Message" defaultValue="@" />,
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
					"The nominal case: the menu is open on an empty query, so every companion of the conversation is listed and the first row is the active one. Check that the panel sits above the composer on its leading edge, that each row pairs an avatar with a name, that exactly one row carries the highlight, and that Escape reports a dismissal to the host.",
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

export const Pictured = meta.story({
	args: {
		bots: [
			{ ...CONVERSATION_BOTS[0], image: UPLOADED_AVATAR_IMAGE },
			...CONVERSATION_BOTS.slice(1),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A companion wearing its picture, listed above companions drawn from a blot. Check that the picture fills its 24px slot as a rounded square with no border, that it adds nothing to the option's name, and that the rows below keep their animal over their blot.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [pictured, drawn] = canvas.getAllByRole("option")
		const [picture] = slotsIn(pictured, "bot-identity-avatar")

		await expectCompanionPictureSquare(picture)
		await expect(getComputedStyle(picture).borderRadius).toBe("6px")
		await expect(drawn.querySelector("img")).toBeNull()
		await expect(slotsIn(drawn, "bot-avatar-blot")).toHaveLength(1)
	},
})

export const Lead = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The companion that leads the conversation, marked. Check that the crown falls on the lead and on nobody else, that it never stands alone as the only sign of the role since *Lead* is announced beside it, and that the mark follows the companion rather than the first row.",
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
					"A typed query narrows the list to the companions whose name carries it, matched case-insensitively, and the highlight falls back to the first survivor. Check that the panel shrinks to the remaining rows and that clicking one reports that companion's id rather than the highlighted one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const options = canvas.getAllByRole("option")

		await expect(options).toHaveLength(5)
		await expect(options[0]).toHaveAccessibleName("Atlas Lead")

		await userEvent.click(options[1])
		await expect(args.onSelect).toHaveBeenCalledWith("bot-basile", false)
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
		await expect(args.onSelect).toHaveBeenCalledWith("bot-clemence", false)

		await userEvent.keyboard("{Tab}")
		await expect(args.onSelect).toHaveBeenCalledTimes(2)
	},
})

export const SpaceOpened = meta.story({
	args: { bots: SPACE_BOTS },
	parameters: {
		docs: {
			description: {
				story:
					"The popover opened on an empty query in a space of thirty companions, twelve of them in the conversation, listed by the host with outsiders interleaved. Check that exactly the first six companions of the conversation show in the host's order, with no scrollbar, no group label and no boundary, and that the footer counts the twenty-four more that typing reaches. `SpaceQueried` covers the same space once a name is typed.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const options = canvas.getAllByRole("option")
		const listbox = canvas.getByRole("listbox")

		await expect(options).toHaveLength(6)
		await expect(namesOf(options)).toEqual([
			"Atlas",
			"Basile",
			"Clémence",
			"Dorian",
			"Elia",
			"Faust",
		])
		await expect(listbox.scrollHeight).toBeLessThanOrEqual(listbox.clientHeight)
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()
		await expect(
			slotsIn(canvasElement, "prompt-mention-boundary"),
		).toHaveLength(0)
		await expect(slotsIn(canvasElement, "prompt-mention-footer")).toHaveLength(
			1,
		)
		await expect(
			canvas.getByText("Type a name to reach 24 more companions"),
		).toBeVisible()
	},
})

export const SpaceQueried = meta.story({
	args: { bots: SPACE_BOTS, query: "AR" },
	parameters: {
		docs: {
			description: {
				story:
					"A query typed in capitals that reaches one companion of the conversation and one outside it, the outsider listed first by the host. Check that the companion of the conversation comes first, that a single *Not in this conversation* boundary sits above the outsider, that the outsider wears its title badge, a dimmed avatar and the add glyph, that the footer is gone, and that the arrows step over the boundary so Enter reports the outsider's id with its outside flag.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const options = canvas.getAllByRole("option")
		const [boundary] = slotsIn(canvasElement, "prompt-mention-boundary")

		await expect(namesOf(options)).toEqual(["Gaspard", "Margaux"])
		await expect(
			slotsIn(canvasElement, "prompt-mention-boundary"),
		).toHaveLength(1)
		await expect(boundary).toHaveTextContent("Not in this conversation")
		await expect(
			canvas.getByRole("group", { name: "Not in this conversation" }),
		).toContainElement(options[1])
		await expect(
			boundary.compareDocumentPosition(options[1]) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(slotsIn(options[0], "prompt-mention-invite")).toHaveLength(0)
		await expect(slotsIn(options[1], "prompt-mention-invite")).toHaveLength(1)
		await expect(options[1]).toHaveAccessibleName(
			"Margaux Research Add to this conversation",
		)
		await expect(
			getComputedStyle(
				slotsIn(options[1], "bot-identity-avatar")[0].parentElement as Element,
			).opacity,
		).toBe("0.7")
		await expect(canvas.queryByText(FOOTER_TEXT)).not.toBeInTheDocument()

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[1]).toHaveAttribute("aria-selected", "true")

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenCalledWith("bot-margaux", true)
	},
})

export const SpaceMatchesInside = meta.story({
	args: { bots: SPACE_BOTS, query: "atl" },
	parameters: {
		docs: {
			description: {
				story:
					"A query whose only match is already in the conversation, in a space where outsiders exist. Check that no boundary row is drawn and no footer either, since the boundary only ever introduces companions outside the conversation.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getAllByRole("option")).toHaveLength(1)
		await expect(
			slotsIn(canvasElement, "prompt-mention-boundary"),
		).toHaveLength(0)
		await expect(canvas.queryByText(FOOTER_TEXT)).not.toBeInTheDocument()
	},
})

export const SpaceKeyboardTravel = meta.story({
	args: { bots: SPACE_BOTS, query: "e" },
	parameters: {
		docs: {
			description: {
				story:
					"A query reaching more companions than the panel shows, across the boundary. Check that the list scrolls instead of growing past the composer and that travelling with the arrows keeps the active row in view, the boundary included in the wrap but never highlighted.",
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

export const LongContent = meta.story({
	args: {
		bots: LONG_NAMED_SPACE_BOTS,
		leadId: LONG_NAMED_BOTS[0].id,
		query: "e",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two companions named far past their row, one leading the conversation and one outside it, each with a title. Check that only the name gives way to an ellipsis, that the title badge stays whole, and that the trailing slot keeps its full width with the crown or the add glyph flush to the row's end.",
			},
		},
	},
	play: async ({ canvas }) => {
		const rows = [
			canvas.getByRole("option", { name: /Release notes editor/ }),
			canvas.getByRole("option", { name: /Incident triage/ }),
		]

		for (const row of rows) {
			const [name] = slotsIn(row, "prompt-mention-name")
			const [badge] = slotsIn(row, "bot-title-badge")
			const [trailing] = slotsIn(row, "prompt-mention-trailing")
			const mark = trailing.querySelector("svg") as SVGElement

			await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
			await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth)
			await expect(trailing.getBoundingClientRect().width).toBe(
				TRAILING_SLOT_WIDTH,
			)
			await expect(
				row.getBoundingClientRect().right - mark.getBoundingClientRect().right,
			).toBeCloseTo(ROW_EDGE_PADDING, 0)
		}
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
		await userEvent.click(canvas.getByRole("textbox", { name: "Message" }))
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
					"The query matches no companion, so the menu renders nothing at all — no panel, no empty message, no keyboard capture. Check that the composer alone remains and that Enter reaches it, since the menu must not swallow a submission it has no row to answer with.",
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
					"The draft already names two of the listed companions, one once and one three times, and says nothing of the others. Check that the count reads as part of the name it counts, one row-gap after its last glyph and nowhere near the trailing edge, that the number is announced as a phrase rather than as a bare glyph, and that a companion the draft never names renders exactly as it does everywhere else — no zero, no placeholder.",
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

		const { gap, tail } = countedNameOf(options[1])

		await expect(gap).toBeCloseTo(NAME_TO_COUNT_GAP, 0)
		await expect(tail).toBeGreaterThan(ROW_EDGE_PADDING)
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
	play: async ({ canvas }) => {
		const row = canvas.getAllByRole("option")[0]

		await expect(row).toHaveAccessibleName("Atlas 2 mentions in the draft Lead")

		const { count } = countedNameOf(row)
		const crown = row.querySelector<HTMLElement>(
			'[data-slot="prompt-mention-lead"]',
		)

		if (!crown) throw new Error("The row drew no crown beside its count")

		await expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(
			crown.getBoundingClientRect().left,
		)
		await expect(
			row.getBoundingClientRect().right - crown.getBoundingClientRect().right,
		).toBeCloseTo(ROW_EDGE_PADDING, 0)
	},
})

export const CountedLongName = meta.story({
	args: { bots: CROWDED_BOTS, counts: { "bot-release": 4 }, query: "notes" },
	parameters: {
		docs: {
			description: {
				story:
					"A count on a companion named far past the width of its row. Check that the name is the only part that gives way to an ellipsis and that the digits stay whole, one row gap before the reserved trailing slot: a reader must never lose the number to the overflow of a name.",
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas.getByRole("option", { name: /Release notes editor/ })
		const { name, count, gap, tail } = countedNameOf(row)

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(count.scrollWidth).toBe(count.clientWidth)
		await expect(gap).toBeCloseTo(NAME_TO_COUNT_GAP, 0)
		await expect(tail).toBeCloseTo(
			ROW_EDGE_PADDING + TRAILING_SLOT_WIDTH + ROW_GAP,
			0,
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
