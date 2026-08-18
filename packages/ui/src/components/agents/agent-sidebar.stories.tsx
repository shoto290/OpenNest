import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	AgentSidebar,
	type AgentSidebarBot,
	type AgentSidebarProps,
} from "@workspace/ui/components/agents/agent-sidebar"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const LAST_MESSAGE =
	"Renamed the transport module and updated every caller, so the second turn resumes the first one cleanly again."

const SINGLE_LINE_HEIGHT = 20

const FRAME_POLL = { interval: 10 }

const NARROW_VIEWPORT = {
	narrow: { name: "Narrow", styles: { width: "800px", height: "900px" } },
}

const ROSTER: AgentSidebarBot[] = [
	{
		id: "atlas",
		identity: "curious",
		name: "Atlas",
		title: "Research",
		animal: "owl",
		lastMessage: "Pulled the three papers and summarised each one for you.",
		timestamp: "09:24",
	},
	{
		id: "beacon",
		identity: "happy",
		name: "Beacon",
		animal: "cat",
		lastMessage: LAST_MESSAGE,
		timestamp: "09:18",
	},
	{
		id: "cinder",
		identity: "proud",
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
		identity: "bored",
		name: "Dune",
		animal: "bear",
		lastMessage: "Nothing since the migration landed.",
		timestamp: "Mon",
	},
	{
		id: "ember",
		identity: "shy",
		name: "Ember",
		title: "Review",
		animal: "rabbit",
		lastMessage: "Left four comments on the transport rename.",
		timestamp: "Mon",
	},
	{
		id: "flint",
		identity: "playful",
		name: "Flint",
		animal: "mouse",
		lastMessage: "Ran the suite twice, both green.",
		timestamp: "Sun",
	},
	{
		id: "grove",
		identity: "idle",
		name: "Grove",
		title: "Docs",
		animal: "koala",
		lastMessage: "Rewrote the setup page around the new command.",
		timestamp: "Sun",
	},
	{
		id: "harbor",
		identity: "sleeping",
		name: "Harbor",
		animal: "chick",
		lastMessage: "Waiting on the credentials you promised.",
		timestamp: "Sat",
	},
	{
		id: "iris",
		identity: "happy",
		name: "Iris",
		title: "Design",
		animal: "cat",
		lastMessage: "Swapped the rail avatars for the new poses.",
		timestamp: "Sat",
	},
	{
		id: "juno",
		identity: "curious",
		name: "Juno",
		animal: "owl",
		lastMessage: "Summarised yesterday's session into six bullets.",
		timestamp: "Fri",
	},
	{
		id: "kite",
		identity: "proud",
		name: "Kite",
		title: "Ops",
		animal: "dog",
		lastMessage: "Rotated the signing key and restarted the runner.",
		timestamp: "Fri",
	},
	{
		id: "lumen",
		identity: "sleeping",
		name: "Lumen",
		animal: "bear",
		lastMessage: "Nothing yet.",
		timestamp: "Thu",
	},
]

const withoutTitle = (bot: AgentSidebarBot): AgentSidebarBot => ({
	...bot,
	title: undefined,
})

const rowsIn = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="sidebar-menu-item"]',
		),
	)

const slotIn = (row: HTMLElement, slot: string) => {
	const node = row.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
	if (!node) throw new Error(`Roster row is missing its ${slot}`)
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

/** Where a slot starts inside its own row, so every row can be compared to
 * every other one whatever its content is. */
const startOffsets = (rows: HTMLElement[], slot: string) =>
	rows.map((row) => {
		const rowBox = row.getBoundingClientRect()
		const box = slotIn(row, slot).getBoundingClientRect()
		return `${Math.round(box.left - rowBox.left)}/${Math.round(box.top - rowBox.top)}`
	})

/** The same for a slot measured from the trailing edge of its row. */
const endOffsets = (rows: HTMLElement[], slot: string) =>
	rows.map((row) => {
		const rowBox = row.getBoundingClientRect()
		const box = slotIn(row, slot).getBoundingClientRect()
		return `${Math.round(rowBox.right - box.right)}/${Math.round(box.top - rowBox.top)}`
	})

const uniqueCount = (values: string[]) => new Set(values).size

const rowHeights = (rows: HTMLElement[]) =>
	rows.map((row) => Math.round(row.getBoundingClientRect().height))

const isClipped = (node: HTMLElement) => node.scrollWidth > node.clientWidth

/** The highlight behind a menu item, which belongs to the highlighted item and
 * to no other — it is drawn where the pointer is rather than travelling there. */
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
	title: "AI/AgentSidebar",
	component: AgentSidebar,
	render: renderShell(true),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The roster panel of an agent app, mounted whole: the animated sidebar shell around every bot the reader owns. It carries no chrome of its own beyond the create button — the pinned region above the list clears the window controls, and the open state comes from the `WorkspaceShell` above it, so Cmd/Ctrl+B and whatever trigger the page mounts drive the panel and the column beside it together. A row is the bot avatar, its name, an optional title badge and the time of its last message, over one clipped line of that message. A bot at rest holds the pose it was given in its settings, drawn as a still frame; a bot that is running holds its work pose, animates, and wears an activity dot. Edit and delete live behind a right-click on the row — there is no actions button to reveal — and selection and running state are props, so a host maps its store onto `bots` and `selectedBotId` and nothing here polls the transport.",
			},
		},
	},
	args: {
		bots: ROSTER,
		selectedBotId: "beacon",
		onSelectBot: fn(),
		onCreateBot: fn(),
		onEditBot: fn(),
		onDeleteBot: fn(),
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
					"A dozen bots, some with a title badge and some without, each holding the identity pose it was given. Check that the avatars, the names and the timestamps each hold one column down the whole list — a row without a badge must not slide its name or its preview out of line with the row above it — and that every row is the same height whatever it carries. The list is walked with Tab and a row is its own only stop, since the actions carry no button: the create button first, then one stop per row, and Enter on a row reports the selection rather than taking it. Pick `LongContent` for the same list under names and messages that do not fit, `RowContextMenu` for the actions behind a row, `Identities` for the poses at rest.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const rows = rowsIn(canvasElement)
		await expect(rows).toHaveLength(ROSTER.length)

		await expect(uniqueCount(startOffsets(rows, "roster-row-name"))).toBe(1)
		await expect(uniqueCount(startOffsets(rows, "roster-row-preview"))).toBe(1)
		await expect(uniqueCount(endOffsets(rows, "roster-row-timestamp"))).toBe(1)
		await expect(uniqueCount(startOffsets(rows, "roster-row-timestamp"))).toBe(
			1,
		)
		await expect(uniqueCount(rowHeights(rows).map(String))).toBe(1)

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
		await expect(uniqueCount(startOffsets(rows, "roster-row-name"))).toBe(1)
		await expect(uniqueCount(startOffsets(rows, "roster-row-preview"))).toBe(1)
		await expect(uniqueCount(rowHeights(rows).map(String))).toBe(1)
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

export const Identities = meta.story({
	args: {
		bots: [
			{ ...ROSTER[6], identity: "idle" },
			{ ...ROSTER[1], identity: "happy" },
			{ ...ROSTER[0], identity: "curious" },
			{ ...ROSTER[2], identity: "proud", status: "idle" },
			{ ...ROSTER[4], identity: "shy" },
			{ ...ROSTER[5], identity: "playful" },
			{ ...ROSTER[3], identity: "bored" },
			{ ...ROSTER[7], identity: "sleeping" },
		],
		selectedBotId: "grove",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The eight poses a bot can be given in its settings, one per row, with nothing running. Every avatar here is a still frame: an idle bot is drawn once and left alone, so a panel of bots that are doing nothing is a panel that does not move — and the one row that does move is doing work. Check that each row wears the pose its bot chose rather than a shared resting one, that no row carries an activity dot, and that the panel does not report itself busy. The test browser renders every story with reduced motion, so the stillness is read here rather than measured; open the story in Storybook beside `Working` to see the difference. Pick `Working` for the state that animates.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const rows = rowsIn(canvasElement)
		const poses = [
			"idle",
			"happy",
			"curious",
			"proud",
			"shy",
			"playful",
			"bored",
			"sleeping",
		]

		await expect(rows).toHaveLength(poses.length)
		for (const [index, pose] of poses.entries()) {
			await expect(
				within(rows[index]).getByRole("img", {
					name: new RegExp(`${pose}$`),
				}),
			).toBeVisible()
		}

		await expect(
			canvasElement.querySelectorAll('[data-slot="roster-row-activity"]'),
		).toHaveLength(0)
		await expect(
			canvas.getByRole("complementary", { name: "Conversations" }),
		).toHaveAttribute("aria-busy", "false")
		await expect(uniqueCount(rowHeights(rows).map(String))).toBe(1)
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
					"Four bots running at once and one at rest. Check that each running row holds its own work pose in the avatar and wears the activity dot, that the verb takes over the message line while it runs, and that the row at rest wears neither and keeps its own identity pose instead. This is the only state that moves: a running avatar animates, and every other row in the panel is a still frame, so motion in the list means work in the list. The panel reports itself busy while any row runs, and the announcement stays outside it: a live region nested inside an `aria-busy` landmark is swallowed and never reaches a screen reader. Pick `Identities` for the poses that hold still, `PermissionPending` for the one running state that looks like rest.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const panel = canvas.getByRole("complementary", { name: "Conversations" })
		await expect(panel).toHaveAttribute("aria-busy", "true")

		const running = rowFor(canvasElement, "Cinder")
		await expect(
			running.querySelector('[data-slot="roster-row-activity"]'),
		).not.toBeNull()
		await expect(slotIn(running, "roster-row-preview")).toHaveTextContent(
			"writing…",
		)
		await expect(
			within(running).getByRole("img", { name: /writing$/ }),
		).toBeVisible()

		const resting = rowFor(canvasElement, "Ember")
		await expect(
			resting.querySelector('[data-slot="roster-row-activity"]'),
		).toBeNull()
		await expect(
			within(resting).getByRole("img", { name: /shy$/ }),
		).toBeVisible()

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

		await expect(
			uniqueCount(rowHeights(rowsIn(canvasElement)).map(String)),
		).toBe(1)
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
					'A turn blocked on a permission prompt, which a host maps to `status="working"` with `pose="waiting"` — the turn is waiting on the reader, not over. Check that the avatar holds its listening pose rather than the identity pose it wears at rest, that it is still animating, and that the dot is there: the panel reports itself busy and the announcement says the bot is waiting, so a row that looked idle here would contradict both at once. Pick `Working` for the poses that cannot be mistaken for rest, `Identities` for the still frame this state must not fall back to.',
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const row = rowFor(canvasElement, "Atlas")
		await expect(
			within(row).getByRole("img", { name: /listening$/ }),
		).toBeVisible()
		await expect(
			within(row).queryByRole("img", { name: /curious$/ }),
		).toBeNull()
		await expect(slotIn(row, "roster-row-preview")).toHaveTextContent(
			"waiting…",
		)
		await expect(
			row.querySelector('[data-slot="roster-row-activity"]'),
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

		await expect(uniqueCount(startOffsets(rows, "roster-row-name"))).toBe(1)
		await expect(uniqueCount(endOffsets(rows, "roster-row-timestamp"))).toBe(1)
		await expect(uniqueCount(rowHeights(rows).map(String))).toBe(1)
	},
})

export const RowContextMenu = meta.story({
	args: { bots: ROSTER.slice(0, 4), selectedBotId: "beacon" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The actions behind a row, on the third one. There is no button to find: the row itself is the trigger, so the columns never move to make room for a control and nothing appears on hover. A pointer right-clicks the row; a keyboard reaches the same menu with the Menu key or Shift+F10 on the focused row, which is what this story presses. Check that the menu offers edit and delete with delete reading as destructive, that the arrow keys walk them, and that Escape closes the menu and puts focus back on the row it belongs to rather than dropping it on the page. The highlight is drawn on the item under the pointer and nowhere else: it does not slide across from the item before it, which is a deliberate local deviation from the registry component's gliding row — travel under a pointer reads as lag. The row says it carries a menu through `aria-haspopup`, and says whether it is open. The menu is left open here so the panel can be read with it up. Delete carries `--destructive`, which does not clear AA against a light popup at this size — the same open question `Primitives/Button` already carries on its own destructive variant, and a token decision rather than a decision this menu can make on its own.",
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
		const edit = within(menu).getByRole("menuitem", { name: "Edit" })
		const remove = within(menu).getByRole("menuitem", { name: "Delete" })
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await waitFor(async () => {
			await expect(edit).toHaveFocus()
		}, FRAME_POLL)
		await expect(highlightIn(edit)).not.toBeNull()
		await expect(getComputedStyle(remove).color).not.toBe(
			getComputedStyle(edit).color,
		)

		await userEvent.keyboard("{ArrowDown}")
		await expect(remove).toHaveFocus()
		await expect(highlightIn(remove)).not.toBeNull()
		await expect(highlightIn(edit)).toBeNull()
		await userEvent.keyboard("{Escape}")
		await waitFor(async () => {
			await expect(overlay.queryByRole("menu")).toBeNull()
		}, FRAME_POLL)
		await expect(trigger).toHaveFocus()

		await userEvent.pointer({ keys: "[MouseRight]", target: trigger })
		await userEvent.click(
			await overlay.findByRole("menuitem", { name: "Edit" }),
		)
		await expect(args.onEditBot).toHaveBeenCalledWith("cinder")

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
			.getByRole("img", { name: /curious$/ })
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
			row.querySelector('[data-slot="roster-row-activity"]'),
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
