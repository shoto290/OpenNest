"use client"

import { Menu } from "@base-ui/react/menu"
import { memo, useState } from "react"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
} from "@workspace/ui/components/motion/animated-sidebar"
import { cn } from "@workspace/ui/lib/utils"

const ROW_AVATAR_SIZE = 40
const PANEL_LABEL = "Conversations"
const CREATE_LABEL = "New bot"
const EMPTY_LABEL = "No bots yet"
const SOLO_BOT_ID = "agent"
const AWAITING_READER_STATE = "listening"
const WINDOW_CONTROLS_INSET =
	"h-12 flex-row items-center justify-end px-2 py-0 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"

/** Fixed slots: the avatar box and the timestamp box never resize, so a name,
 * a badge and a timestamp land on the same x on every row. */
const AVATAR_SLOT = "relative block size-10 shrink-0"
const TIMESTAMP_SLOT =
	"h-5 w-11 shrink-0 truncate text-right text-[11px] text-sidebar-foreground/70 leading-5 tabular-nums transition-opacity group-focus-within/roster-row:opacity-0 group-hover/roster-row:opacity-0"

/** The name line keeps its height with or without a badge, which is what holds
 * the second line — and the row below it — on the same baseline. */
const NAME_LINE = "flex h-5 min-w-0 items-center gap-1.5"
const TITLE_BADGE =
	"max-w-16 shrink-0 truncate rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-sidebar-foreground/80 leading-none"
const PREVIEW_LINE = "h-4 truncate text-sidebar-foreground/80 text-xs leading-4"

const ACTIVITY_DOT =
	"absolute right-0 bottom-0 size-2.5 rounded-full bg-sidebar-primary ring-2 ring-sidebar motion-safe:animate-pulse"

const MENU_TRIGGER = cn(
	"absolute top-1.5 right-2 grid size-7 place-items-center rounded-lg text-sidebar-foreground/70 opacity-0 outline-none transition-opacity",
	"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
	"group-focus-within/roster-row:opacity-100 group-hover/roster-row:opacity-100",
	"group-data-[state=collapsed]/sidebar:hidden",
)
const MENU_POPUP =
	"min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
const MENU_ITEM =
	"flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
const MENU_ITEM_DESTRUCTIVE =
	"text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"

/** The mobile drawer opens by transitioning the `visibility` of the layer above
 * this button, and `transition-all` would make the button inherit that
 * transition and stay unfocusable for its whole duration — the drawer moves
 * focus to it the moment it opens, so it transitions colour only. */
const CREATE_BUTTON = "transition-[color,background-color,box-shadow]"

const EMPTY_COPY =
	"px-3 py-6 text-center text-sidebar-foreground/70 text-sm group-data-[state=collapsed]/sidebar:hidden"

type AgentSidebarStatus = "idle" | "working"

interface AgentSidebarBot {
	id: string
	name: string
	/** Short role badge after the name. Leave it out and the row draws no badge
	 * at all, without falling out of line with the rows that have one. */
	title?: string
	/** One line of the last message. Clipped, never wrapped. */
	lastMessage?: string
	/** Already formatted by the host — the panel never reads a clock. */
	timestamp?: string
	animal?: BotAvatarAnimal
	status?: AgentSidebarStatus
	/** What the bot is busy with while `status` is `working`. */
	pose?: BotWorkingKind
}

const busyStateFor = (pose: BotWorkingKind) =>
	pose === "waiting" ? AWAITING_READER_STATE : pose

const poseOf = (bot: AgentSidebarBot) => bot.pose ?? "thinking"

const isBusy = (bot: AgentSidebarBot) => bot.status === "working"

const announcementFor = (bot?: AgentSidebarBot) => {
	if (!bot) return "No bot selected"
	return `${bot.name} selected, ${isBusy(bot) ? poseOf(bot) : "idle"}`
}

interface BotRosterMenuProps {
	bot: AgentSidebarBot
	isOpen: boolean
	onOpenChange: (open: boolean) => void
	onEdit?: (id: string) => void
	onDelete?: (id: string) => void
}

const BotRosterMenu = ({
	bot,
	isOpen,
	onOpenChange,
	onEdit,
	onDelete,
}: BotRosterMenuProps) => (
	<Menu.Root modal={false} onOpenChange={onOpenChange} open={isOpen}>
		<Menu.Trigger
			aria-label={`Actions for ${bot.name}`}
			className={MENU_TRIGGER}
			data-slot="roster-row-actions"
		>
			<Icons.More aria-hidden="true" className="size-4" />
		</Menu.Trigger>
		<Menu.Portal>
			<Menu.Positioner
				align="end"
				className="z-[9999] outline-none"
				side="bottom"
				sideOffset={4}
			>
				<Menu.Popup className={MENU_POPUP}>
					<Menu.Item className={MENU_ITEM} onClick={() => onEdit?.(bot.id)}>
						<Icons.Edit aria-hidden="true" className="size-3.5" />
						Edit
					</Menu.Item>
					<Menu.Item
						className={cn(MENU_ITEM, MENU_ITEM_DESTRUCTIVE)}
						onClick={() => onDelete?.(bot.id)}
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						Delete
					</Menu.Item>
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	</Menu.Root>
)

interface BotRosterRowProps {
	bot: AgentSidebarBot
	isSelected: boolean
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDelete?: (id: string) => void
}

const BotRosterRow = ({
	bot,
	isSelected,
	onSelect,
	onEdit,
	onDelete,
}: BotRosterRowProps) => {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const pose = poseOf(bot)
	const working = isBusy(bot)

	return (
		<AnimatedSidebarMenuItem className="group/roster-row">
			<AnimatedSidebarMenuButton
				className="py-2"
				icon={
					<span className={AVATAR_SLOT}>
						<BotAvatar
							animal={bot.animal}
							size={ROW_AVATAR_SIZE}
							state={working ? busyStateFor(pose) : "waiting"}
						/>
						{working ? (
							<span
								aria-hidden="true"
								className={ACTIVITY_DOT}
								data-slot="roster-row-activity"
							/>
						) : null}
					</span>
				}
				isActive={isSelected}
				isIconDecorative={false}
				label={bot.name}
				onSelect={() => onSelect?.(bot.id)}
			>
				<span className="flex min-w-0 items-start gap-2">
					<span className="flex min-w-0 flex-1 flex-col">
						<span className={NAME_LINE}>
							<span className="truncate" data-slot="roster-row-name">
								{bot.name}
							</span>
							{bot.title ? (
								<span className={TITLE_BADGE} data-slot="roster-row-badge">
									{bot.title}
								</span>
							) : null}
						</span>
						<span className={PREVIEW_LINE} data-slot="roster-row-preview">
							{working ? `${pose}…` : bot.lastMessage}
						</span>
					</span>
					<span
						className={cn(TIMESTAMP_SLOT, isMenuOpen && "opacity-0")}
						data-slot="roster-row-timestamp"
					>
						{bot.timestamp}
					</span>
				</span>
			</AnimatedSidebarMenuButton>
			<BotRosterMenu
				bot={bot}
				isOpen={isMenuOpen}
				onDelete={onDelete}
				onEdit={onEdit}
				onOpenChange={setIsMenuOpen}
			/>
		</AnimatedSidebarMenuItem>
	)
}

interface AgentSidebarProps {
	/** The roster, in the order it is read. */
	bots?: AgentSidebarBot[]
	/** The selected row. Controlled: the panel never selects on its own. */
	selectedBotId?: string
	onSelectBot?: (id: string) => void
	onCreateBot?: () => void
	onEditBot?: (id: string) => void
	onDeleteBot?: (id: string) => void
	/** @deprecated Pass a one-entry `bots` roster instead. */
	status?: AgentSidebarStatus
	/** @deprecated Pass a one-entry `bots` roster instead. */
	pose?: BotWorkingKind
	/** @deprecated Pass a one-entry `bots` roster instead. */
	name?: string
	/** @deprecated Pass a one-entry `bots` roster instead. */
	lastMessage?: string
}

const AgentSidebarBase = ({
	bots,
	selectedBotId,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDeleteBot,
	status = "idle",
	pose = "thinking",
	name = "No Name",
	lastMessage,
}: AgentSidebarProps) => {
	const roster = bots ?? [{ id: SOLO_BOT_ID, name, status, pose, lastMessage }]
	const selectedId = bots ? selectedBotId : SOLO_BOT_ID
	const selectedBot = roster.find((bot) => bot.id === selectedId)

	return (
		<>
			<AnimatedSidebar
				aria-busy={roster.some(isBusy)}
				ariaLabel={PANEL_LABEL}
				collapsible="icon"
			>
				<AnimatedSidebarHeader className={WINDOW_CONTROLS_INSET}>
					<Button
						aria-label={CREATE_LABEL}
						className={CREATE_BUTTON}
						onClick={onCreateBot}
						size="icon-sm"
						tooltip={CREATE_LABEL}
						variant="ghost"
					>
						<Icons.Add aria-hidden="true" />
					</Button>
				</AnimatedSidebarHeader>
				<AnimatedSidebarContent className="pt-0 group-data-[state=collapsed]/sidebar:px-0">
					{roster.length === 0 ? (
						<p className={EMPTY_COPY}>{EMPTY_LABEL}</p>
					) : (
						<AnimatedSidebarMenu>
							{roster.map((bot) => (
								<BotRosterRow
									bot={bot}
									isSelected={bot.id === selectedId}
									key={bot.id}
									onDelete={onDeleteBot}
									onEdit={onEditBot}
									onSelect={onSelectBot}
								/>
							))}
						</AnimatedSidebarMenu>
					)}
				</AnimatedSidebarContent>
			</AnimatedSidebar>
			<span className="sr-only" role="status">
				{announcementFor(selectedBot)}
			</span>
		</>
	)
}

/** Hosts render this from a streaming store, so a shallow compare keeps every token from re-measuring the Motion layout projections inside the panel. */
const AgentSidebar = memo(AgentSidebarBase)

export { AgentSidebar, type AgentSidebarBot, type AgentSidebarProps }
