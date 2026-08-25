import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { settled, slotsIn } from "@workspace/storybook/story-utils"
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

const LONG_SPACES: Space[] = [
	{
		id: "perso",
		name: "Everything I have not filed anywhere else yet",
		colour: "blue",
	},
	{ id: "vocca", name: "Vocca", colour: "green" },
]

const HEADER_LINE =
	"flex h-12 w-64 items-center justify-end rounded-xl border border-border border-dashed px-2.5"

const RAIL_LINE =
	"group/sidebar flex h-12 w-12 items-center justify-center rounded-xl border border-border border-dashed"

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

const LiveSwitcher = ({ spaces }: { spaces: Space[] }) => {
	const [selectedSpaceId, setSelectedSpaceId] = useState(spaces[0].id)

	return (
		<div className="flex w-64 flex-col gap-4">
			<SwitcherLine
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
			/>
			<SpaceDots
				onSelectSpace={setSelectedSpaceId}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
			/>
		</div>
	)
}

const meta = preview.meta({
	title: "Navigation/SpaceSwitcher",
	component: SpaceSwitcher,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The control that says which space a reader is in and moves them to another one. On an open panel it is a ghost button carrying the space's name alone, sized to sit on a header line beside a trailing icon button; on the icon rail the name goes and the space's tint takes its place as a dot, which is all a rail has room for. Pressing it opens a single-choice menu: every space with its tint and its rank as a Cmd shortcut hint, then an item to create one, then an item to open the space settings. `SpaceDots` is its companion for a pinned strip — one dot per space, the open one filled with its tint and larger, the rest muted and smaller, so the reader knows how many spaces exist and where they stand without opening anything. Both take the same three props, so a host maps its store onto `spaces` and `selectedSpaceId` once and hands the pair the same callback. A single space still shows the button, since creating a second one lives in its menu, but draws no dots — there is nothing to count. Reach for this at the top of a sidebar; `AgentSidebar` mounts both and adds the swipe and the Cmd+digit chords that go with them.",
			},
		},
	},
	args: {
		spaces: SPACES,
		selectedSpaceId: "vocca",
		onSelectSpace: fn(),
		onCreateSpace: fn(),
		onOpenSpaceSettings: fn(),
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
					"A reader who has only ever had one space — the state every account opens in. Check the button still draws the name and still opens its menu, since creating the second space lives there, and that no dot strip is drawn at all: a single dot would say nothing and would invite a press that changes nothing. Pick `WithDots` for the strip once a second space exists.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("button", { name: "Change space, Perso open" }),
		).toBeVisible()
		await expect(slotsIn(canvasElement, "space-dots")).toHaveLength(0)
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
