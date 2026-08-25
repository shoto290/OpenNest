import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	FRAME_POLL,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	AgentSidebar,
	type AgentSidebarBot,
	type AgentSidebarProps,
	type BotAvatarBlot,
	type Space,
	type UserChipIdentity,
} from "@workspace/ui/components/agents/agent-sidebar"
import { blotTransform } from "@workspace/ui/components/bot-avatar-blot"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { SWIPE_SETTLE } from "@workspace/ui/hooks/use-space-swipe"

const LAST_MESSAGE =
	"Renamed the transport module and updated every caller, so the second turn resumes the first one cleanly again."

const SINGLE_LINE_HEIGHT = 20

const NARROW_VIEWPORT = {
	narrow: { name: "Narrow", styles: { width: "800px", height: "900px" } },
}

const SHORT_VIEWPORT = {
	short: { name: "Short", styles: { width: "1000px", height: "420px" } },
}

const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

const ROSTER: AgentSidebarBot[] = [
	{
		id: "atlas",
		blot: "blue",
		name: "Atlas",
		title: "Research",
		animal: "owl",
		lastMessage: "Pulled the three papers and summarised each one for you.",
		timestamp: "09:24",
	},
	{
		id: "beacon",
		blot: "yellow",
		name: "Beacon",
		animal: "cat",
		lastMessage: LAST_MESSAGE,
		timestamp: "09:18",
	},
	{
		id: "cinder",
		blot: "red",
		name: "Cinder",
		title: "Build",
		animal: "dog",
		status: "working",
		pose: "working",
		lastMessage: "Rebuilding the desktop bundle.",
		timestamp: "09:12",
	},
	{
		id: "dune",
		blot: "green",
		name: "Dune",
		animal: "bear",
		lastMessage: "Nothing since the migration landed.",
		timestamp: "Mon",
	},
	{
		id: "ember",
		blot: "purple",
		name: "Ember",
		title: "Review",
		animal: "rabbit",
		lastMessage: "Left four comments on the transport rename.",
		timestamp: "Mon",
	},
	{
		id: "flint",
		blot: "pink",
		name: "Flint",
		animal: "mouse",
		lastMessage: "Ran the suite twice, both green.",
		timestamp: "Sun",
	},
	{
		id: "grove",
		blot: "cyan",
		name: "Grove",
		title: "Docs",
		animal: "koala",
		lastMessage: "Rewrote the setup page around the new command.",
		timestamp: "Sun",
	},
	{
		id: "harbor",
		blot: "orange",
		name: "Harbor",
		animal: "chick",
		lastMessage: "Waiting on the credentials you promised.",
		timestamp: "Sat",
	},
	{
		id: "iris",
		blot: "yellow",
		name: "Iris",
		title: "Design",
		animal: "cat",
		lastMessage: "Swapped the rail avatars for the new blots.",
		timestamp: "Sat",
	},
	{
		id: "juno",
		blot: "blue",
		name: "Juno",
		animal: "owl",
		lastMessage: "Summarised yesterday's session into six bullets.",
		timestamp: "Fri",
	},
	{
		id: "kite",
		blot: "red",
		name: "Kite",
		title: "Ops",
		animal: "dog",
		lastMessage: "Rotated the signing key and restarted the runner.",
		timestamp: "Fri",
	},
	{
		id: "lumen",
		blot: "orange",
		name: "Lumen",
		animal: "bear",
		lastMessage: "Nothing yet.",
		timestamp: "Thu",
	},
]

const IDENTITY_BLOTS: BotAvatarBlot[] = [
	"red",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
	"orange",
]

const IDENTITY_ROSTER: AgentSidebarBot[] = IDENTITY_BLOTS.map(
	(blot, index) => ({
		...ROSTER[index],
		blot,
		status: "idle",
	}),
)

const blotsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "bot-avatar-blot")

const blotFillsIn = (canvasElement: HTMLElement) =>
	blotsIn(canvasElement).map((path) => path.getAttribute("fill"))

const SHARED_TINT_ROSTER: AgentSidebarBot[] = IDENTITY_ROSTER.map((bot) => ({
	...bot,
	blot: "blue",
}))

const LONG_ROSTER: AgentSidebarBot[] = [0, 1, 2].flatMap((pass) =>
	ROSTER.map((bot) => ({ ...bot, id: `${bot.id}-${pass}` })),
)

const FOOTER_LABEL = "Workspace settings"

const FOOTER_CONTENT = (
	<Button
		aria-label={FOOTER_LABEL}
		size="icon-sm"
		tooltip={FOOTER_LABEL}
		variant="ghost"
	>
		<Icons.Settings aria-hidden="true" />
	</Button>
)

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: "blue" },
	{ id: "vocca", name: "Vocca", colour: "green" },
	{ id: "atelier", name: "Atelier", colour: "pink" },
	{ id: "veille", name: "Veille", colour: "yellow" },
	{ id: "archives", name: "Archives", colour: "purple" },
	{ id: "chantier", name: "Chantier", colour: "orange" },
	{ id: "lecture", name: "Lecture", colour: "cyan" },
	{ id: "brouillons", name: "Brouillons", colour: "red" },
	{ id: "essais", name: "Essais", colour: "green" },
]

const READER_NAME = "Ada Martin"

const READER: UserChipIdentity = {
	name: READER_NAME,
	image: UPLOADED_IMAGE,
}

const SilentSlot = () => null

const SILENT_FOOTER_CONTENT = <SilentSlot />

const footerRowWidth = (footer: HTMLElement) => {
	const style = getComputedStyle(footer)
	return (
		footer.clientWidth -
		Number.parseFloat(style.paddingLeft) -
		Number.parseFloat(style.paddingRight)
	)
}

const verticalCentreOf = (box: DOMRect) => box.top + box.height / 2

const withoutTitle = (bot: AgentSidebarBot): AgentSidebarBot => ({
	...bot,
	title: undefined,
})

const withoutHistory = (bot: AgentSidebarBot): AgentSidebarBot => ({
	...bot,
	lastMessage: undefined,
	timestamp: undefined,
})

const rowsIn = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="sidebar-menu-item"]',
		),
	)

const slotIn = (row: HTMLElement, slot: string) => {
	const node = row.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
	if (!node) throw new Error(`Nothing here draws a ${slot}`)
	return node
}

const rowFor = (canvasElement: HTMLElement, name: string) => {
	const row = rowsIn(canvasElement).find(
		(item) => slotIn(item, "roster-row-name").textContent === name,
	)
	if (!row) throw new Error(`No roster row named ${name}`)
	return row
}

const rowButton = (row: HTMLElement) => slotIn(row, "sidebar-menu-button")

const bottomOf = (node: HTMLElement) => node.getBoundingClientRect().bottom

const expectFooterAtColumnBottom = async (canvasElement: HTMLElement) => {
	const footer = slotIn(canvasElement, "sidebar-footer")
	await expect(footer.getBoundingClientRect().top).toBeCloseTo(
		bottomOf(slotIn(canvasElement, "sidebar-content")),
		0,
	)
	await expect(bottomOf(footer)).toBeCloseTo(
		bottomOf(slotIn(canvasElement, "sidebar-panel")),
		0,
	)
}

const offsetsFrom =
	(edge: (rowBox: DOMRect, box: DOMRect) => number) =>
	(rows: HTMLElement[], slot: string) =>
		rows.map((row) => {
			const rowBox = row.getBoundingClientRect()
			const box = slotIn(row, slot).getBoundingClientRect()
			return `${Math.round(edge(rowBox, box))}/${Math.round(box.top - rowBox.top)}`
		})

const startOffsets = offsetsFrom((rowBox, box) => box.left - rowBox.left)

const endOffsets = offsetsFrom((rowBox, box) => rowBox.right - box.right)

const uniqueCount = (values: unknown[]) => new Set(values).size

const rowHeights = (rows: HTMLElement[]) =>
	rows.map((row) => Math.round(row.getBoundingClientRect().height))

const isClipped = (node: HTMLElement) => node.scrollWidth > node.clientWidth

const previewShortfalls = (rows: HTMLElement[]) =>
	rows.map((row) => {
		const preview = slotIn(row, "roster-row-preview").getBoundingClientRect()
		const column = slotIn(row, "roster-row-timestamp").getBoundingClientRect()
		return Math.round(column.right - preview.right)
	})

const expectAlignedRows = async (rows: HTMLElement[]) => {
	await expect(uniqueCount(startOffsets(rows, "roster-row-name"))).toBe(1)
	await expect(uniqueCount(startOffsets(rows, "roster-row-preview"))).toBe(1)
	await expect(uniqueCount(startOffsets(rows, "roster-row-timestamp"))).toBe(1)
	await expect(uniqueCount(endOffsets(rows, "roster-row-timestamp"))).toBe(1)
	await expect(previewShortfalls(rows)).toEqual(rows.map(() => 0))
	await expect(uniqueCount(rowHeights(rows))).toBe(1)
}

const colorOf = (row: HTMLElement, slot: string) =>
	getComputedStyle(slotIn(row, slot)).color

const tokenColor = (scope: HTMLElement, token: string) => {
	const probe = document.createElement("div")
	probe.style.color = `var(${token})`
	scope.append(probe)
	const color = getComputedStyle(probe).color
	probe.remove()
	return color
}

const expectMutedSecondaryText = async (row: HTMLElement, muted: string) => {
	await expect(colorOf(row, "roster-row-preview")).toBe(muted)
	await expect(colorOf(row, "roster-row-timestamp")).toBe(muted)
	await expect(colorOf(row, "roster-row-name")).not.toBe(muted)
}

const highlightIn = (item: HTMLElement) => item.querySelector("span")

const railWidth = () => {
	const probe = document.createElement("div")
	probe.style.width = "var(--sidebar-width-icon)"
	document.body.append(probe)
	const width = probe.getBoundingClientRect().width
	probe.remove()
	return width
}

const renderShell = (defaultOpen: boolean) => (args: AgentSidebarProps) => (
	<WorkspaceShell
		defaultOpen={defaultOpen}
		sidebar={<AgentSidebar {...args} />}
	>
		{null}
	</WorkspaceShell>
)

const meta = preview.meta({
	title: "Navigation/AgentSidebar",
	component: AgentSidebar,
	render: renderShell(true),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The roster panel of an agent app, mounted whole: the animated sidebar shell around every bot the reader owns. It carries no chrome of its own beyond the create button — the pinned region above the list clears the window controls, and the open state comes from the `WorkspaceShell` above it, so Cmd/Ctrl+B and whatever trigger the page mounts drive the panel and the column beside it together. A row is the bot avatar, its name, an optional title badge and the time of its last message, over one clipped line of that message. A bot at rest holds the pose it was given in its settings, drawn as a still frame; a bot that is running holds its work pose, animates, and wears an activity dot. A bot wearing a picture its reader uploaded shows that instead, and it never moves — the dot is what says it is working. Settings, duplicate and delete live behind a right-click on the row — there is no actions button to reveal — and selection and running state are props, so a host maps its store onto `bots` and `selectedBotId` and nothing here polls the transport.",
			},
		},
	},
	args: {
		bots: ROSTER,
		selectedBotId: "beacon",
		onSelectBot: fn(),
		onCreateBot: fn(),
		onEditBot: fn(),
		onDuplicateBot: fn(),
		onDeleteBot: fn(),
		onOpenUserSettings: fn(),
		onSelectSpace: fn(),
		onCreateSpace: fn(),
		onOpenSpaceSettings: fn(),
	},
	argTypes: {
		selectedBotId: { control: "text" },
	},
})

export const Roster = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A dozen bots, some with a title badge and some without, each wearing the blot it was given. Check that the avatars, the names and the timestamps each hold one column down the whole list — a row without a badge must not slide its name or its preview out of line with the row above it — and that every row is the same height whatever it carries. The message and the time read as muted and read alike, on the selected row as on the rest, so a row says its name first and dates itself second; the name is the only line in the row drawn at full strength. The list is walked with Tab and a row is its own only stop, since the actions carry no button: the create button first, then one stop per row, and Enter on a row reports the selection rather than taking it. Pick `LongContent` for the same list under names and messages that do not fit, `RowContextMenu` for the actions behind a row, `Identities` for the blots at rest.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const rows = rowsIn(canvasElement)
		await expect(rows).toHaveLength(ROSTER.length)

		await expectAlignedRows(rows)

		const muted = tokenColor(canvasElement, "--muted-foreground")
		await expectMutedSecondaryText(rows[0], muted)
		await expectMutedSecondaryText(rowFor(canvasElement, "Beacon"), muted)

		const badged = rows.filter((row) =>
			row.querySelector('[data-slot="roster-row-badge"]'),
		)
		await expect(badged).toHaveLength(ROSTER.filter((bot) => bot.title).length)
		await expect(
			rowFor(canvasElement, "Beacon").querySelector(
				'[data-slot="roster-row-badge"]',
			),
		).toBeNull()

		const create = canvas.getByRole("button", { name: "New bot" })
		await userEvent.tab()
		await expect(create).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onCreateBot).toHaveBeenCalled()

		await userEvent.tab()
		await expect(rowButton(rows[0])).toHaveFocus()
		await userEvent.tab()
		await expect(rowButton(rows[1])).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectBot).toHaveBeenCalledWith("beacon")

		await expect(rowButton(rows[0])).toHaveAttribute("aria-haspopup", "menu")
	},
})

export const CreateLabel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The one label in this panel that cannot open upwards. The create control is pinned in the region that clears the window controls, against the top of the window, so a label above it would be drawn off the screen — it opens under the button instead, on hover and on focus alike. Check both, and check that the bubble sits inside the window on every edge: a label a reader cannot read is the same as no label.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "New bot" })
		const label = () => document.body.querySelector('[role="tooltip"]')

		const opensBelow = async () => {
			await waitFor(async () => {
				await expect(label()).toBeVisible()
				await expect(label()).toHaveTextContent("New bot")
			})
			const bubble = label()?.getBoundingClientRect()
			const button = create.getBoundingClientRect()
			if (!bubble) throw new Error("The create control drew no label")

			await expect(bubble.top).toBeGreaterThanOrEqual(button.bottom)
			await expect(bubble.top).toBeGreaterThanOrEqual(0)
			await expect(bubble.left).toBeGreaterThanOrEqual(0)
			await expect(bubble.bottom).toBeLessThanOrEqual(window.innerHeight)
			await expect(bubble.right).toBeLessThanOrEqual(window.innerWidth)
		}

		await userEvent.hover(create)
		await opensBelow()

		await userEvent.unhover(create)
		await waitFor(async () => expect(label()).toBeNull())

		await userEvent.tab()
		await expect(create).toHaveFocus()
		await opensBelow()
	},
})

export const Empty = meta.story({
	args: { bots: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who owns no bot yet. Check that the list is gone rather than left as an empty box, that the copy says so in one line, and that the create button is still the first thing Tab reaches — it is the only way out of this state. The live region says nothing is selected, so a screen reader is not left waiting for a row that never comes.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(rowsIn(canvasElement)).toHaveLength(0)
		await expect(canvas.getByText("No bots yet")).toBeVisible()
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"No bot selected",
		)

		const create = canvas.getByRole("button", { name: "New bot" })
		await userEvent.tab()
		await expect(create).toHaveFocus()
		await expect(create.matches(":focus-visible")).toBe(true)
	},
})

export const SingleBot = meta.story({
	args: { bots: [ROSTER[1]], selectedBotId: "beacon" },
	parameters: {
		docs: {
			description: {
				story:
					"One bot, which is where most readers start. Check that a single row still lays out on the same columns as a full roster — the avatar slot and the timestamp slot are fixed, so the first row of a roster and the only row of this one sit identically — and that the message clips to one line with an ellipsis instead of wrapping the row taller. Pick `Roster` for the same row among eleven others.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const rows = rowsIn(canvasElement)
		await expect(rows).toHaveLength(1)

		const row = rows[0]
		await expect(rowButton(row)).toHaveAttribute("aria-current", "page")
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent("09:18")

		const preview = slotIn(row, "roster-row-preview")
		await expect(isClipped(preview)).toBe(true)
		await expect(preview.getBoundingClientRect().height).toBeLessThanOrEqual(
			SINGLE_LINE_HEIGHT,
		)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Beacon selected, idle",
		)
	},
})

export const NoTitles = meta.story({
	args: {
		bots: ROSTER.slice(0, 5).map(withoutTitle),
		selectedBotId: "atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A roster where no bot carries a title. Check that no badge is drawn at all — not an empty one holding its box — and that the rows keep the height and the baselines they have when badges are present, since the name line owns that height rather than the badge inside it. Pick `Roster` for the mixed case the alignment has to survive.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = rowsIn(canvasElement)
		await expect(
			canvasElement.querySelectorAll('[data-slot="roster-row-badge"]'),
		).toHaveLength(0)
		await expectAlignedRows(rows)
	},
})

export const NoHistory = meta.story({
	args: {
		bots: [
			ROSTER[0],
			withoutHistory(ROSTER[1]),
			withoutHistory(ROSTER[3]),
			ROSTER[4],
		],
		selectedBotId: "beacon",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two bots nobody has talked to yet, between two that carry a message and a time. Check that a row with neither draws two empty lines rather than one — it keeps the height of a full row and holds its name exactly where its neighbours hold theirs, since the lines own their height and not the text inside them — and that the timestamp slot stays reserved at the end of the name line, so a time arriving later lands on the column the rest of the list already stands on instead of shifting it. Pick `Roster` for rows that all carry both, `LongContent` for the name that has to give way to a time on the same line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = rowsIn(canvasElement)
		const bare = rowFor(canvasElement, "Beacon")

		await expect(slotIn(bare, "roster-row-timestamp")).toBeEmptyDOMElement()
		await expect(slotIn(bare, "roster-row-preview")).toBeEmptyDOMElement()
		await expect(slotIn(rows[0], "roster-row-timestamp")).toHaveTextContent(
			"09:24",
		)

		await expectAlignedRows(rows)
	},
})

export const Selected = meta.story({
	args: { selectedBotId: "ember" },
	parameters: {
		docs: {
			description: {
				story:
					'The selected row, which is the one thing in the panel a reader has to be able to find without looking twice. Check that exactly one row carries the pill and `aria-current="page"`, that clicking another row reports it rather than moving the pill on its own — selection is a prop — and that the live region names the selected bot, so the choice is spoken and not only drawn.',
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const selected = rowFor(canvasElement, "Ember")
		const other = rowFor(canvasElement, "Atlas")

		await expect(rowButton(selected)).toHaveAttribute("aria-current", "page")
		await expect(rowButton(other)).not.toHaveAttribute("aria-current")
		await expect(
			canvasElement.querySelectorAll('[aria-current="page"]'),
		).toHaveLength(1)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Ember selected, idle",
		)

		await userEvent.click(rowButton(other))
		await expect(args.onSelectBot).toHaveBeenCalledWith("atlas")
		await expect(rowButton(selected)).toHaveAttribute("aria-current", "page")
	},
})

export const UploadedPictures = meta.story({
	args: {
		bots: [
			{ ...ROSTER[0], image: UPLOADED_IMAGE },
			{
				...ROSTER[2],
				image: UPLOADED_IMAGE,
				status: "working",
				pose: "writing",
			},
			ROSTER[1],
		],
		selectedBotId: "atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two bots wearing a picture their reader uploaded, beside one wearing its animal. A picture is a still image whatever the bot is doing, so the row that is running says so with its activity dot and its message line rather than by moving — and it lands in the same slot as a drawing, so the names and the timestamps stay on the column the rest of the roster holds. Check that a row with a picture draws no animal and no blot at all, and that the picture is decorative: the row is already named by its own text. Pick `Identities` for the animals a bot wears when it has no picture.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = rowsIn(canvasElement)
		const [wearing, running, drawn] = rows

		await expect(wearing.querySelector("img")).toHaveAttribute(
			"src",
			UPLOADED_IMAGE,
		)
		await expect(wearing.querySelector("svg")).toBeNull()
		await expect(drawn.querySelector("img")).toBeNull()
		await expect(within(drawn).getByRole("img")).toBeVisible()
		await expect(
			running.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()
		await expectAlignedRows(rows)
	},
})

export const SharedTint = meta.story({
	args: {
		bots: SHARED_TINT_ROSTER,
		selectedBotId: SHARED_TINT_ROSTER[0].id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Eight bots that all picked the same tint. Before a shape was derived from the id they were stamped from one die and a reader had to read the names to tell the rows apart; now each id lays the one authored blot down at its own quarter turn, mirrored or not. The vocabulary is deliberately small — eight poses, and eight tints over them — so two rows can still land on the same mark, and a reader who wants them apart changes a tint. What matters is that a row never changes shape: rename the bot, give it another animal, give it another tint, and the mark it wears is the one it was minted with. Pick `Identities` for the eight tints on their own.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shapes = blotsIn(canvasElement).map((path) =>
			path.getAttribute("transform"),
		)

		await expect(shapes).toHaveLength(SHARED_TINT_ROSTER.length)
		for (const [at, shape] of shapes.entries()) {
			await expect(
				shape?.endsWith(blotTransform(SHARED_TINT_ROSTER[at].id)),
			).toBe(true)
		}
		await expect(uniqueCount(shapes)).toBeGreaterThan(1)
	},
})

export const Identities = meta.story({
	args: {
		bots: IDENTITY_ROSTER,
		selectedBotId: IDENTITY_ROSTER[0].id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The eight blots a bot can be given in its settings, one per row, with nothing running. Every avatar here draws the same idle animal — what tells the rows apart is the tint behind it, not what the bot is doing — and every one of them is a still frame, so a panel of bots that are doing nothing is a panel that does not move. Check that each row wears its own tint, that the ink line and the ear accent stay legible over all eight, that no row carries an activity dot, and that the panel does not report itself busy. The test browser renders every story with reduced motion, so the stillness is read here rather than measured; open the story in Storybook beside `Working` to see the difference. Pick `Working` for the state that animates.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const rows = rowsIn(canvasElement)

		await expect(rows).toHaveLength(IDENTITY_BLOTS.length)
		await expect(blotFillsIn(canvasElement)).toEqual(
			IDENTITY_BLOTS.map((blot) => `var(--bot-blot-${blot})`),
		)
		for (const row of rows) {
			await expect(
				within(row).getByRole("img", { name: /idle$/ }),
			).toBeVisible()
		}

		await expect(
			canvasElement.querySelectorAll('[data-slot="bot-activity-dot"]'),
		).toHaveLength(0)
		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "false")
		await expect(uniqueCount(rowHeights(rows))).toBe(1)
	},
})

export const Working = meta.story({
	args: {
		bots: [
			{ ...ROSTER[0], status: "working", pose: "thinking" },
			{ ...ROSTER[1], status: "working", pose: "searching" },
			{ ...ROSTER[2], status: "working", pose: "writing" },
			{ ...ROSTER[3], status: "working", pose: "working" },
			ROSTER[4],
		],
		selectedBotId: "cinder",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Four bots running at once and one at rest. Check that each running row holds its own work pose in the avatar and wears the activity dot, that the verb takes over the message line while it runs, and that the row at rest wears neither and keeps its blot and its idle frame instead. This is the only state that moves: a running avatar animates, and every other row in the panel is a still frame, so motion in the list means work in the list. The panel reports itself busy while any row runs, and the announcement stays outside it: a live region nested inside an `aria-busy` landmark is swallowed and never reaches a screen reader. Pick `Identities` for the rows that hold still, `PermissionPending` for the one running state that looks like rest.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(panel).toHaveAttribute("aria-busy", "true")

		const running = rowFor(canvasElement, "Cinder")
		await expect(
			running.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()
		await expect(slotIn(running, "roster-row-preview")).toHaveTextContent(
			"writing…",
		)
		await expect(
			within(running).getByRole("img", { name: "Bot avatar dog, writing" }),
		).toBeVisible()

		const resting = rowFor(canvasElement, "Ember")
		await expect(
			resting.querySelector('[data-slot="bot-activity-dot"]'),
		).toBeNull()
		await expect(
			within(resting).getByRole("img", { name: /idle$/ }),
		).toBeVisible()
		await expect(blotFillsIn(resting)).toEqual(["var(--bot-blot-purple)"])

		await expect(
			within(rowFor(canvasElement, "Atlas")).getByRole("img", {
				name: /thinking$/,
			}),
		).toBeVisible()
		await expect(
			within(rowFor(canvasElement, "Beacon")).getByRole("img", {
				name: /searching$/,
			}),
		).toBeVisible()
		await expect(
			within(rowFor(canvasElement, "Dune")).getByRole("img", {
				name: /working$/,
			}),
		).toBeVisible()

		await expect(uniqueCount(rowHeights(rowsIn(canvasElement)))).toBe(1)
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Cinder selected, writing",
		)
	},
})

export const PermissionPending = meta.story({
	args: {
		bots: [{ ...ROSTER[0], status: "working", pose: "waiting" }, ROSTER[1]],
		selectedBotId: "atlas",
	},
	parameters: {
		docs: {
			description: {
				story:
					'A turn blocked on a permission prompt, which a host maps to `status="working"` with `pose="waiting"` — the turn is waiting on the reader, not over. Check that the avatar holds its listening pose rather than the idle frame it wears at rest, that it is still animating, and that the dot is there: the panel reports itself busy and the announcement says the bot is waiting, so a row that looked idle here would contradict both at once. Pick `Working` for the work poses that cannot be mistaken for rest, `Identities` for the still frame this state must not fall back to.',
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const row = rowFor(canvasElement, "Atlas")
		await expect(
			within(row).getByRole("img", { name: /listening$/ }),
		).toBeVisible()
		await expect(within(row).queryByRole("img", { name: /idle$/ })).toBeNull()
		await expect(slotIn(row, "roster-row-preview")).toHaveTextContent(
			"waiting…",
		)
		await expect(
			row.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()

		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(panel).toHaveAttribute("aria-busy", "true")

		const liveRegion = canvas.getByRole("status")
		await expect(liveRegion).toHaveTextContent("Atlas selected, waiting")
		await expect(panel.contains(liveRegion)).toBe(false)
	},
})

export const LongContent = meta.story({
	args: {
		bots: [
			{
				id: "long",
				name: "Bartholomew Featherstonehaugh the Third",
				title: "Infrastructure",
				animal: "bear",
				lastMessage: LAST_MESSAGE,
				timestamp: "Yesterday",
			},
			ROSTER[1],
			{
				id: "longer",
				name: "Anastasia Konstantinopoulos-Whitmore",
				animal: "owl",
				lastMessage: LAST_MESSAGE,
				timestamp: "12:07",
			},
		],
		selectedBotId: "long",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Names, titles and messages that do not fit. Check that each of them clips to one line with an ellipsis rather than wrapping — a wrapped name would take its row taller and break the column the rest of the list stands on — that the badge stays whole beside a truncated name instead of being pushed out, and that the timestamp keeps its slot on the trailing edge whatever the name does. Pick `Roster` for the same columns under content that fits.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = rowsIn(canvasElement)
		const long = rows[0]
		const name = slotIn(long, "roster-row-name")
		const preview = slotIn(long, "roster-row-preview")

		await expect(isClipped(name)).toBe(true)
		await expect(isClipped(preview)).toBe(true)
		await expect(name.getBoundingClientRect().height).toBeLessThanOrEqual(
			SINGLE_LINE_HEIGHT,
		)
		await expect(preview.getBoundingClientRect().height).toBeLessThanOrEqual(
			SINGLE_LINE_HEIGHT,
		)
		await expect(slotIn(long, "roster-row-badge")).toBeVisible()

		await expectAlignedRows(rows)
	},
})

export const RowContextMenu = meta.story({
	args: { bots: ROSTER.slice(0, 4), selectedBotId: "beacon" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The actions behind a row, on the third one. There is no button to find: the row itself is the trigger, so the columns never move to make room for a control and nothing appears on hover. A pointer right-clicks the row; a keyboard reaches the same menu with the Menu key or Shift+F10 on the focused row, which is what this story presses. Check that the menu offers bot settings, a duplicate under it and delete with delete reading as destructive, that the arrow keys walk them, and that Escape closes the menu and puts focus back on the row it belongs to rather than dropping it on the page. The highlight is drawn on the item under the pointer and nowhere else: it does not slide across from the item before it, which is a deliberate local deviation from the registry component's gliding row — travel under a pointer reads as lag. The row says it carries a menu through `aria-haspopup`, and says whether it is open. The menu is left open here so the panel can be read with it up. Delete carries `--destructive`, which does not clear AA against a light popup at this size — the same open question `Primitives/Button` already carries on its own destructive variant, and a token decision rather than a decision this menu can make on its own.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const row = rowFor(canvasElement, "Cinder")
		const trigger = rowButton(row)
		const overlay = within(document.body)

		await expect(within(row).getAllByRole("button")).toHaveLength(1)
		await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.tab()
		await userEvent.tab()
		await userEvent.tab()
		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Shift>}{F10}{/Shift}")
		const menu = await overlay.findByRole("menu", {
			name: "Actions for Cinder",
		})
		const settings = within(menu).getByRole("menuitem", { name: "Settings" })
		const duplicate = within(menu).getByRole("menuitem", { name: "Duplicate" })
		const remove = within(menu).getByRole("menuitem", { name: "Delete" })
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await waitFor(async () => {
			await expect(settings).toHaveFocus()
		}, FRAME_POLL)
		await expect(highlightIn(settings)).not.toBeNull()
		await expect(getComputedStyle(remove).color).not.toBe(
			getComputedStyle(settings).color,
		)

		await userEvent.keyboard("{ArrowDown}")
		await expect(duplicate).toHaveFocus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(remove).toHaveFocus()
		await expect(highlightIn(remove)).not.toBeNull()
		await expect(highlightIn(settings)).toBeNull()
		await userEvent.keyboard("{Escape}")
		await waitFor(async () => {
			await expect(overlay.queryByRole("menu")).toBeNull()
		}, FRAME_POLL)
		await expect(trigger).toHaveFocus()

		await userEvent.pointer({ keys: "[MouseRight]", target: trigger })
		await userEvent.click(
			await overlay.findByRole("menuitem", { name: "Settings" }),
		)
		await expect(args.onEditBot).toHaveBeenCalledWith("cinder")

		await userEvent.pointer({ keys: "[MouseRight]", target: trigger })
		await userEvent.click(
			await overlay.findByRole("menuitem", { name: "Duplicate" }),
		)
		await expect(args.onDuplicateBot).toHaveBeenCalledWith("cinder")

		await userEvent.pointer({ keys: "[MouseRight]", target: trigger })
		await userEvent.click(
			await overlay.findByRole("menuitem", { name: "Delete" }),
		)
		await expect(args.onDeleteBot).toHaveBeenCalledWith("cinder")

		await userEvent.pointer({ keys: "[MouseRight]", target: trigger })
		await expect(await overlay.findByRole("menu")).toBeVisible()
		await expect(
			uniqueCount(endOffsets(rowsIn(canvasElement), "roster-row-timestamp")),
		).toBe(1)
	},
})

export const Collapsed = meta.story({
	render: renderShell(false),
	parameters: {
		docs: {
			description: {
				story:
					"The panel opened on its icon rail, which is how a host restores a remembered choice through `defaultOpen`. Check that the rail is one avatar wide with the avatars sitting centred in it and nothing clipped against either edge, that the create button rides down with it, and that the names, badges and timestamps are gone from the picture and from the accessibility tree — each row keeps its name through `aria-label` instead. A row is still one button and one only, and right-clicking it still reaches its actions. Pick `Toggle` to watch the panel travel between the two widths.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		const rail = railWidth()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)

		const create = canvas.getByRole("button", { name: "New bot" })
		await userEvent.tab()
		await expect(create).toHaveFocus()

		const row = rowsIn(canvasElement)[0]
		await userEvent.tab()
		await expect(rowButton(row)).toHaveFocus()
		await expect(rowButton(row).matches(":focus-visible")).toBe(true)
		await expect(rowButton(row)).toHaveAccessibleName("Atlas")
		await expect(within(row).getAllByRole("button")).toHaveLength(1)

		const panelBox = panel.getBoundingClientRect()
		const avatarBox = within(row)
			.getByRole("img", { name: /idle$/ })
			.getBoundingClientRect()
		await expect(avatarBox.left).toBeGreaterThanOrEqual(panelBox.left)
		await expect(avatarBox.right).toBeLessThanOrEqual(panelBox.right)

		await expect(
			slotIn(row, "roster-row-preview").closest("[aria-hidden='true']"),
		).not.toBeNull()
	},
})

export const Toggle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The collapse itself, driven from Cmd/Ctrl+B — the panel carries no trigger of its own, so the shortcut and whatever control the page mounts are the two ways in. Check that one press takes the panel to the rail and back, that focus stays exactly where it was instead of falling back to the page, and that the rows ride the width down without changing height or the column beside them reflowing twice. Pick `Collapsed` for the resting rail.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		const row = rowsIn(canvasElement)[0]
		const button = rowButton(row)
		const preview = slotIn(row, "roster-row-preview")
		const rowHeight = row.getBoundingClientRect().height
		const rail = railWidth()

		await expect(panel).toHaveAttribute("data-state", "expanded")
		await userEvent.tab()
		await userEvent.tab()
		await expect(button).toHaveFocus()

		await userEvent.keyboard("{Meta>}b{/Meta}")
		await expect(panel).toHaveAttribute("data-state", "collapsed")
		await expect(button).toHaveFocus()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)
		await expect(row.getBoundingClientRect().height).toBe(rowHeight)

		await userEvent.keyboard("{Control>}b{/Control}")
		await expect(panel).toHaveAttribute("data-state", "expanded")
		await expect(button).toHaveFocus()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeGreaterThan(rail)
			const label = preview.closest("[aria-hidden]")
			await expect(label && getComputedStyle(label).opacity).toBe("1")
		}, FRAME_POLL)
	},
})

export const Narrow = meta.story({
	globals: { viewport: { value: "narrow" } },
	parameters: {
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"The roster in a window just wide enough to keep two columns, one notch above the width where the panel becomes a drawer. Check that it is still a column at its full width rather than the icon rail — a breakpoint that collapsed it early would fail here — and that the rows keep their columns at that width. Pick `Roster` for a full window, `Layout/WorkspaceShell` `OffCanvas` for the drawer a narrower window gets instead.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(panel.getBoundingClientRect().width).toBeGreaterThan(
			railWidth(),
		)
		await expect(
			uniqueCount(endOffsets(rowsIn(canvasElement), "roster-row-timestamp")),
		).toBe(1)
	},
})

export const ReducedMotion = meta.story({
	args: { selectedBotId: "cinder" },
	parameters: {
		docs: {
			description: {
				story:
					"The panel under `prefers-reduced-motion: reduce`, which is how the test browser renders every story here. Check that the running avatar settles on a static frame of its pose and the activity dot stops pulsing, that the shell drops its width and row springs to zero duration, and that nothing else changes: the rows keep their selection, their focus ring and their two lines, so the state is still readable without motion.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const row = rowFor(canvasElement, "Cinder")
		await expect(rowButton(row)).toHaveAttribute("aria-current", "page")
		await expect(
			row.querySelector('[data-slot="bot-activity-dot"]'),
		).not.toBeNull()
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Cinder selected, working",
		)

		await userEvent.tab()
		await userEvent.tab()
		const first = rowButton(rowsIn(canvasElement)[0])
		await expect(first).toHaveFocus()
		await expect(first.matches(":focus-visible")).toBe(true)
	},
})

export const Footer = meta.story({
	args: {
		bots: LONG_ROSTER,
		selectedBotId: "beacon-0",
		footer: FOOTER_CONTENT,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The pinned region under the list, given a control by the host — the panel is handed a node and draws it, it knows nothing of what it is. Check that it sits under the last row rather than beside it, that its bottom edge is the bottom edge of the column, and that a roster three times too long for the window scrolls inside the list alone: the region stays exactly where it was and the column itself never scrolls. Pick `NoFooter` for the same list with the slot left out, `FooterWithoutBots` for the slot over an empty roster.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const panel = slotIn(canvasElement, "sidebar-panel")
		const list = slotIn(canvasElement, "sidebar-content")
		const footer = slotIn(canvasElement, "sidebar-footer")

		await expect(
			within(footer).getByRole("button", { name: FOOTER_LABEL }),
		).toBeVisible()
		await expectFooterAtColumnBottom(canvasElement)

		const footerTop = footer.getBoundingClientRect().top
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
		list.scrollTop = list.scrollHeight

		await expect(list.scrollTop).toBeGreaterThan(0)
		await expect(panel.scrollTop).toBe(0)
		await expect(footer.getBoundingClientRect().top).toBeCloseTo(footerTop, 0)
	},
})

export const NoFooter = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same column with the slot left out, which is every other story here. Check that no pinned region is drawn at all — not an empty one, not a reserved strip — and that the list runs all the way to the bottom edge of the column, so a host that wants nothing under its roster pays nothing for the slot. Pick `Footer` for the same list with the slot filled.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "sidebar-footer")).toHaveLength(0)
		await expect(
			bottomOf(slotIn(canvasElement, "sidebar-content")),
		).toBeCloseTo(bottomOf(slotIn(canvasElement, "sidebar-panel")), 0)
	},
})

export const FooterWithoutBots = meta.story({
	args: { bots: [], footer: FOOTER_CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"The slot over a reader who owns no bot yet. Check that the pinned region stays against the bottom edge of the column instead of riding up under the empty copy — the list keeps the space it is not using, so the region reads as part of the column rather than as the end of a short list. Pick `Empty` for the same state without the slot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(rowsIn(canvasElement)).toHaveLength(0)
		await expectFooterAtColumnBottom(canvasElement)
	},
})

export const FooterOnRail = meta.story({
	render: renderShell(false),
	args: { footer: FOOTER_CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"The slot on the icon rail. Check that the pinned region drops its side padding and centres what it holds, exactly as the create button rides down in the header — a rail one avatar wide has no room for padding either side — and that nothing is clipped against either edge of the rail. Pick `Collapsed` for the rail without the slot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const panel = slotIn(canvasElement, "sidebar-panel")
		const rail = railWidth()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)

		const footer = slotIn(canvasElement, "sidebar-footer")
		const style = getComputedStyle(footer)
		await expect(style.paddingLeft).toBe("0px")
		await expect(style.paddingRight).toBe("0px")

		const panelBox = panel.getBoundingClientRect()
		const buttonBox = within(footer)
			.getByRole("button", { name: FOOTER_LABEL })
			.getBoundingClientRect()
		await expect(buttonBox.left).toBeGreaterThanOrEqual(panelBox.left)
		await expect(buttonBox.right).toBeLessThanOrEqual(panelBox.right)
		await expectFooterAtColumnBottom(canvasElement)
	},
})

export const WithUser = meta.story({
	args: { user: READER },
	parameters: {
		docs: {
			description: {
				story:
					"The reader themselves, pinned under the list — the only way into their own settings, so a host that has an account to show always hands one down. Check that the chip opens the region with the picture leading and the name beside it, that it covers the whole row since nothing else is drawn there, and that activating it fires the open event once. Pick `WithUserAndFooter` for the same chip sharing the row.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const footer = slotIn(canvasElement, "sidebar-footer")
		const chip = within(footer).getByRole("button", { name: READER_NAME })

		await expect(chip.getBoundingClientRect().width).toBeCloseTo(
			footerRowWidth(footer),
			0,
		)
		await expectFooterAtColumnBottom(canvasElement)

		await userEvent.click(chip)
		await expect(args.onOpenUserSettings).toHaveBeenCalledTimes(1)
	},
})

export const WithUserAndFooter = meta.story({
	args: { user: READER, footer: FOOTER_CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"The chip beside what the host pinned next to it — the update badge, in the app. Check that the chip comes first and gives way to the control rather than pushing it off the row: the two share one line, the control keeps its size, and the name is what is clipped. Pick `WithUserAndIdleFooter` for the same pair while the control draws nothing.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const footer = slotIn(canvasElement, "sidebar-footer")
		const chip = within(footer)
			.getByRole("button", { name: READER_NAME })
			.getBoundingClientRect()
		const pinned = within(footer)
			.getByRole("button", { name: FOOTER_LABEL })
			.getBoundingClientRect()

		await expect(chip.right).toBeLessThanOrEqual(pinned.left)
		await expect(verticalCentreOf(chip)).toBeCloseTo(
			verticalCentreOf(pinned),
			0,
		)
		await expect(chip.width).toBeLessThan(footerRowWidth(footer))
	},
})

export const WithUserAndIdleFooter = meta.story({
	args: { user: READER, footer: SILENT_FOOTER_CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"The state the app is in nearly all the time: the host pinned a node beside the chip and that node draws nothing, since there is no update to install. Check that the row reads exactly as `WithUser` — the chip covers the whole width, with no gap held open beside it for something that is not there. Pick `WithUserAndFooter` for the moment the control does draw.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const footer = slotIn(canvasElement, "sidebar-footer")
		const chip = within(footer).getByRole("button", { name: READER_NAME })

		await expect(within(footer).getAllByRole("button")).toHaveLength(1)
		await expect(chip.getBoundingClientRect().width).toBeCloseTo(
			footerRowWidth(footer),
			0,
		)
	},
})

export const WithUserOnRail = meta.story({
	render: renderShell(false),
	args: { user: READER, footer: FOOTER_CONTENT },
	parameters: {
		docs: {
			description: {
				story:
					"The chip and the host's control once the panel collapses to its rail, where a row one avatar wide cannot hold both side by side. Check that they stack with the control above the chip — the chip is the row that is always there, so it stays against the bottom edge — that the picture is drawn alone with the name still naming the button, and that neither is clipped against an edge. `UserChip → OnRail` owns how the picture sits inside the chip; this one owns where the chip sits in the region. Pick `FooterOnRail` for the rail without a reader.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const panel = slotIn(canvasElement, "sidebar-panel")
		const rail = railWidth()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)

		const footer = slotIn(canvasElement, "sidebar-footer")
		const chipButton = within(footer).getByRole("button", { name: READER_NAME })
		const pinned = within(footer)
			.getByRole("button", { name: FOOTER_LABEL })
			.getBoundingClientRect()
		const avatar = slotIn(footer, "user-avatar").getBoundingClientRect()

		await expect(pinned.bottom).toBeLessThanOrEqual(avatar.top)
		await expect(chipButton).toHaveAttribute("aria-label", READER_NAME)

		const panelBox = panel.getBoundingClientRect()
		await expect(avatar.left).toBeGreaterThanOrEqual(panelBox.left)
		await expect(avatar.right).toBeLessThanOrEqual(panelBox.right)
		await expectFooterAtColumnBottom(canvasElement)
	},
})

export const DragRegion = meta.story({
	args: { user: READER },
	render: (args: AgentSidebarProps) => (
		<WorkspaceShell
			defaultOpen
			sidebar={<AgentSidebar {...args} data-tauri-drag-region="deep" />}
		>
			{null}
		</WorkspaceShell>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The panel as a frameless desktop window mounts it: the column is what the window is carried by. Check that the attribute lands on the panel itself, so the space between the rows drags the window, and that nothing the reader presses carries it — a row, the create button and the chip are buttons, and a button with no drag region of its own is what stops the drag.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(slotIn(canvasElement, "sidebar")).toHaveAttribute(
			"data-tauri-drag-region",
			"deep",
		)

		const pressable = [
			rowButton(rowsIn(canvasElement)[0]),
			canvas.getByRole("button", { name: "New bot" }),
			canvas.getByRole("button", { name: READER_NAME }),
		]
		for (const target of pressable) {
			await expect(target.tagName).toBe("BUTTON")
			await expect(target).not.toHaveAttribute("data-tauri-drag-region")
		}
	},
})

const WHEEL_TICKS = 5

const MID_TRAVEL_POLL = { interval: 5, timeout: SWIPE_SETTLE - 60 }

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

const swipeOver = async (carousel: HTMLElement, deltaX: number) => {
	for (let tick = 0; tick < WHEEL_TICKS; tick += 1) {
		fireEvent.wheel(carousel, { deltaX: deltaX / WHEEL_TICKS, deltaY: 0 })
		await nextTask()
	}
}

const afterSwipeSettles = () =>
	new Promise((resolve) => setTimeout(resolve, SWIPE_SETTLE + 40))

const swipeAndSettle = async (carousel: HTMLElement, deltaX: number) => {
	await swipeOver(carousel, deltaX)
	await afterSwipeSettles()
}

const carouselIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "space-carousel")

const panelsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "space-panel")

const panelInView = (canvasElement: HTMLElement) => {
	const panel = panelsIn(canvasElement).find(
		(box) => !box.hasAttribute("inert"),
	)
	if (!panel) throw new Error("No space panel is in view")
	return panel
}

const rostersAcross = (spaces: Space[]): Record<string, AgentSidebarBot[]> =>
	Object.fromEntries(
		spaces.map((space, rank) => [
			space.id,
			ROSTER.filter((_, index) => index % spaces.length === rank),
		]),
	)

const leftOf = (node: HTMLElement) => node.getBoundingClientRect().left

const FIVE_SPACES = SPACES.slice(0, 5)

const FIVE_ROSTERS = rostersAcross(FIVE_SPACES)

const LiveSpaces = (args: AgentSidebarProps) => {
	const [selectedSpaceId, setSelectedSpaceId] = useState(args.selectedSpaceId)

	return (
		<WorkspaceShell
			defaultOpen
			sidebar={
				<AgentSidebar
					{...args}
					onSelectSpace={(id) => {
						args.onSelectSpace?.(id)
						setSelectedSpaceId(id)
					}}
					selectedSpaceId={selectedSpaceId}
				/>
			}
		>
			{null}
		</WorkspaceShell>
	)
}

const spaceDotsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "space-dot-button")

const openSpaceMenu = async (trigger: HTMLElement) => {
	fireEvent.pointerDown(trigger, { button: 0 })
	return within(await screen.findByRole("menu", { name: "Spaces" }))
}

export const OneSpace = meta.story({
	args: {
		spaces: [SPACES[0]],
		selectedSpaceId: "perso",
		botsBySpaceId: { perso: ROSTER },
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The state every account opens in: one space, so the header names it and nothing else navigates. Check the switcher sits left of the create button on the same line with the create button's three insets untouched, that no dot strip is drawn in the pinned region, that the row holds exactly one panel filling the list area, and that a horizontal swipe over it reports nothing and does not move the row — there is nowhere to go, and a gesture that silently does nothing is better than one that rubber-bands. Pick `FiveSpaces` for the navigating case, `SpaceMidTravel` for the row under the gesture.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const switcher = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})
		const create = canvas.getByRole("button", { name: "New bot" })
		const header = slotIn(canvasElement, "sidebar-header")

		await expect(switcher.getBoundingClientRect().right).toBeLessThanOrEqual(
			create.getBoundingClientRect().left,
		)

		const headerBox = header.getBoundingClientRect()
		const createBox = create.getBoundingClientRect()
		const inset = Math.round(headerBox.right - createBox.right)
		await expect(Math.round(createBox.top - headerBox.top)).toBe(inset)
		await expect(Math.round(headerBox.bottom - createBox.bottom)).toBe(inset)

		await expect(spaceDotsIn(canvasElement)).toHaveLength(0)

		const carousel = carouselIn(canvasElement)
		const panels = panelsIn(canvasElement)
		await expect(panels).toHaveLength(1)
		await expect(panels[0].clientWidth).toBe(carousel.clientWidth)

		const resting = leftOf(panels[0])
		await swipeAndSettle(carousel, 240)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		await expect(leftOf(panels[0])).toBe(resting)
	},
})

export const FiveSpaces = meta.story({
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "vocca",
		botsBySpaceId: FIVE_ROSTERS,
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Five spaces with the second one open, each with its own roster — the everyday case, and the one that exercises all four ways in. Check the dot strip is centred in the pinned region with only the open dot filled and full size, that pressing a dot reports its id, that one horizontal swipe reaches exactly one neighbour rather than one space per wheel tick, and that Cmd and a digit reaches a space directly while a digit past the last one is left alone. Pick `NineSpaces` for the strip at its widest, `SpacesOnRail` for the same panel collapsed, `SpaceMidTravel` for the row under the gesture, `SpacesWithoutRosters` for the same spaces before a host hands its rosters over.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("button", { name: "Change space, Vocca open" }),
		).toBeVisible()

		const dots = spaceDotsIn(canvasElement)
		await expect(dots).toHaveLength(5)
		await expect(dots[1]).toHaveAttribute("aria-current", "true")
		await expect(dots[0]).toHaveAttribute("aria-current", "false")

		const strip = slotIn(canvasElement, "space-dots").getBoundingClientRect()
		const region = slotIn(
			canvasElement,
			"sidebar-footer",
		).getBoundingClientRect()
		await expect(verticalCentreOf(strip)).toBeLessThan(verticalCentreOf(region))
		await expect(Math.round(strip.left - region.left)).toBe(
			Math.round(region.right - strip.right),
		)

		await userEvent.click(dots[3])
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("veille")

		const carousel = carouselIn(canvasElement)
		await swipeAndSettle(carousel, 240)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("atelier")

		await swipeAndSettle(carousel, -240)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(3)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("perso")

		await userEvent.keyboard("{Meta>}5{/Meta}")
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("archives")

		await userEvent.keyboard("{Meta>}7{/Meta}")
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(4)
	},
})

export const NineSpaces = meta.story({
	args: {
		spaces: SPACES,
		selectedSpaceId: "perso",
		botsBySpaceId: rostersAcross(SPACES),
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Nine spaces each with its own roster, which is as many as the Cmd+digit chords can name and the widest the dot strip ever gets. Check every dot stays inside the pinned region rather than clipping against its edges, that the row draws the space in view and the one waiting off each edge and no more — a reader can never see a third panel, so drawing nine rosters would be paint the window throws away, and a panel that leaves the row is remembered where it was scrolled — that the menu lists all nine with `⌘1` through `⌘9`, that Cmd+9 reaches the last one, and that a swipe back while the first space is open reports nothing and holds the row still. Pick `FiveSpaces` for the everyday width, `OneSpace` for the row that cannot travel.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const dots = spaceDotsIn(canvasElement)
		await expect(dots).toHaveLength(9)

		const region = slotIn(
			canvasElement,
			"sidebar-footer",
		).getBoundingClientRect()
		for (const dot of dots) {
			const box = dot.getBoundingClientRect()
			await expect(box.left).toBeGreaterThanOrEqual(region.left)
			await expect(box.right).toBeLessThanOrEqual(region.right)
		}

		const menu = await openSpaceMenu(
			canvas.getByRole("button", { name: /^Change space/ }),
		)
		await expect(menu.getAllByRole("menuitemradio")).toHaveLength(9)
		await expect(menu.getByText("⌘9")).toBeInTheDocument()
		await userEvent.keyboard("{Escape}")

		await userEvent.keyboard("{Meta>}9{/Meta}")
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("essais")

		const carousel = carouselIn(canvasElement)
		const panels = panelsIn(canvasElement)
		await expect(panels).toHaveLength(2)
		const viewport = carousel.getBoundingClientRect()
		await expect(leftOf(panels[0])).toBeCloseTo(viewport.left, 0)
		await expect(leftOf(panels[1])).toBeCloseTo(viewport.right, 0)

		await swipeAndSettle(carousel, -240)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(leftOf(panels[0])).toBeCloseTo(viewport.left, 0)
	},
})

export const SpacesOnRail = meta.story({
	render: renderShell(false),
	args: {
		spaces: SPACES.slice(0, 5),
		selectedSpaceId: "vocca",
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same navigation once the panel is on its icon rail. Check the switcher keeps the open space's tint as a dot and drops its name, that it and the create button sit side by side without clipping against either edge of the rail, and that the dot strip is gone — a rail is too narrow to hold nine targets, and the tint on the switcher already says where the reader is. Pick `FiveSpaces` for the expanded panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = slotIn(canvasElement, "sidebar-panel")
		const rail = railWidth()
		await waitFor(async () => {
			await expect(panel.getBoundingClientRect().width).toBeCloseTo(rail, 0)
		}, FRAME_POLL)

		const switcher = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})
		await expect(
			slotIn(switcher, "space-switcher-name").checkVisibility(),
		).toBe(false)
		await expect(slotIn(switcher, "space-dot")).toBeInTheDocument()

		const panelBox = panel.getBoundingClientRect()
		for (const control of [
			switcher,
			canvas.getByRole("button", { name: "New bot" }),
		]) {
			const box = control.getBoundingClientRect()
			await expect(box.left).toBeGreaterThanOrEqual(panelBox.left)
			await expect(box.right).toBeLessThanOrEqual(panelBox.right)
		}

		await expect(
			slotsIn(canvasElement, "space-dots")[0]?.checkVisibility(),
		).toBe(false)
	},
})

export const LiveSpaceSelection = meta.story({
	render: (args) => <LiveSpaces {...args} />,
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "perso",
		botsBySpaceId: FIVE_ROSTERS,
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The panel wired to a host that actually moves its selection, which is the only way the gesture is honest: crossing half a panel changes `selectedSpaceId`, so every callback the panel was handed is a new function while the trackpad is still coasting. Check one physical swipe moves exactly one space and never two — the drag a gesture accumulates has to outlive the re-render its own commit causes — that the row comes to rest on the space that arrived rather than between two, that the next swipe after the wheel goes quiet moves again, and that a rank chord still reports once after all those re-renders rather than once per listener left behind. Pick `FiveSpaces` for the same navigation against a fixed selection, `SpaceMidTravel` for the row under the gesture.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const carousel = carouselIn(canvasElement)

		await swipeAndSettle(carousel, 240)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(
			canvas.getByRole("button", { name: "Change space, Vocca open" }),
		).toBeVisible()

		await swipeAndSettle(carousel, 240)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
		await expect(
			canvas.getByRole("button", { name: "Change space, Atelier open" }),
		).toBeVisible()

		await waitFor(async () => {
			await expect(leftOf(panelInView(canvasElement))).toBeCloseTo(
				carousel.getBoundingClientRect().left,
				0,
			)
		}, FRAME_POLL)

		await userEvent.keyboard("{Meta>}5{/Meta}")
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(3)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("archives")

		await waitFor(async () => {
			await expect(leftOf(panelInView(canvasElement))).toBeCloseTo(
				carousel.getBoundingClientRect().left,
				0,
			)
		}, FRAME_POLL)
	},
})

export const SpaceMidTravel = meta.story({
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "vocca",
		botsBySpaceId: FIVE_ROSTERS,
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The row caught halfway between two spaces, which is the whole point of drawing every roster in one line: the space being left travels out one side while the space arriving travels in the other, by exactly as much as the fingers have moved. Check a gesture short of half a panel leaves the row visibly displaced while it lasts, then settles back on the space it started from and reports nothing; that the space changes the moment the row crosses half a panel, under the fingers rather than a beat after they lift, so the dot strip and the header name answer during the swipe; that the rest of that gesture is spent, so the momentum a trackpad coasts on cannot walk from the first space to the last; that the pinned region above and below — the space name, the create button, the dot strip and the reader's chip — never moves by a pixel while the row does, because the window controls share that top line; and that each panel is its own scrolling box, so a reader coming back to a space finds it where they left it. Pick `LiveSpaceSelection` for the same gesture against a host that moves its selection.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const carousel = carouselIn(canvasElement)
		const panels = panelsIn(canvasElement)
		await expect(panels).toHaveLength(3)
		for (const panel of panels) {
			await expect(getComputedStyle(panel).overflowY).toBe("auto")
		}

		const width = carousel.clientWidth
		const viewport = carousel.getBoundingClientRect()
		const still = [
			leftOf(slotIn(canvasElement, "space-switcher-name")),
			leftOf(slotIn(canvasElement, "space-dots")),
		]

		await swipeOver(carousel, width * 0.3)
		await waitFor(async () => {
			await expect(leftOf(panels[1])).toBeLessThan(viewport.left - 1)
		}, MID_TRAVEL_POLL)
		await expect(leftOf(panels[2])).toBeLessThan(viewport.right)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		await expect([
			leftOf(slotIn(canvasElement, "space-switcher-name")),
			leftOf(slotIn(canvasElement, "space-dots")),
		]).toEqual(still)

		await afterSwipeSettles()
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		await waitFor(async () => {
			await expect(leftOf(panels[1])).toBeCloseTo(viewport.left, 0)
		}, FRAME_POLL)

		await swipeOver(carousel, width * 0.7)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("atelier")

		await swipeOver(carousel, width * 3)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)

		await afterSwipeSettles()
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
	},
})

export const SpaceSwitchingOff = meta.story({
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "vocca",
		botsBySpaceId: FIVE_ROSTERS,
		isSpaceSwitchingEnabled: false,
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same panel with space switching turned off, which is how a host holds the reader still while a dialog or a running turn owns the screen. Check a horizontal swipe over the row neither moves it nor reports anything, that the meta-digit chord reports nothing and is left unprevented so whatever else the app binds to it still hears it, and that the dot strip and the switcher menu keep working — a deliberate press is never the thing being guarded against. Pick `FiveSpaces` for the same panel with switching on.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const carousel = carouselIn(canvasElement)
		const panels = panelsIn(canvasElement)
		const resting = leftOf(panels[1])

		await swipeAndSettle(carousel, 240)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		await expect(leftOf(panels[1])).toBe(resting)

		let prevented = true
		const watch = (event: KeyboardEvent) => {
			prevented = event.defaultPrevented
		}
		window.addEventListener("keydown", watch)
		await userEvent.keyboard("{Meta>}4{/Meta}")
		window.removeEventListener("keydown", watch)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		await expect(prevented).toBe(false)

		await userEvent.click(spaceDotsIn(canvasElement)[3])
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("veille")
	},
})

export const SpacesWithoutRosters = meta.story({
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "vocca",
		user: READER,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Five spaces and no roster handed over per space, which is every host that has not wired `botsBySpaceId` yet. Check the row is not drawn at all — one list, scrolling in the content region as it did before the carousel existed — that a horizontal swipe over it reports nothing, because dragging towards panels a host never filled would be a promise the sidebar cannot keep, and that the dots and the meta-digit chord still change space. Pick `FiveSpaces` for the same five spaces once their rosters arrive.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotsIn(canvasElement, "space-carousel")).toHaveLength(0)
		await expect(rowsIn(canvasElement)).toHaveLength(ROSTER.length)

		const content = slotIn(canvasElement, "sidebar-content")
		await expect(getComputedStyle(content).overflowY).toBe("auto")

		await swipeAndSettle(content, 240)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()

		await userEvent.click(spaceDotsIn(canvasElement)[3])
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("veille")

		await userEvent.keyboard("{Meta>}1{/Meta}")
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("perso")

		await expect(
			canvas.getByRole("button", { name: "Change space, Vocca open" }),
		).toBeVisible()
	},
})

export const SpaceScrollMemory = meta.story({
	render: (args) => <LiveSpaces {...args} />,
	globals: { viewport: { value: "short" } },
	args: {
		spaces: FIVE_SPACES,
		selectedSpaceId: "perso",
		botsBySpaceId: Object.fromEntries(
			FIVE_SPACES.map((space) => [space.id, ROSTER]),
		),
		user: READER,
	},
	parameters: {
		viewport: { options: SHORT_VIEWPORT },
		docs: {
			description: {
				story:
					"A window too short to show a roster whole, which is where a space has to remember where its reader had got to. Only the space in view and the one waiting off each edge are drawn, so a space walked two along leaves the row entirely — check that scrolling one space down, walking two spaces on and walking back finds it exactly where it was left rather than back at the top, and that a space arriving starts at its own top rather than inheriting the scroll of the one before it. Pick `SpaceMidTravel` for the gesture itself, `NineSpaces` for the row at its widest.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const carousel = carouselIn(canvasElement)
		const left = panelInView(canvasElement)
		await expect(left.scrollHeight).toBeGreaterThan(left.clientHeight)

		left.scrollTop = 90
		await expect(left.scrollTop).toBe(90)

		await swipeAndSettle(carousel, 240)
		await expect(panelInView(canvasElement).scrollTop).toBe(0)

		await swipeAndSettle(carousel, 240)
		await expect(panelsIn(canvasElement)).toHaveLength(3)

		await swipeAndSettle(carousel, -240)
		await swipeAndSettle(carousel, -240)
		await expect(panelInView(canvasElement).scrollTop).toBe(90)
	},
})
