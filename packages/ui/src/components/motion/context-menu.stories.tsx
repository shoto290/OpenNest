import { useState } from "react"
import { expect, fireEvent, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { settled } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"

const BUTTON_CLASS =
	"rounded-xl border border-border bg-card px-3 py-1.5 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

const SURFACE_CLASS =
	"flex h-40 w-72 items-center justify-center rounded-xl border border-border border-dashed bg-card text-muted-foreground text-sm"

const settledMenu = async () => {
	const menu = await settled(await screen.findByRole("menu"))
	await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
	return menu
}

const openMenuOn = async (target: HTMLElement, at = { x: 180, y: 140 }) => {
	fireEvent.contextMenu(target, { clientX: at.x, clientY: at.y })
	return settledMenu()
}

const SUBMENU_NAME = "Move to"

const settledSubmenu = async () =>
	settled(await screen.findByRole("menu", { name: SUBMENU_NAME }))

const branchTrigger = () => screen.getByRole("menuitem", { name: SUBMENU_NAME })

const MoveToSubmenu = () => (
	<ContextMenuSub>
		<ContextMenuSubTrigger>
			<Icons.Folder className="h-4 w-4" />
			{SUBMENU_NAME}
		</ContextMenuSubTrigger>
		<ContextMenuSubContent>
			<ContextMenuItem>Inbox</ContextMenuItem>
			<ContextMenuItem>Later</ContextMenuItem>
			<ContextMenuItem>Archive</ContextMenuItem>
		</ContextMenuSubContent>
	</ContextMenuSub>
)

const BranchMenu = () => (
	<ContextMenuContent ariaLabel="Transcript actions">
		<ContextMenuItem>
			<Icons.Copy className="h-4 w-4" />
			Copy transcript
		</ContextMenuItem>
		<MoveToSubmenu />
		<ContextMenuSeparator />
		<ContextMenuItem tone="destructive">
			<Icons.Delete className="h-4 w-4" />
			Delete
		</ContextMenuItem>
	</ContextMenuContent>
)

const BranchCard = ({ label }: { label: string }) => (
	<ContextMenu>
		<ContextMenuTrigger>
			<button type="button" className={SURFACE_CLASS}>
				{label}
			</button>
		</ContextMenuTrigger>
		<BranchMenu />
	</ContextMenu>
)

const FileMenu = () => (
	<ContextMenuContent ariaLabel="Transcript actions">
		<ContextMenuItem>
			<Icons.Copy className="h-4 w-4" />
			Copy transcript
			<ContextMenuShortcut>⌘C</ContextMenuShortcut>
		</ContextMenuItem>
		<ContextMenuItem>
			<Icons.Edit className="h-4 w-4" />
			Rename
			<ContextMenuShortcut>⏎</ContextMenuShortcut>
		</ContextMenuItem>
		<ContextMenuSeparator />
		<ContextMenuItem tone="destructive">
			<Icons.Delete className="h-4 w-4" />
			Delete
			<ContextMenuShortcut>⌫</ContextMenuShortcut>
		</ContextMenuItem>
	</ContextMenuContent>
)

const ViewMenu = () => {
	const [wrap, setWrap] = useState(true)
	const [timestamps, setTimestamps] = useState(false)
	const [density, setDensity] = useState("cosy")

	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<button type="button" className={SURFACE_CLASS}>
					Right-click for view options
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent ariaLabel="View options">
				<ContextMenuLabel>Show</ContextMenuLabel>
				<ContextMenuCheckboxItem
					checked={wrap}
					onCheckedChange={setWrap}
					closeOnSelect={false}
				>
					Wrap long lines
				</ContextMenuCheckboxItem>
				<ContextMenuCheckboxItem
					checked={timestamps}
					onCheckedChange={setTimestamps}
					closeOnSelect={false}
				>
					Timestamps
				</ContextMenuCheckboxItem>
				<ContextMenuSeparator />
				<ContextMenuLabel>Density</ContextMenuLabel>
				<ContextMenuRadioGroup value={density} onValueChange={setDensity}>
					<ContextMenuRadioItem value="comfortable">
						Comfortable
					</ContextMenuRadioItem>
					<ContextMenuRadioItem value="cosy">Cosy</ContextMenuRadioItem>
					<ContextMenuRadioItem value="compact">Compact</ContextMenuRadioItem>
				</ContextMenuRadioGroup>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const ControlledMenu = () => {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col items-center gap-3">
			<ContextMenu open={open} onOpenChange={setOpen}>
				<ContextMenuTrigger>
					<button type="button" className={SURFACE_CLASS}>
						Right-click this card
					</button>
				</ContextMenuTrigger>
				<FileMenu />
			</ContextMenu>
			<p className="text-muted-foreground text-xs">
				Menu is {open ? "open" : "closed"}
			</p>
		</div>
	)
}

const meta = preview.meta({
	title: "Overlays/ContextMenu",
	component: ContextMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The menu a surface offers when it is asked what it can do. It morphs open from the exact point the request came from — the cursor on a right-click, the finger after a 520ms long press, the trigger's own edge when it is opened from the keyboard — then clamps itself inside the viewport so it never opens off screen. It is portalled to `document.body` and `inert` while closed, so nothing inside it is reachable until it is open. Keyboard is first class: the ContextMenu key or Shift+F10 opens it, arrows walk it, typing jumps by label, Escape closes it and returns focus. Three item kinds compose inside it — plain, checkbox and radio — alongside `ContextMenuLabel`, `ContextMenuSeparator` and `ContextMenuShortcut`, which is decorative and hidden from readers. A row that carries a menu of its own is wrapped in `ContextMenuSub`, whose `ContextMenuSubTrigger` opens `ContextMenuSubContent` beside it on hover and on the arrow that points at it, flipping to the other side when the edge of the screen leaves it no room. The trigger clones its single child and hands it `aria-haspopup` and `aria-expanded`, so that child must be a real element with a widget role — a `<button>`, not a `<div>`, which is also the only way the keyboard path exists at all. A passage of a page that is not a control — a chat bubble, say — takes `announcesPopup={false}` instead: the right-click still opens the menu, and the region is left without the popup ARIA no reader could act on there. Reach for it for actions on a specific object; a menu that is the only way to reach an action is a menu most readers will never find.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger>
				<button type="button" className={SURFACE_CLASS}>
					Right-click this card
				</button>
			</ContextMenuTrigger>
			<FileMenu />
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: actions on one object, the destructive one separated and toned apart at the bottom. Check the menu grows out of the pointer rather than out of the card's corner, that moving the pointer down the list drags the highlight with no lag, and that the shortcut hints are hidden from readers — they mirror a keyboard the screen reader user is already on.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await openMenuOn(canvas.getByText("Right-click this card"))

		await expect(
			screen.getByRole("menu", { name: "Transcript actions" }),
		).toBeVisible()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const WithCheckboxAndRadioItems = meta.story({
	render: () => <ViewMenu />,
	parameters: {
		docs: {
			description: {
				story:
					"The two stateful item kinds, grouped under labels. Checkboxes set `closeOnSelect={false}` so a reader can flip several settings in one visit — that is the point of putting them in a menu rather than in a dialog. Radio items are exclusive and close on choice. Check that both report their state through `aria-checked` rather than only through the tick, and that the tick animates in without shifting the label beside it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await openMenuOn(canvas.getByText("Right-click for view options"))

		const wrap = screen.getByRole("menuitemcheckbox", {
			name: "Wrap long lines",
		})
		await expect(wrap).toHaveAttribute("aria-checked", "true")

		await userEvent.click(wrap)
		await expect(
			screen.getByRole("menuitemcheckbox", { name: "Wrap long lines" }),
		).toHaveAttribute("aria-checked", "false")
	},
})

export const States = meta.story({
	render: () => (
		<div className="flex flex-col items-center gap-4">
			<ContextMenu>
				<ContextMenuTrigger>
					<button type="button" className={SURFACE_CLASS}>
						Right-click this card
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent ariaLabel="Transcript actions">
					<ContextMenuItem>Copy transcript</ContextMenuItem>
					<ContextMenuItem inset>Copy as Markdown</ContextMenuItem>
					<ContextMenuItem disabled>Restore previous version</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem tone="destructive">Delete</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<ContextMenu>
				<ContextMenuTrigger disabled>
					<button type="button" className={SURFACE_CLASS}>
						This surface has no menu
					</button>
				</ContextMenuTrigger>
				<FileMenu />
			</ContextMenu>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every state an item and a trigger can be in: default, `inset` for a row that lines up under ticked siblings, `disabled`, the `destructive` tone, and a trigger switched off entirely so the browser's own menu comes back. Check a disabled item is skipped by the arrow keys as well as by the pointer — an item that can be focused but not chosen is worse than one that is not there.",
			},
		},
	},
	play: async ({ canvas }) => {
		await openMenuOn(canvas.getByText("Right-click this card"))

		await expect(
			screen.getByRole("menuitem", { name: "Restore previous version" }),
		).toBeDisabled()
	},
})

export const Keyboard = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger>
				<button type="button" className={SURFACE_CLASS}>
					Focus me, then press Shift+F10
				</button>
			</ContextMenuTrigger>
			<FileMenu />
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same menu reached without a pointer. Opened this way the morph is skipped — there is no cursor for the menu to grow out of, so it appears at the trigger's own edge — and focus lands on the first enabled item straight away, which is why there is nothing to press ArrowDown for until the second row. Check the arrows wrap around the ends, that a disabled row is stepped over rather than focused, and that Escape hands focus back to the trigger instead of dropping it on the body.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: /Focus me, then press Shift\+F10/,
		})

		await userEvent.click(trigger)
		await expect(trigger).toHaveFocus()

		await userEvent.keyboard("{Shift>}{F10}{/Shift}")
		await settledMenu()

		await waitFor(() =>
			expect(
				screen.getByRole("menuitem", { name: /Copy transcript/ }),
			).toHaveFocus(),
		)

		await userEvent.keyboard("{ArrowDown}")
		await expect(screen.getByRole("menuitem", { name: /Rename/ })).toHaveFocus()

		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(trigger).toHaveFocus())
	},
})

export const Controlled = meta.story({
	render: () => <ControlledMenu />,
	parameters: {
		docs: {
			description: {
				story:
					"`open` owned by the caller, which is what lets a route change or a finished action close the menu from outside. The open point is still the component's — it comes from the gesture, not from the prop — so a menu forced open without one appears at the last point it was asked for. Check the caption follows both the right-click and the Escape.",
			},
		},
	},
})

export const LongContent = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger>
				<button type="button" className={SURFACE_CLASS}>
					Right-click this card
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent ariaLabel="Transcript actions">
				<ContextMenuLabel>This transcript</ContextMenuLabel>
				<ContextMenuItem textValue="copy">
					Copy the whole transcript to the clipboard
					<ContextMenuShortcut>⌘C</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem textValue="export">
					Export every turn as Markdown, including tool calls
				</ContextMenuItem>
				<ContextMenuItem textValue="archive">
					Move to the archive and stop indexing it
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Labels long enough to fight the menu's minimum width, with `textValue` set so typeahead still matches a short word rather than the whole sentence. Check no row wraps to two lines — a menu is scanned, not read — and treat anything this long as a sign the action needs a dialog to explain itself instead.",
			},
		},
	},
})

export const PassiveTrigger = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger announcesPopup={false}>
				<div className={SURFACE_CLASS}>Right-click this passage</div>
			</ContextMenuTrigger>
			<FileMenu />
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A region rather than a control: the menu is a shortcut to actions that are already reachable elsewhere, so the passage stays plain markup and takes `announcesPopup={false}`. Check the right-click still opens the menu and that the region carries no `aria-haspopup` or `aria-expanded` — attributes a generic element does not support, and which would promise a keyboard path that a non-focusable region cannot offer.",
			},
		},
	},
	play: async ({ canvas }) => {
		const passage = canvas.getByText("Right-click this passage")

		await expect(passage).not.toHaveAttribute("aria-haspopup")
		await expect(passage).not.toHaveAttribute("aria-expanded")

		await openMenuOn(passage)
		await expect(screen.getByRole("menu")).toBeVisible()
	},
})

export const AsMenuButton = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger opensOnPress>
				<button type="button" className={BUTTON_CLASS}>
					Transcript
				</button>
			</ContextMenuTrigger>
			<FileMenu />
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same menu hung off a control that opens on a plain press, for a header button whose only job is to reveal it — `opensOnPress`. Check the menu opens from the button's bottom edge rather than from the cursor, that a second press closes it instead of reopening it, that Enter and Space open it from the keyboard with focus landing on the first row, and that Escape hands focus back to the button. Pick `Default` for the right-click path, which is what every other trigger here does.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Transcript" })

		fireEvent.pointerDown(trigger, { button: 0 })
		const menu = await settledMenu()
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			trigger.getBoundingClientRect().bottom,
		)

		fireEvent.pointerDown(trigger, { button: 0 })
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		trigger.focus()
		await userEvent.keyboard("{Enter}")
		await settledMenu()
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		await expect(trigger).toHaveFocus()
	},
})

export const SeparatorAlignment = meta.story({
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger>
				<button type="button" className={SURFACE_CLASS}>
					Right-click this card
				</button>
			</ContextMenuTrigger>
			<FileMenu />
		</ContextMenu>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The separator measured against the rows it parts. It starts and ends exactly where an item does rather than running to the popup's edges, and the air it leaves above and below matches the air the popup leaves at its sides. Check the rule stays a single hairline in the border colour.",
			},
		},
	},
	play: async ({ canvas }) => {
		const menu = await openMenuOn(canvas.getByText("Right-click this card"))

		const separator = screen.getByRole("separator")
		const separatorBox = separator.getBoundingClientRect()
		const itemBox = screen
			.getByRole("menuitem", { name: "Rename" })
			.getBoundingClientRect()

		await expect(Math.round(separatorBox.left)).toBe(Math.round(itemBox.left))
		await expect(Math.round(separatorBox.right)).toBe(Math.round(itemBox.right))
		await expect(Math.round(separatorBox.height)).toBe(1)

		const separatorStyles = getComputedStyle(separator)
		const menuStyles = getComputedStyle(menu)

		await expect(separatorStyles.marginTop).toBe(menuStyles.paddingLeft)
		await expect(separatorStyles.marginBottom).toBe(menuStyles.paddingLeft)
		await expect(separatorStyles.backgroundColor).toBe(
			menuStyles.borderTopColor,
		)
	},
})

export const WithSubmenu = meta.story({
	render: () => <BranchCard label="Right-click this card" />,
	parameters: {
		docs: {
			description: {
				story:
					"A branch item that carries a menu of its own. Resting the pointer on it opens the submenu beside it — no click — and the branch keeps the highlight of an open row while the pointer is away in the panel. Travelling from the branch across to the submenu never closes it: the submenu only gives way once the pointer comes to rest on another row, which is what tells us the reader changed their mind. Choosing inside the submenu closes the whole menu, branch and all, because the action is done. Check the chevron sits at the end of the row and is hidden from readers — the item already announces that it opens a menu.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await openMenuOn(canvas.getByText("Right-click this card"))

		const branch = branchTrigger()
		await expect(branch).toHaveAttribute("aria-haspopup", "menu")
		await expect(branch).toHaveAttribute("aria-expanded", "false")

		await userEvent.hover(branch)
		const panel = (await settledSubmenu()).getBoundingClientRect()
		await expect(branch).toHaveAttribute("aria-expanded", "true")
		await expect(branch).toHaveAttribute("data-state", "open")

		await expect(panel.left).toBeGreaterThanOrEqual(
			branch.getBoundingClientRect().right,
		)

		await userEvent.hover(screen.getByRole("menuitem", { name: /Copy/ }))
		await waitFor(() =>
			expect(screen.queryByRole("menu", { name: SUBMENU_NAME })).toBeNull(),
		)

		await userEvent.hover(branchTrigger())
		await settledSubmenu()
		await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }))
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
	},
})

export const SubmenuByKeyboard = meta.story({
	render: () => <BranchCard label="Focus me, then press Shift+F10" />,
	parameters: {
		docs: {
			description: {
				story:
					"The same branch reached without a pointer. ArrowRight — the arrow pointing at the submenu — opens it and hands focus to its first row; ArrowLeft closes it and puts focus back on the branch, so the reader never loses their place in the parent list. Enter and Space open it too. Check Escape inside the submenu closes only that submenu, and that typing while it is open matches its rows rather than the parent's.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", {
			name: /Focus me, then press Shift\+F10/,
		})

		await userEvent.click(trigger)
		await userEvent.keyboard("{Shift>}{F10}{/Shift}")
		await settledMenu()

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(branchTrigger()).toHaveFocus())

		await userEvent.keyboard("{ArrowRight}")
		await settledSubmenu()
		await waitFor(() =>
			expect(screen.getByRole("menuitem", { name: "Inbox" })).toHaveFocus(),
		)

		await userEvent.keyboard("{ArrowLeft}")
		await waitFor(() =>
			expect(screen.queryByRole("menu", { name: SUBMENU_NAME })).toBeNull(),
		)
		await expect(branchTrigger()).toHaveFocus()
	},
})

export const SubmenuWithoutRoom = meta.story({
	render: () => <BranchCard label="Right-click this card" />,
	parameters: {
		docs: {
			description: {
				story:
					"The menu opened hard against the right edge, where the submenu has no room on the side it prefers. It flips to the other side of the branch rather than hanging off screen or squeezing itself narrow. Check it stays whole — both edges inside the viewport padding — and that the keyboard still reads ArrowRight as open and ArrowLeft as close whichever side it landed on.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await openMenuOn(canvas.getByText("Right-click this card"), {
			x: window.innerWidth - 4,
			y: 120,
		})

		const branch = branchTrigger()
		await userEvent.hover(branch)
		const panel = (await settledSubmenu()).getBoundingClientRect()
		await expect(panel.right).toBeLessThanOrEqual(
			branch.getBoundingClientRect().left,
		)
		await expect(panel.left).toBeGreaterThanOrEqual(0)
		await expect(panel.right).toBeLessThanOrEqual(window.innerWidth)
	},
})
