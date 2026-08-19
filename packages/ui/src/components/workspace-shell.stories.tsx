import { type ReactNode, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
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
import {
	BotSettingsPanel,
	type BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel"
import { Button } from "@workspace/ui/components/button"
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

/** One bot, which is what a roster panel needs to render a row rather than its
 * empty copy. */
const ROSTER: AgentSidebarBot[] = [
	{
		id: "atlas",
		name: "Atlas",
		title: "Research",
		animal: "owl",
		blot: "sky",
		lastMessage: ANSWER,
	},
]

const SETTINGS: BotSettingsValue = {
	identity: { animal: "owl", blot: "sky" },
	name: "Atlas",
	title: "Research",
	instructions: "Say which file you would touch, then the change.",
	model: "sonnet",
	workingDirectory: "/Users/ada/Projects/opennest",
}

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

const chat = (leading?: ReactNode, trailing?: ReactNode) => (
	<ChatLayout
		header={
			<AppHeader
				leading={leading}
				trailing={
					<>
						<ConnectionStatus state="ready" version="2.1.233" />
						{trailing}
					</>
				}
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

const SETTINGS_LABEL = "Bot settings"

const settingsPanel = (onClose: () => void) => (
	<BotSettingsPanel
		models={[{ label: "Claude Sonnet", value: "sonnet" }]}
		onAvatarUpload={fn()}
		onBrowseWorkingDirectory={fn()}
		onClose={onClose}
		onConfirmingDeleteChange={fn()}
		onDelete={fn()}
		onValueChange={fn()}
		value={SETTINGS}
	/>
)

/** The composition the desktop app runs. The settings column exists only while it
 * is open — there is no rail — so the gear that brings it back lives in the
 * conversation's own bar, where the reader is looking when they want it. */
const SettingsWorkspace = () => {
	const [isOpen, setIsOpen] = useState(false)

	return (
		<WorkspaceShell
			defaultOpen
			panel={isOpen ? settingsPanel(() => setIsOpen(false)) : null}
			sidebar={<AgentSidebar bots={ROSTER} selectedBotId="atlas" />}
		>
			{chat(
				undefined,
				<Button
					aria-expanded={isOpen}
					aria-label={SETTINGS_LABEL}
					onClick={() => setIsOpen(!isOpen)}
					size="icon-sm"
					tooltip={SETTINGS_LABEL}
					variant="ghost"
				>
					<Icons.Settings aria-hidden="true" />
				</Button>,
			)}
		</WorkspaceShell>
	)
}

const meta = preview.meta({
	title: "Layout/WorkspaceShell",
	component: WorkspaceShell,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The application shell: a full-height sidebar column, the main column beside it, and an optional panel column after it. It is a thin composition over the sidebar foundation — the provider owns the open state and the Cmd/Ctrl+B shortcut, each panel owns its own collapse, and the shell only hands the room that is left to the main slot. Whatever fills that slot keeps its own scroll boundary, so a `ChatLayout` still scrolls its transcript alone while the columns on either side stay put.",
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

export const WithPanel = meta.story({
	args: {
		sidebar: <AgentSidebar bots={ROSTER} selectedBotId="atlas" />,
		panel: settingsPanel(fn()),
	},
	parameters: {
		// The destructive button the settings panel ends on, and the same open question
		// its own stories carry: the palette's `destructive` foreground does not clear
		// 4.5:1 on its tinted background yet.
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Three columns: the roster, the conversation, and the settings of the bot it is open on. This is the shape the desktop app runs in. Check that all three reach the full height of the window with no gap under any of them — the row is definite here, so a column that asks for the full height gets the window's and not its own content's — that the main column gives room to the panel rather than scrolling under it, and that the transcript is still the only thing that scrolls. Pick `Default` for the same shell without a trailing column, `PanelToggle` for the panel coming and going.",
			},
		},
	},
	play: async ({ canvas }) => {
		const roster = canvas.getByRole("complementary", { name: "Conversations" })
		const settings = canvas.getByRole("complementary", { name: "Bot settings" })
		const main = canvas.getByRole("main")

		await expect(main.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			roster.getBoundingClientRect().right,
		)
		await expect(settings.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			main.getBoundingClientRect().right,
		)
		await expect(settings.getBoundingClientRect().height).toBe(
			main.getBoundingClientRect().height,
		)
		// The row is what makes a column full height, so the panel reaches the bottom
		// of the window rather than the bottom of its own content.
		await expect(settings.getBoundingClientRect().height).toBe(
			window.innerHeight,
		)
		await expect(settings.getBoundingClientRect().bottom).toBe(
			window.innerHeight,
		)
	},
})

export const PanelToggle = meta.story({
	render: () => <SettingsWorkspace />,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The settings column coming and going. Closed, it is not a rail and not a strip — it is not there, so the conversation has every pixel to the right of the roster and there is no second bot avatar on the screen beside the one in the list. The gear in the conversation's bar is the only way back in, and it says whether the column is open. Check that opening it takes exactly the panel's width off the conversation and gives it back on close, and that the close button inside the panel and the gear outside it are the same switch. Pick `WithPanel` for the open column measured on its own.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const gear = canvas.getByRole("button", { name: SETTINGS_LABEL })
		const main = canvas.getByRole("main")
		const closedWidth = main.getBoundingClientRect().width

		await expect(gear).toHaveAttribute("aria-expanded", "false")
		await expect(
			canvas.queryByRole("complementary", { name: SETTINGS_LABEL }),
		).toBeNull()
		// The roster draws the only bots on the screen while the settings are away:
		// every avatar there is belongs to a row of it.
		const outside = Array.from(
			canvasElement.querySelectorAll('[data-slot="bot-identity-avatar"]'),
		).filter((avatar) => !avatar.closest('[data-slot="sidebar"]'))
		await expect(outside).toHaveLength(0)

		await userEvent.click(gear)
		const panel = canvas.getByRole("complementary", { name: SETTINGS_LABEL })
		const panelWidth = panel.getBoundingClientRect().width
		await expect(gear).toHaveAttribute("aria-expanded", "true")
		await expect(main.getBoundingClientRect().width).toBeCloseTo(
			closedWidth - panelWidth,
			0,
		)

		await userEvent.click(
			within(panel).getByRole("button", { name: `Close ${SETTINGS_LABEL}` }),
		)
		await expect(
			canvas.queryByRole("complementary", { name: SETTINGS_LABEL }),
		).toBeNull()
		await expect(main.getBoundingClientRect().width).toBeCloseTo(closedWidth, 0)

		// Reopening lands on the same width: the column takes it on the frame it
		// mounts, so there is no entrance to wait out and no width left owed from the
		// close before it.
		await userEvent.click(gear)
		await expect(
			canvas
				.getByRole("complementary", { name: SETTINGS_LABEL })
				.getBoundingClientRect().width,
		).toBe(panelWidth)

		await userEvent.click(gear)
		await expect(
			canvasElement.querySelectorAll('[data-slot="bot-settings-panel"]'),
		).toHaveLength(0)
		await expect(main.getBoundingClientRect().width).toBe(closedWidth)
	},
})
