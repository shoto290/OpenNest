import type { ReactNode } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AgentSidebar } from "@workspace/ui/components/agents/agent-sidebar"
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
} from "@workspace/ui/components/motion/animated-sidebar"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { SidebarToggle } from "@workspace/ui/components/sidebar-toggle"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

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
					"The two-column application shell: a full-height sidebar column and the main column beside it. It is a thin composition over the sidebar foundation — the provider owns the open state and the Cmd/Ctrl+B shortcut, the panel owns its collapse, and the shell only hands the room that is left to the main slot. Whatever fills that slot keeps its own scroll boundary, so a `ChatLayout` still scrolls its transcript alone while the sidebar stays put.",
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
					"The nominal workspace: an expanded sidebar holding the session tree, and a live conversation in the main column. Check that the transcript keeps its centred reading column instead of stretching to the window edge now that the shell is wider than the chat, that only the transcript scrolls — the sidebar, the bar above it and the composer stay put — and that Tab reaches the sidebar trigger before the transcript. Pick `Collapsed` for the icon rail, `Empty` for the shell with no sidebar at all.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("complementary", { name: "Workspace" }),
		).toBeVisible()
		await expect(canvas.getByRole("main")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Prompt" })).toBeVisible()

		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const column = canvas.getByRole("log")
		await expect(viewport.clientWidth).toBeGreaterThan(column.clientWidth)
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
		sidebar: <AgentSidebar lastMessage={ANSWER} name="No Name" />,
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
		await waitFor(
			async () => {
				await expect(drawer).toBeVisible()
				await expect(scrim).toBeVisible()
			},
			{ interval: 10 },
		)
		await expect(drawer.getBoundingClientRect().left).toBeCloseTo(0, 0)
		await expect(main.getBoundingClientRect().height).toBe(mainHeight)

		await waitFor(
			async () => {
				await expect(drawer.contains(document.activeElement)).toBe(true)
			},
			{ interval: 10 },
		)

		await userEvent.keyboard("{Escape}")
		await expect(trigger).toHaveFocus()
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
		await expect(main.getBoundingClientRect().height).toBe(mainHeight)
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
