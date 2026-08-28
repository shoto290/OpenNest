import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { settled, slotsIn } from "@workspace/storybook/story-utils"
import type { BotBadge } from "@workspace/ui/components/badge"
import type { Space } from "@workspace/ui/components/space"
import {
	SpaceDots,
	SpaceSwitcher,
	type SpaceSwitcherProps,
} from "@workspace/ui/components/space-switcher"

const SPACES: Space[] = [
	{ id: "perso", name: "Perso", colour: "blue" },
	{ id: "vocca", name: "Vocca", colour: "green" },
	{ id: "atelier", name: "Atelier", colour: "pink" },
	{ id: "veille", name: "Veille", colour: "yellow" },
	{ id: "archives", name: "Archives", colour: "purple" },
]

const BADGES: Record<string, BotBadge> = {
	perso: "done",
	atelier: "failed",
	veille: "attention",
}

const LONG_SPACES: Space[] = [
	{
		id: "perso",
		name: "Everything I have not filed anywhere else yet",
		colour: "blue",
	},
	{ id: "vocca", name: "Vocca", colour: "green" },
]

const MANY_SPACES: Space[] = [
	...SPACES,
	{ id: "lecture", name: "Lecture", colour: "red" },
	{ id: "cuisine", name: "Cuisine", colour: "orange" },
	{ id: "musique", name: "Musique", colour: "cyan" },
	{ id: "jardin", name: "Jardin", colour: "green" },
]

const HEADER_LINE =
	"flex h-12 w-64 items-center justify-end rounded-xl border border-border border-dashed px-2.5"

const RAIL_LINE =
	"group/sidebar flex h-12 w-12 items-center justify-center rounded-xl border border-border border-dashed"

const NARROW_STRIP = "w-24 rounded-xl border border-border border-dashed py-2"

const POINTER = {
	button: 0,
	isPrimary: true,
	pointerId: 1,
	pointerType: "mouse",
}

const dotsIn = (root: HTMLElement) => slotsIn(root, "space-dot-button")

const dotNames = (root: HTMLElement) =>
	dotsIn(root).map((dot) => dot.getAttribute("aria-label"))

const RESTING_NAMES = SPACES.map((space) => `Open ${space.name}`)

const centreOf = (node: Element) => {
	const box = node.getBoundingClientRect()
	return {
		clientX: Math.round(box.left + box.width / 2),
		clientY: Math.round(box.top + box.height / 2),
	}
}

const liftBy = (handle: HTMLElement, byX: number) => {
	const from = centreOf(handle)
	fireEvent.pointerDown(handle, { ...POINTER, ...from })
	fireEvent.pointerMove(handle, {
		...POINTER,
		clientX: from.clientX + byX,
		clientY: from.clientY,
	})
	return from
}

const moveOver = (handle: HTMLElement, onto: Element) => {
	fireEvent.pointerMove(handle, { ...POINTER, ...centreOf(onto) })
}

const dropOver = (handle: HTMLElement, onto: Element) => {
	fireEvent.pointerUp(handle, { ...POINTER, ...centreOf(onto) })
	fireEvent.click(handle)
}

const insertionOn = (root: HTMLElement) =>
	slotsIn(root, "space-insertion")[0]?.parentElement

const tintVisibleIn = (trigger: HTMLElement) =>
	slotsIn(trigger, "space-dot")[0]?.checkVisibility()

const openMenu = async (trigger: HTMLElement) => {
	fireEvent.pointerDown(trigger, { button: 0 })
	const menu = await settled(await screen.findByRole("menu"))
	await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
	return menu
}

const SwitcherLine = (props: SpaceSwitcherProps) => (
	<div className={HEADER_LINE}>
		<SpaceSwitcher {...props} />
	</div>
)

const SwitcherRail = (props: SpaceSwitcherProps) => (
	<div className={RAIL_LINE} data-state="collapsed">
		<SpaceSwitcher {...props} />
	</div>
)

type LiveSwitcherProps = {
	spaces: Space[]
	badgesBySpaceId?: Record<string, BotBadge>
	onReorderSpaces?: (ids: string[]) => void
}

const LiveSwitcher = ({
	spaces,
	badgesBySpaceId,
	onReorderSpaces,
}: LiveSwitcherProps) => {
	const [order, setOrder] = useState(spaces)
	const [selectedSpaceId, setSelectedSpaceId] = useState(spaces[0].id)

	const reorder = (ids: string[]) => {
		onReorderSpaces?.(ids)
		setOrder((held) =>
			[...held].sort(
				(one, other) => ids.indexOf(one.id) - ids.indexOf(other.id),
			),
		)
	}

	return (
		<div className="flex w-64 flex-col gap-4">
			<SwitcherLine
				badgesBySpaceId={badgesBySpaceId}
				onReorderSpaces={reorder}
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={order}
			/>
			<SpaceDots
				badgesBySpaceId={badgesBySpaceId}
				onReorderSpaces={reorder}
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={order}
			/>
		</div>
	)
}

const badgeOn = (root: HTMLElement) =>
	slotsIn(root, "space-switcher-badge")[0]?.dataset.badge

const middleOf = (element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	return box.top + box.height / 2
}

const dotBadges = (root: HTMLElement) =>
	slotsIn(root, "space-dot-button").map(
		(button) => slotsIn(button, "space-dot")[0]?.dataset.badge,
	)

const meta = preview.meta({
	title: "Navigation/SpaceSwitcher",
	component: SpaceSwitcher,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The control that says which space a reader is in and moves them to another one. On an open panel it is a ghost button carrying the space's name alone, sized to sit on a header line beside a trailing icon button; on the icon rail the name goes and the space's tint takes its place as a dot, which is all a rail has room for. Pressing it opens a single-choice menu: every space with its tint and its rank as a Cmd shortcut hint, then an item to create one, then an item to open the space settings. `SpaceDots` is its companion for a pinned strip — one dot per space, the open one filled with its tint and larger, the rest muted and smaller, so the reader knows how many spaces exist and where they stand without opening anything. Both take the same props, so a host maps its store onto `spaces` and `selectedSpaceId` once and hands the pair the same callbacks — including `onReorderSpaces`, since the order is the reader's to set: a dot is dragged to the place its space should hold, and the menu's `Move up` and `Move down` do the same move without a pointer. That order is not decoration — it is which space each `⌘1`…`⌘9` reaches and the order a swipe walks — so it is reported whole, as the full list of ids, and never applied here. A single space still shows the button, since creating a second one lives in its menu, but draws no dots — there is nothing to count. Reach for this at the top of a sidebar; `AppSidebar` mounts both and adds the swipe and the Cmd+digit chords that go with them.",
			},
		},
	},
	args: {
		spaces: SPACES,
		selectedSpaceId: "vocca",
		onSelectSpace: fn(),
		onCreateSpace: fn(),
		onOpenSpaceSettings: fn(),
		onReorderSpaces: fn(),
	},
	render: (args) => <SwitcherLine {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Five spaces with the second one open, on the header line it was sized for. Check the button reads as the space's name and nothing else — no dot beside it, since the header already says where the reader is and the tint would only compete with the name — that the name sits flush with the line's leading inset while the trailing icon slot keeps its own, and that the button is one Tab stop announcing the open space rather than the word `button`. Pick `Collapsed` for the rail, where the tint comes back as the only mark, `Open` for the menu it opens, `SingleSpace` for a reader who has never made a second one.",
			},
		},
	},
	play: async ({ canvas }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})

		await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(within(trigger).getByText("Vocca")).toBeVisible()
		await expect(tintVisibleIn(trigger)).toBe(false)
	},
})

export const Collapsed = meta.story({
	render: (args) => <SwitcherRail {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same button once the sidebar is on its icon rail, where the name cannot fit. Check the name is gone and the open space's tint is drawn in its place as the only mark left, that the button still announces the open space so a screen reader loses nothing, and that it still opens the same menu. Pick `Default` for the open panel, where the name carries it alone.",
			},
		},
	},
	play: async ({ canvas }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})

		await expect(
			slotsIn(trigger, "space-switcher-name")[0]?.checkVisibility(),
		).toBe(false)
		await expect(tintVisibleIn(trigger)).toBe(true)
	},
})

export const Open = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The menu the press opens, which is the only place a space is chosen, created, or configured. Check the spaces are a single-choice group — one mark, on the open one, and arrows walk the whole list — that each row carries its tint and its rank as `⌘1`…`⌘9`, and that the two items under the separator read as verbs rather than as a sixth space. Choosing a row reports the id and closes; the settings item only reports, since the dialog belongs to the host. Pick `Default` for the resting button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const menu = await openMenu(
			canvas.getByRole("button", { name: "Change space, Vocca open" }),
		)

		const spaces = within(menu).getAllByRole("menuitemradio")
		await expect(spaces).toHaveLength(SPACES.length)
		await expect(spaces[1]).toHaveAttribute("aria-checked", "true")
		await expect(spaces[0]).toHaveAttribute("aria-checked", "false")
		await expect(within(menu).getByText("⌘1")).toBeInTheDocument()
		await expect(within(menu).getByText("⌘5")).toBeInTheDocument()

		await userEvent.click(within(menu).getByRole("menuitem", { name: /^New/ }))
		await expect(args.onCreateSpace).toHaveBeenCalled()

		await openMenu(canvas.getByRole("button", { name: /^Change space/ }))
		await userEvent.click(screen.getAllByRole("menuitemradio")[3])
		await expect(args.onSelectSpace).toHaveBeenCalledWith("veille")
	},
})

export const Keyboard = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same menu reached without a pointer, which is the path a press-to-open trigger usually forgets. Check Enter on the button opens the menu and puts focus on its first row, arrows walk it, Enter reports the space under focus, and Escape closes the menu and hands focus back to the button rather than to the page.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		const menu = await settled(await screen.findByRole("menu"))
		await waitFor(() =>
			expect(within(menu).getAllByRole("menuitemradio")[0]).toHaveFocus(),
		)

		await userEvent.keyboard("{ArrowDown}{Enter}")
		await expect(args.onSelectSpace).toHaveBeenCalledWith("vocca")

		await openMenu(trigger)
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await expect(trigger).toHaveFocus()
	},
})

export const SingleSpace = meta.story({
	args: { spaces: [SPACES[0]], selectedSpaceId: "perso" },
	render: (args) => <LiveSwitcher spaces={args.spaces} />,
	parameters: {
		docs: {
			description: {
				story:
					"A reader who has only ever had one space — the state every account opens in. Check the button still draws the name and still opens its menu, since creating the second space lives there, that no dot strip is drawn at all — a single dot would say nothing and would invite a press that changes nothing — and that the menu offers no `Move up` and no `Move down`: there is no order to set with one space in it. Pick `WithDots` for the strip once a second space exists, `MoveSpace` for the items the second one brings back.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})

		await expect(trigger).toBeVisible()
		await expect(slotsIn(canvasElement, "space-dots")).toHaveLength(0)

		const menu = await openMenu(trigger)
		await expect(
			within(menu).queryByRole("menuitem", { name: "Move up" }),
		).toBeNull()
		await expect(
			within(menu).queryByRole("menuitem", { name: "Move down" }),
		).toBeNull()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const WithDots = meta.story({
	render: (args) => <LiveSwitcher spaces={args.spaces} />,
	parameters: {
		docs: {
			description: {
				story:
					"The button and its dot strip driven by one selection, which is how a sidebar mounts them. Check that pressing a dot moves the button's name with it, that the open dot is the only filled and full-size one so the state never rests on colour alone, and that every dot is a named stop for a screen reader instead of an anonymous circle. Pick `Open` for the menu, `SingleSpace` for the strip's absent case.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const dots = slotsIn(canvasElement, "space-dot-button")
		await expect(dots).toHaveLength(SPACES.length)
		await expect(dots[0]).toHaveAttribute("aria-current", "true")

		await userEvent.click(dots[3])
		await expect(
			canvas.getByRole("button", { name: "Change space, Veille open" }),
		).toBeVisible()
		await expect(slotsIn(canvasElement, "space-dot-button")[3]).toHaveAttribute(
			"aria-current",
			"true",
		)
	},
})

export const Badges = meta.story({
	args: { badgesBySpaceId: BADGES },
	render: (args) => (
		<LiveSwitcher badgesBySpaceId={args.badgesBySpaceId} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Three of the five spaces carrying a badge while the reader sits in a fourth, which is how a bot working out of sight reaches them. Check every badged dot keeps its space's tint at its centre and wears the badge as a ring around it — the mark says something happened there, the tint still says which space it is — that the dots of the spaces with nothing stay exactly as they are drawn without badges, and that the button takes one mark of its own for the strongest badge waiting elsewhere, attention over failed over done, drawn on the name's line and level with the middle of the letters so the name and the mark read as one pair. The marks are drawn and never spoken: the button's accessible name is still the open space, since a reader who moves there meets the rows that carry the news. Pick `BadgeRanking` for the order under a quieter set, `BadgeHere` for the badge that belongs to the space already open.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Perso open",
		})

		await expect(badgeOn(trigger)).toBe("attention")

		const name = slotsIn(canvasElement, "space-switcher-name")[0]
		const badge = slotsIn(canvasElement, "space-switcher-badge")[0]
		await expect(middleOf(badge)).toBeCloseTo(middleOf(name), 0)

		await expect(dotBadges(canvasElement)).toEqual([
			"done",
			undefined,
			"failed",
			"attention",
			undefined,
		])
	},
})

export const BadgeRanking = meta.story({
	args: { badgesBySpaceId: { perso: "done", atelier: "failed" } },
	parameters: {
		docs: {
			description: {
				story:
					"Two spaces waiting, one done and one failed, with neither one open. Check the button wears the failed mark rather than the done one: a run that broke asks for the reader before a run that finished, and the button has room for one mark only. Pick `Badges` for the full order with attention in it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			badgeOn(canvas.getByRole("button", { name: "Change space, Vocca open" })),
		).toBe("failed")
	},
})

export const BadgeHere = meta.story({
	args: { badgesBySpaceId: { vocca: "attention" } },
	parameters: {
		docs: {
			description: {
				story:
					"The only badge in the account belongs to the space the reader already has open. Check the button is left unmarked — the roster under it is already showing the bot that raised it, and a mark here would send the reader looking for a space that does not exist — while the space's own row in the menu still carries the ring, so the badge is not lost. Pick `Badges` for the mark the button takes when the news is elsewhere.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: "Change space, Vocca open",
		})

		await expect(badgeOn(trigger)).toBeUndefined()

		const menu = await openMenu(trigger)
		const open = within(menu).getAllByRole("menuitemradio")[1]
		await expect(slotsIn(open, "space-dot")[0]?.dataset.badge).toBe("attention")

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const BadgeAndLongName = meta.story({
	args: {
		spaces: LONG_SPACES,
		selectedSpaceId: "perso",
		badgesBySpaceId: { vocca: "attention" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space named as a sentence while another one is asking for the reader — the pair that puts the mark and the truncation on the same edge. Check the name gives way to the badge instead of running under it: the clipped end and its ellipsis stop before the mark on the same line, the mark keeps its full size rather than being squeezed, and the button still holds the width it had. Pick `LongContent` for the same name with nothing waiting, `Badges` for the mark on names that fit.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })
		const name = slotsIn(canvasElement, "space-switcher-name")[0]
		const badge = slotsIn(canvasElement, "space-switcher-badge")[0]

		const badgeBox = badge.getBoundingClientRect()

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
			badgeBox.left,
		)
		await expect(badgeBox.width).toBeCloseTo(8, 0)
		await expect(trigger.getBoundingClientRect().width).toBeLessThan(256)
	},
})

export const BadgeOnRail = meta.story({
	args: { badgesBySpaceId: BADGES },
	render: (args) => <SwitcherRail {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The mark once the sidebar is on its icon rail, where the name is gone and the open space's tint is all that is left. Check the badge is still drawn, moved from the name's line to the button's top corner now that there is no line to sit on, and that the button keeps the rail's square rather than growing to make room for it — the room the name needed is not needed here. Pick `Collapsed` for the rail with nothing waiting.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })

		await expect(badgeOn(canvasElement)).toBe("attention")
		await expect(tintVisibleIn(trigger)).toBe(true)
		await expect(trigger.getBoundingClientRect().width).toBeCloseTo(28, 0)
	},
})

export const LongContent = meta.story({
	args: { spaces: LONG_SPACES, selectedSpaceId: "perso" },
	parameters: {
		docs: {
			description: {
				story:
					"A space named as a sentence, which is what happens when a reader treats the field as a note. Check the button clips the name with an ellipsis instead of pushing the trailing icon slot off the line or wrapping the header to two rows, and that the accessible name still carries the whole thing. Pick `Default` for names that fit.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: /^Change space/ })
		const line = canvasElement.querySelector<HTMLElement>(
			'[data-slot="space-switcher-name"]',
		)
		if (!line) throw new Error("Nothing here draws the space name")

		await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
		await expect(trigger.getBoundingClientRect().width).toBeLessThan(256)
	},
})

export const DragDotToPlace = meta.story({
	render: (args) => (
		<LiveSwitcher onReorderSpaces={args.onReorderSpaces} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Placing a space by hand. A press on a dot that then moves lifts it: the dot comes off the strip a size larger with a shadow under it and follows the pointer, while the strip keeps every dot where it stood — the order is the host's to redraw, so nothing is torn out of the row on the strength of a gesture that has not landed yet. A line is drawn at the boundary the space would take, on the leading edge of the dot it would sit before, or on the trailing edge of the last one when it has passed them all. The dot under the pointer is what decides the place, never the pointer's distance from the row's start, so the gesture reads the same on a row that has wrapped onto three lines — `WrappedDots` is that case. Releasing reports the full new order of ids and nothing else: the open space stays open, the tints and the badges stay with their spaces, and the click a release would otherwise fire is swallowed so a drag never doubles as a selection. Pick `DragDotNowhere` for every way the gesture ends in nothing, `MoveSpace` for the same move from the menu.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const handle = dotsIn(canvasElement)[0]
		const from = liftBy(handle, 12)

		await expect(getComputedStyle(handle).pointerEvents).toBe("none")
		await expect(centreOf(handle).clientX - from.clientX).toBeCloseTo(12, 0)
		await expect(dotNames(canvasElement)).toEqual(RESTING_NAMES)

		moveOver(handle, dotsIn(canvasElement)[3])
		await expect(insertionOn(canvasElement)).toBe(dotsIn(canvasElement)[4])

		dropOver(handle, dotsIn(canvasElement)[3])
		await expect(args.onReorderSpaces).toHaveBeenCalledWith([
			"vocca",
			"atelier",
			"veille",
			"perso",
			"archives",
		])
		await waitFor(async () => {
			await expect(dotNames(canvasElement)).toEqual([
				"Open Vocca",
				"Open Atelier",
				"Open Veille",
				"Open Perso",
				"Open Archives",
			])
		})
		await expect(insertionOn(canvasElement)).toBeUndefined()

		const last = dotsIn(canvasElement)[4]
		liftBy(last, -12)
		moveOver(last, dotsIn(canvasElement)[0])
		await expect(insertionOn(canvasElement)).toBe(dotsIn(canvasElement)[0])

		dropOver(last, dotsIn(canvasElement)[0])
		await expect(args.onReorderSpaces).toHaveBeenLastCalledWith([
			"archives",
			"vocca",
			"atelier",
			"veille",
			"perso",
		])
	},
})

export const DragDotNowhere = meta.story({
	render: (args) => (
		<LiveSwitcher onReorderSpaces={args.onReorderSpaces} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every way a lift ends in nothing. A press that never moves is still the plain click that opens the space, so the gesture costs the reader nothing to start. A dot released where it already stood reports nothing rather than a list identical to the one the host already holds. A release away from the row reports nothing and leaves the order as it stands. An interrupted pointer — a stream the browser takes back, a touch turned into a scroll — puts the dot down where it was and reports nothing, rather than filing it wherever the last move happened to be. Check all four, and that no lift starts at all from a press that carries a right button.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const handle = dotsIn(canvasElement)[2]

		await userEvent.click(handle)
		await expect(handle).toHaveAttribute("aria-current", "true")
		await expect(args.onReorderSpaces).not.toHaveBeenCalled()

		const from = liftBy(handle, 10)
		await expect(getComputedStyle(handle).pointerEvents).toBe("none")
		fireEvent.pointerCancel(handle, POINTER)
		await expect(getComputedStyle(handle).pointerEvents).not.toBe("none")
		await expect(args.onReorderSpaces).not.toHaveBeenCalled()

		liftBy(handle, 10)
		fireEvent.pointerUp(handle, { ...POINTER, ...from })
		await expect(args.onReorderSpaces).not.toHaveBeenCalled()

		liftBy(handle, 10)
		fireEvent.pointerMove(handle, { ...POINTER, clientX: 4, clientY: 4 })
		await expect(insertionOn(canvasElement)).toBeUndefined()
		fireEvent.pointerUp(handle, { ...POINTER, clientX: 4, clientY: 4 })
		await expect(args.onReorderSpaces).not.toHaveBeenCalled()

		fireEvent.pointerDown(handle, { ...POINTER, ...from, button: 2 })
		moveOver(handle, dotsIn(canvasElement)[0])
		await expect(getComputedStyle(handle).pointerEvents).not.toBe("none")
		await expect(dotNames(canvasElement)).toEqual(RESTING_NAMES)
	},
})

export const WrappedDots = meta.story({
	args: { spaces: MANY_SPACES, selectedSpaceId: "perso" },
	render: (args) => (
		<div className={NARROW_STRIP}>
			<SpaceDots {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Nine spaces in a strip too narrow to hold them, which is the sidebar at its most crowded. Check the row wraps onto further lines instead of shrinking the dots or scrolling sideways, and that a lift reads the dot under the pointer rather than how far the pointer has travelled from the row's start: the first dot of the second line sits at the same distance from that start as the first dot of the first line, and dropping on it must place the space there and nowhere else. Pick `DragDotToPlace` for the gesture on a row that fits on one line.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const tops = dotsIn(canvasElement).map((dot) =>
			Math.round(dot.getBoundingClientRect().top),
		)
		const wrapped = tops.findIndex((top) => top > tops[0])
		await expect(wrapped).toBeGreaterThan(0)

		const handle = dotsIn(canvasElement)[0]
		const below = dotsIn(canvasElement)[wrapped]
		await expect(centreOf(below).clientX).toBe(centreOf(handle).clientX)

		liftBy(handle, 12)
		moveOver(handle, below)
		await expect(insertionOn(canvasElement)).toBe(
			dotsIn(canvasElement)[wrapped + 1],
		)

		const expected = MANY_SPACES.map((space) => space.id).filter(
			(id) => id !== "perso",
		)
		expected.splice(wrapped, 0, "perso")

		dropOver(handle, below)
		await expect(args.onReorderSpaces).toHaveBeenCalledWith(expected)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const MoveSpace = meta.story({
	render: (args) => (
		<LiveSwitcher onReorderSpaces={args.onReorderSpaces} spaces={args.spaces} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same move without a pointer, for a reader who will not drag a five-millimetre dot. The menu of the open space carries `Move up` and `Move down` under the list, and they report exactly what a drop reports: the full new order of ids. Check the pair acts on the space the button names and moves it one place at a time in the list above them, that `Move up` is dead while that space stands first and `Move down` while it stands last — an item that reads as an offer and does nothing is worse than an item that says it cannot — and that the dots redraw in the new order the moment the host takes it. Pick `DragDotToPlace` for the gesture, `SingleSpace` for the account where neither item is offered.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const menu = await openMenu(
			canvas.getByRole("button", { name: "Change space, Perso open" }),
		)

		await expect(
			within(menu).getByRole("menuitem", { name: "Move up" }),
		).toBeDisabled()

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Move down" }),
		)
		await expect(args.onReorderSpaces).toHaveBeenCalledWith([
			"vocca",
			"perso",
			"atelier",
			"veille",
			"archives",
		])
		await waitFor(async () => {
			await expect(dotNames(canvasElement)).toEqual([
				"Open Vocca",
				"Open Perso",
				"Open Atelier",
				"Open Veille",
				"Open Archives",
			])
		})

		await userEvent.click(dotsIn(canvasElement)[4])
		const lastMenu = await openMenu(
			canvas.getByRole("button", { name: "Change space, Archives open" }),
		)
		await expect(
			within(lastMenu).getByRole("menuitem", { name: "Move down" }),
		).toBeDisabled()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})
