import type { ReactNode } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { FRAME_POLL, settled } from "@workspace/storybook/story-utils"
import {
	AgentSidebar,
	type AgentSidebarBot,
} from "@workspace/ui/components/agents/agent-sidebar"
import {
	AISidebar,
	type SidebarResource,
} from "@workspace/ui/components/agents/ai-sidebar"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import {
	AssistantTurn,
	CHAT_AVATAR_SIZE,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarGroup,
	AnimatedSidebarGroupContent,
	AnimatedSidebarGroupLabel,
	AnimatedSidebarHeader,
	AnimatedSidebarRail,
	AnimatedSidebarTrigger,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH_STEP,
} from "@workspace/ui/components/motion/animated-sidebar"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { SidebarToggle } from "@workspace/ui/components/sidebar-toggle"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const ROSTER: AgentSidebarBot[] = [
	{
		id: "atlas",
		name: "Atlas",
		title: "Research",
		animal: "owl",
		blot: "blue",
		lastMessage: ANSWER,
	},
]

const SESSIONS: SidebarResource[] = [
	{
		id: "workspace",
		label: "Workspace",
		kind: "folder",
		children: [{ id: "workspace-brief", label: "Brief", kind: "file" }],
	},
]

const SIDEBAR = (
	<AnimatedSidebar ariaLabel="Workspace">
		<AnimatedSidebarHeader>
			<AnimatedSidebarTrigger aria-label="Toggle workspace">
				<Icons.More className="size-4" />
			</AnimatedSidebarTrigger>
		</AnimatedSidebarHeader>
		<AnimatedSidebarContent>
			<AnimatedSidebarGroup>
				<AnimatedSidebarGroupLabel>Sessions</AnimatedSidebarGroupLabel>
				<AnimatedSidebarGroupContent>
					<AISidebar ariaLabel="Sessions" defaultItems={SESSIONS} isReadOnly />
				</AnimatedSidebarGroupContent>
			</AnimatedSidebarGroup>
		</AnimatedSidebarContent>
		<AnimatedSidebarRail />
	</AnimatedSidebar>
)

const chat = (leading?: ReactNode) => (
	<ChatLayout
		header={
			<AppHeader
				leading={leading}
				trailing={<ConnectionStatus state="ready" version="2.1.233" />}
			/>
		}
		composer={<PromptInput onSubmit={fn()} />}
	>
		<UserTurn>How is this workspace laid out?</UserTurn>
		<AssistantTurn
			copyText={ANSWER}
			avatar={<BotAvatar animated={false} size={CHAT_AVATAR_SIZE} />}
		>
			{ANSWER}
		</AssistantTurn>
	</ChatLayout>
)

const CHAT = chat()

const CHAT_WITH_TRIGGER = chat(<SidebarToggle />)

const meta = preview.meta({
	title: "Layout/WorkspaceShell",
	component: WorkspaceShell,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The application shell: a full-height sidebar column and the main column beside it. It is a thin composition over the sidebar foundation — the provider owns the open state and the Cmd/Ctrl+B shortcut, the sidebar owns its own collapse, and the shell only hands the room that is left to the main slot. Whatever fills that slot keeps its own scroll boundary, so a `ChatLayout` still scrolls its transcript alone while the columns on either side stay put.",
			},
		},
	},
	args: {
		children: CHAT,
	},
})

export const Default = meta.story({
	args: {
		sidebar: SIDEBAR,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The nominal workspace: an expanded sidebar holding the session tree, and a live conversation in the main column. Check that the transcript takes the whole room the panel leaves it and starts where the panel ends rather than running under it, that only the transcript scrolls — the sidebar, the bar above it and the composer stay put — and that Tab reaches the sidebar trigger before the transcript. Pick `Collapsed` for the icon rail, `Empty` for the shell with no sidebar at all.",
			},
		},
	},
	play: async ({ canvas }) => {
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })
		await expect(sidebar).toBeVisible()
		await expect(canvas.getByRole("main")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Prompt" })).toBeVisible()

		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const column = canvas.getByRole("log")
		await expect(viewport.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			sidebar.getBoundingClientRect().right,
		)
		await expect(column.clientWidth).toBe(viewport.clientWidth)
		await expect(viewport.clientHeight).toBeLessThan(window.innerHeight)
		await expect(getComputedStyle(viewport).overflowY).toBe("auto")
	},
})

export const Collapsed = meta.story({
	args: {
		sidebar: SIDEBAR,
		defaultOpen: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same workspace opened with the sidebar already collapsed, which is how a host restores a remembered choice through `defaultOpen`. Check that the main column takes the room the panel gave up rather than leaving a gap beside the rail, that the trigger stays on the rail and reports `aria-expanded=false`, and that expanding it widens the panel while the conversation reflows without reloading. The session tree hides itself on the rail — that is the panel's own collapse behaviour, not the shell's. Check too that the main column keeps its full height across both widths. Pick `Default` for the expanded panel, `OffCanvas` for the drawer a narrow window gets instead.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Toggle workspace" })
		const main = canvas.getByRole("main")
		const mainHeight = main.getBoundingClientRect().height

		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		await expect(main.getBoundingClientRect().height).toBe(mainHeight)
	},
})

export const OffCanvas = meta.story({
	globals: { viewport: { value: "mobile" } },
	args: {
		children: CHAT_WITH_TRIGGER,
		sidebar: <AgentSidebar bots={ROSTER} selectedBotId="atlas" />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same shell on a window too narrow for two columns, where the panel stops being a column and becomes a drawer over the page. Check that the conversation keeps the whole width until the trigger in the bar opens the drawer, that the drawer slides in over the transcript with the scrim dimming it rather than pushing it aside, and that Escape closes it and puts focus back on the trigger that opened it. The page underneath keeps its full height throughout — the drawer must never resize the column it covers. Pick `Default` for the two-column shell.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const overlay = within(document.body)
		const trigger = canvas.getByRole("button", { name: "Toggle sidebar" })
		const main = canvas.getByRole("main")
		const mainHeight = main.getBoundingClientRect().height

		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(canvas.queryByRole("complementary")).toBeNull()

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		const drawer = overlay.getByRole("dialog", { name: "Conversations" })
		const scrim = overlay.getByRole("button", { name: "Close sidebar" })
		await settled(drawer)
		await expect(scrim).toBeVisible()
		await expect(drawer.getBoundingClientRect().left).toBeCloseTo(0, 0)
		await expect(main.getBoundingClientRect().height).toBe(mainHeight)

		await waitFor(async () => {
			await expect(drawer.contains(document.activeElement)).toBe(true)
		}, FRAME_POLL)

		await userEvent.keyboard("{Escape}")
		await expect(trigger).toHaveFocus()
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(main.getBoundingClientRect().height).toBe(mainHeight)

		await settled(document.body)
	},
})

export const Empty = meta.story({
	args: {
		children: null,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Both slots empty: no sidebar, no main content. Check that the main column still fills the viewport on its own background, with no leftover rail, gutter or seam on the leading edge where the sidebar would sit — an omitted sidebar must cost nothing rather than collapse the row. Pick `Default` for the populated shell.",
			},
		},
	},
	play: async ({ canvas }) => {
		const main = canvas.getByRole("main")
		await expect(main).toBeVisible()
		await expect(canvas.queryByRole("complementary")).toBeNull()
	},
})

const WIDER_BY = 60

const handleIn = (canvas: ReturnType<typeof within>) =>
	canvas.getByRole("separator", { name: "Resize sidebar" })

const widthOf = (element: HTMLElement) =>
	Math.round(element.getBoundingClientRect().width)

const expectWidth = async (sidebar: HTMLElement, expected: number) => {
	await waitFor(async () => {
		await expect(widthOf(sidebar)).toBe(expected)
	}, FRAME_POLL)
}

interface PointerStep {
	coords?: { clientX: number; clientY: number }
	keys?: string
	target?: HTMLElement
}

interface DragParams {
	by: number
	handle: HTMLElement
	pointer: (steps: PointerStep[]) => Promise<void>
}

const gripCenter = (handle: HTMLElement) => {
	const grip = handle.getBoundingClientRect()
	return {
		clientX: grip.left + grip.width / 2,
		clientY: grip.top + grip.height / 2,
	}
}

const dragHandleBy = async ({ by, handle, pointer }: DragParams) => {
	const from = gripCenter(handle)
	const to = { clientX: from.clientX + by, clientY: from.clientY }
	await pointer([
		{ keys: "[MouseLeft>]", target: handle, coords: from },
		{ coords: to },
		{ keys: "[/MouseLeft]", coords: to },
	])
}

export const Resized = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a reader drags the panel's inner edge to give the sidebar more room. Check that the panel tracks the pointer live with no spring lag behind it, that the page stops selecting text mid-drag, and that the width is reported once on release rather than on every frame. Pick `ResizeBounds` for a pointer that runs past the limits, `ResizeReset` for the double-click that puts the default back.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })
		const widened = widthOf(sidebar) + WIDER_BY

		await dragHandleBy({ by: WIDER_BY, handle, pointer: userEvent.pointer })

		await expectWidth(sidebar, widened)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(1)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(widened)
		await expect(handle).toHaveAttribute("aria-valuenow", String(widened))
	},
})

export const ResizeBounds = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the pointer runs far past either limit — a reader dragging the edge to the window border. Check that the panel stops at 12rem on the way in and at 26rem on the way out instead of following the pointer, and that the reported width is the bound rather than the raw pointer distance. Pick `Resized` for a drag that stays inside the range.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })

		await dragHandleBy({
			by: -window.innerWidth,
			handle,
			pointer: userEvent.pointer,
		})
		await expectWidth(sidebar, SIDEBAR_MIN_WIDTH)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(SIDEBAR_MIN_WIDTH)

		await dragHandleBy({
			by: window.innerWidth,
			handle,
			pointer: userEvent.pointer,
		})
		await expectWidth(sidebar, SIDEBAR_MAX_WIDTH)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(SIDEBAR_MAX_WIDTH)
		await expect(handle).toHaveAttribute(
			"aria-valuemax",
			String(SIDEBAR_MAX_WIDTH),
		)
	},
})

export const ResizeReset = meta.story({
	args: {
		sidebar: SIDEBAR,
		defaultWidth: SIDEBAR_DEFAULT_WIDTH,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a reader has dragged the panel somewhere they regret: a double-click on the handle puts the default width back and reports it. Check that the panel returns to `defaultWidth` in one move and that no width is reported for the two clicks that make up the double-click. Pick `Resized` for the drag itself.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })

		await dragHandleBy({
			by: -window.innerWidth,
			handle,
			pointer: userEvent.pointer,
		})
		await expectWidth(sidebar, SIDEBAR_MIN_WIDTH)

		await userEvent.dblClick(handle)
		await expectWidth(sidebar, SIDEBAR_DEFAULT_WIDTH)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(2)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			SIDEBAR_DEFAULT_WIDTH,
		)
	},
})

export const ResizeAbandoned = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the pointer stream dies mid-drag — the window manager or the desktop shell takes the pointer over and no release ever reaches the page. Check that the panel stops following at once and keeps the last width it followed, rather than throwing the drag away and snapping back to the width it had before the press. Pick `Resized` for the drag that ends properly.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })
		const start = widthOf(sidebar)
		const from = gripCenter(handle)

		const abandoned = start + WIDER_BY

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", target: handle, coords: from },
			{ coords: { clientX: from.clientX + WIDER_BY, clientY: from.clientY } },
		])
		await expectWidth(sidebar, abandoned)

		handle.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }))
		await expectWidth(sidebar, abandoned)

		await userEvent.pointer([
			{
				coords: { clientX: from.clientX + WIDER_BY * 2, clientY: from.clientY },
			},
			{ keys: "[/MouseLeft]" },
		])
		await expectWidth(sidebar, abandoned)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(1)
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(abandoned)
	},
})

export const ResizeByKeyboard = meta.story({
	args: {
		sidebar: SIDEBAR,
		onWidthChange: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the reader never touches a pointer: the handle takes focus and the arrow keys move the width one step at a time. Check that the handle is reachable and shows its focus line, that ArrowRight widens and ArrowLeft narrows by one step, and that each press reports the new width. Check too that a collapsed panel offers no handle at all — `Collapsed` covers that.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const handle = handleIn(canvas)
		const sidebar = canvas.getByRole("complementary", { name: "Workspace" })
		const start = widthOf(sidebar)

		handle.focus()
		await expect(handle).toHaveFocus()

		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(
			start + SIDEBAR_WIDTH_STEP,
		)

		await userEvent.keyboard("{ArrowLeft}")
		await expect(args.onWidthChange).toHaveBeenLastCalledWith(start)
		await expect(args.onWidthChange).toHaveBeenCalledTimes(2)

		await expectWidth(sidebar, start)
	},
})
