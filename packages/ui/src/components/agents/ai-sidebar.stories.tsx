import type { ReactNode } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import {
	AISidebar,
	type SidebarResource,
	type SidebarResourceKind,
} from "@workspace/ui/components/agents/ai-sidebar"
import { Icons } from "@workspace/ui/components/icons"

const RESOURCE_KINDS = listExhaustively<SidebarResourceKind>({
	folder: true,
	project: true,
	file: true,
	bookmark: true,
})

const HOVER_HIGHLIGHT_CLASS = "hover:bg-sidebar-accent"

const KIND_ICONS: Record<SidebarResourceKind, ReactNode> = {
	folder: <Icons.FileCode className="size-4" />,
	project: <Icons.Home className="size-4" />,
	file: <Icons.FileCode className="size-4" />,
	bookmark: <Icons.Search className="size-4" />,
}

const KIND_TREE: SidebarResource[] = RESOURCE_KINDS.map((kind) => ({
	id: `kind-${kind}`,
	label: kind,
	kind,
}))

const TREE: SidebarResource[] = [
	{
		id: "workspace",
		label: "Workspace",
		kind: "folder",
		children: [
			{ id: "workspace-brief", label: "Brief", kind: "file" },
			{ id: "workspace-notes", label: "Notes", kind: "file" },
		],
	},
	{
		id: "archive",
		label: "Archive",
		kind: "folder",
		children: [{ id: "archive-season", label: "Season one", kind: "file" }],
	},
	{
		id: "reading",
		label: "Reading list",
		kind: "project",
		children: [
			{
				id: "reading-handbook",
				label: "Ada Martin handbook",
				kind: "bookmark",
			},
		],
	},
]

const STATE_TREE: SidebarResource[] = [
	{
		id: "expanded-folder",
		label: "Expanded folder",
		kind: "folder",
		children: [
			{ id: "selected-leaf", label: "Selected leaf", kind: "file" },
			{ id: "idle-leaf", label: "Idle leaf", kind: "file" },
			{
				id: "disabled-leaf",
				label: "Disabled leaf",
				kind: "file",
				disabled: true,
			},
		],
	},
	{
		id: "collapsed-folder",
		label: "Collapsed folder",
		kind: "folder",
		children: [{ id: "hidden-leaf", label: "Hidden leaf", kind: "file" }],
	},
]

const DEEP_TREE: SidebarResource[] = [
	{
		id: "deep-root",
		label:
			"Quarterly retrospective and follow-up actions for the distributed platform group",
		kind: "project",
		children: [
			{
				id: "deep-branch",
				label:
					"Migration notes covering the storage layer, the queue and every downstream consumer",
				kind: "folder",
				children: [
					{
						id: "deep-twig",
						label:
							"Rollback rehearsal transcript with timings for each verification step",
						kind: "folder",
						children: [
							{
								id: "deep-leaf",
								label:
									"Appendix — measurements captured by Ada Martin during the third rehearsal window",
								kind: "file",
							},
						],
					},
				],
			},
		],
	},
]

const meta = preview.meta({
	title: "AI/AISidebar",
	component: AISidebar,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A resource tree for an agent sidebar: nested folders and projects, leaf files and bookmarks, roving-tabindex keyboard navigation, optimistic drag-and-drop reordering and inline rename. `isReadOnly` keeps selection, expansion and the full keyboard set while dropping every mutation affordance, so a browse-only surface has nothing extra to tab to.",
			},
		},
	},
	args: {
		defaultItems: TREE,
		defaultExpandedIds: ["workspace", "reading"],
		defaultActiveId: "workspace-brief",
		onActiveChange: fn(),
		onItemsChange: fn(),
		onMove: fn(),
		onRename: fn(),
	},
	argTypes: {
		isReadOnly: { control: "boolean" },
		ariaLabel: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="w-72">
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
					"The editable tree the component was designed for: two expanded containers, one collapsed, one selected leaf. Check that exactly one row holds `tabindex=0` so Tab enters the tree once, that Up/Down/Home/End move focus without changing selection, that Right expands a collapsed container before descending into it and Left collapses before climbing back to the parent. Reach for `ReadOnly` instead when the surface must not mutate anything.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const tree = canvas.getByRole("tree", { name: "Resources" })
		await expect(tree).toBeVisible()
		await expect(canvas.getAllByRole("treeitem")).toHaveLength(6)

		const workspace = canvas.getByRole("treeitem", { name: /^Workspace/ })
		const brief = canvas.getByRole("treeitem", { name: /^Brief/ })
		const notes = canvas.getByRole("treeitem", { name: /^Notes/ })
		const archive = canvas.getByRole("treeitem", { name: /^Archive/ })
		const handbook = canvas.getByRole("treeitem", { name: /^Ada Martin/ })

		await expect(workspace).toHaveAttribute("aria-level", "1")
		await expect(workspace).toHaveAttribute("aria-expanded", "true")
		await expect(archive).toHaveAttribute("aria-expanded", "false")
		await expect(brief).toHaveAttribute("aria-level", "2")
		await expect(brief).toHaveAttribute("aria-selected", "true")
		await expect(notes).toHaveAttribute("aria-selected", "false")
		await expect(brief).toHaveAttribute("tabindex", "0")
		await expect(workspace).toHaveAttribute("tabindex", "-1")

		await userEvent.tab()
		await waitFor(() => expect(brief).toHaveFocus())

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())

		await userEvent.keyboard("{ArrowUp}")
		await waitFor(() => expect(brief).toHaveFocus())

		await userEvent.keyboard("{End}")
		await waitFor(() => expect(handbook).toHaveFocus())

		await userEvent.keyboard("{Home}")
		await waitFor(() => expect(workspace).toHaveFocus())

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(brief).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(archive).toHaveFocus())

		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() =>
			expect(archive).toHaveAttribute("aria-expanded", "true"),
		)

		await userEvent.keyboard("{ArrowRight}")
		const season = await canvas.findByRole("treeitem", { name: /^Season one/ })
		await waitFor(() => expect(season).toHaveFocus())
		await expect(season).toHaveAttribute("aria-level", "2")

		await userEvent.keyboard("{ArrowLeft}")
		await waitFor(() => expect(archive).toHaveFocus())

		await userEvent.keyboard("{ArrowLeft}")
		await waitFor(() =>
			expect(archive).toHaveAttribute("aria-expanded", "false"),
		)

		await userEvent.keyboard("{Home}")
		await waitFor(() => expect(workspace).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(brief).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())

		await userEvent.keyboard("{Enter}")
		await expect(args.onActiveChange).toHaveBeenCalledWith("workspace-notes")
		await waitFor(() => expect(notes).toHaveAttribute("aria-selected", "true"))

		await userEvent.keyboard("{Home}")
		await waitFor(() => expect(workspace).toHaveFocus())
		await userEvent.keyboard(" ")
		await waitFor(() =>
			expect(workspace).toHaveAttribute("aria-expanded", "false"),
		)
	},
})

export const ReadOnly = meta.story({
	args: { isReadOnly: true },
	parameters: {
		docs: {
			description: {
				story:
					"The same tree on a browse-only surface — a shared link, an audit view, a picker that must not edit the library. Check that selection and the whole keyboard set still work (Up/Down/Home/End, Right to expand and descend, Left to collapse and ascend, Enter to select a leaf) while every mutation affordance is gone rather than disabled: no overflow button to tab to, no drag handle, F2 and double-click open no rename field. Reach for `Default` when the surface owns the data and may reorder or rename it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("tree", { name: "Resources" })).toBeVisible()
		await expect(canvas.queryAllByRole("button")).toHaveLength(0)
		await expect(canvas.queryByRole("button", { name: /more/i })).toBeNull()

		const workspace = canvas.getByRole("treeitem", { name: "Workspace" })
		const brief = canvas.getByRole("treeitem", { name: "Brief" })
		const notes = canvas.getByRole("treeitem", { name: "Notes" })
		const archive = canvas.getByRole("treeitem", { name: "Archive" })
		const handbook = canvas.getByRole("treeitem", {
			name: "Ada Martin handbook",
		})

		await expect(brief).toHaveAttribute("draggable", "false")
		await expect(brief).toHaveAttribute("aria-selected", "true")

		await userEvent.tab()
		await waitFor(() => expect(brief).toHaveFocus())

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())

		await userEvent.keyboard("{End}")
		await waitFor(() => expect(handbook).toHaveFocus())

		await userEvent.keyboard("{Home}")
		await waitFor(() => expect(workspace).toHaveFocus())

		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(brief).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(archive).toHaveFocus())

		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() =>
			expect(archive).toHaveAttribute("aria-expanded", "true"),
		)
		await userEvent.keyboard("{ArrowRight}")
		const season = await canvas.findByRole("treeitem", { name: "Season one" })
		await waitFor(() => expect(season).toHaveFocus())

		await userEvent.keyboard("{ArrowLeft}")
		await waitFor(() => expect(archive).toHaveFocus())
		await userEvent.keyboard("{ArrowLeft}")
		await waitFor(() =>
			expect(archive).toHaveAttribute("aria-expanded", "false"),
		)

		await userEvent.keyboard("{Home}")
		await waitFor(() => expect(workspace).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(brief).toHaveFocus())
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() => expect(notes).toHaveFocus())
		await userEvent.keyboard("{Enter}")
		await expect(args.onActiveChange).toHaveBeenCalledWith("workspace-notes")

		await userEvent.keyboard("{F2}")
		await expect(canvas.queryByRole("textbox")).toBeNull()

		await userEvent.dblClick(notes)
		await expect(canvas.queryByRole("textbox")).toBeNull()
		await expect(args.onItemsChange).not.toHaveBeenCalled()
	},
})

export const States = meta.story({
	args: {
		defaultItems: STATE_TREE,
		defaultExpandedIds: ["expanded-folder"],
		defaultActiveId: "selected-leaf",
	},
	parameters: {
		pseudo: {
			hover: "[data-slot='ai-sidebar-row']:nth-of-type(3)",
			focusVisible: "[data-slot='ai-sidebar-row']:nth-of-type(5)",
		},
		docs: {
			description: {
				story:
					"Every row state side by side: an expanded container next to a collapsed one, the selected leaf, an idle leaf under hover, a disabled leaf and a keyboard-focused row. Check that hover and selection resolve to the same sidebar accent without the selected row losing its emphasis, that the focus ring is inset and visible, and that the disabled row is dimmed, keeps `aria-disabled`, refuses selection and drops the hover classes so it never lights up under the cursor, while still being reachable with the arrow keys. The row has no distinct `:active` styling, so pressing is covered by the focus ring alone.",
			},
		},
	},
	play: async ({ canvas }) => {
		const disabled = canvas.getByRole("treeitem", { name: /^Disabled leaf/ })
		await expect(disabled).toHaveAttribute("aria-disabled", "true")
		await expect(disabled).toHaveAttribute("aria-selected", "false")
		await expect(disabled).not.toHaveClass(HOVER_HIGHLIGHT_CLASS)
		await expect(
			canvas.getByRole("treeitem", { name: /^Idle leaf/ }),
		).toHaveClass(HOVER_HIGHLIGHT_CLASS)

		const collapsed = canvas.getByRole("treeitem", {
			name: /^Collapsed folder/,
		})
		await expect(collapsed).toHaveAttribute("aria-expanded", "false")
		await expect(
			canvas.queryByRole("treeitem", { name: /^Hidden leaf/ }),
		).toBeNull()
	},
})

export const LongContent = meta.story({
	args: {
		defaultItems: DEEP_TREE,
		defaultExpandedIds: ["deep-root", "deep-branch", "deep-twig"],
		defaultActiveId: "deep-leaf",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Labels far wider than a 288px rail, nested four levels deep. Check that each row stays on one line and clips instead of wrapping or pushing the overflow button out of the rail, that the indent keeps growing with `aria-level`, and that the marquee only takes over on hover — it stays parked under `prefers-reduced-motion`, which is how the test browser renders it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const leaf = canvas.getByRole("treeitem", { name: /^Appendix/ })
		await expect(leaf).toHaveAttribute("aria-level", "4")
	},
})

export const Kinds = meta.story({
	args: {
		defaultItems: KIND_TREE,
		defaultExpandedIds: [],
		defaultActiveId: "kind-file",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Every `SidebarResourceKind` on one row each, with the built-in glyphs. Check that `folder` and `project` read as containers — closed folder glyph, `aria-expanded` present, no `aria-selected` — while `file` and `bookmark` read as leaves that carry `aria-selected` and no expand state. The list is derived from the union, so a new kind fails the type check until it is documented here.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("treeitem")).toHaveLength(
			RESOURCE_KINDS.length,
		)
		await expect(
			canvas.getByRole("treeitem", { name: "folder" }),
		).toHaveAttribute("aria-expanded", "false")
		await expect(
			canvas.getByRole("treeitem", { name: "file" }),
		).toHaveAttribute("aria-selected", "true")
		await expect(
			canvas.getByRole("treeitem", { name: "bookmark" }),
		).toHaveAttribute("aria-selected", "false")
	},
})

export const WithIcons = meta.story({
	args: {
		renderIcon: (item) => KIND_ICONS[item.kind],
	},
	parameters: {
		docs: {
			description: {
				story:
					"`renderIcon` replaces the built-in folder/file glyphs with the shared `Icons` set, keyed by kind so every union member is covered. Check that a custom glyph inherits the row colour and stays inside the 20px icon slot so the labels of sibling rows still line up, and that the icon adds nothing to the row's accessible name — the slot is `aria-hidden`, the label alone names the row.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("treeitem", { name: /^Brief/ })).toBeVisible()
	},
})

export const WithMenu = meta.story({
	args: {
		renderMenu: (item, controls) => (
			<div className="flex flex-col gap-0.5">
				<button
					type="button"
					onClick={controls.rename}
					className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					Rename
				</button>
				<button
					type="button"
					onClick={controls.close}
					className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					Duplicate {item.kind}
				</button>
			</div>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"`renderMenu` replaces the single built-in Rename entry with a host-supplied action list, receiving `close` and `rename` so a custom item can still drive the component's own rename flow. Editable rows only — `ReadOnly` renders no trigger at all, so there is nothing for this prop to fill. Check that opening the menu moves focus onto its first action, so the keyboard never lands on an empty panel.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Actions for Brief" })
		await expect(trigger).toBeInTheDocument()

		await userEvent.click(trigger)
		const rename = await within(document.body).findByRole("button", {
			name: "Rename",
		})
		await waitFor(() => expect(rename).toHaveFocus())
	},
})
