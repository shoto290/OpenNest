"use client"

import { memo } from "react"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
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
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"

const PANEL_LABEL = "Conversations"
const CREATE_LABEL = "New bot"
const EMPTY_LABEL = "No bots yet"
const WINDOW_CONTROLS_INSET =
	"h-12 flex-row items-center justify-end px-2 py-0 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"

/** Fixed slots: the avatar box and the timestamp box never resize, so a name,
 * a badge and a timestamp land on the same x on every row. The avatar keeps this
 * size whatever it draws — an animal, or a picture the reader uploaded. The
 * timestamp rides the end of the name line and holds its box whether or not the
 * row carries a time, so it is the name that gives way, never the time. */
const ROW_AVATAR_SIZE = 40
const TIMESTAMP_SLOT =
	"ml-auto h-5 w-11 shrink-0 truncate text-right text-[11px] text-muted-foreground leading-5 tabular-nums"

/** The name line carries the name, the badge and the timestamp, and keeps its
 * height whichever of them the row has — which is what holds the second line
 * — and the row below it — on the same baseline. */
const NAME_LINE = "flex h-5 min-w-0 items-center gap-1.5"
const TITLE_BADGE =
	"max-w-16 shrink-0 truncate rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-sidebar-foreground/80 leading-none"

/** The second line has the whole text column to itself, and keeps its height
 * with or without a message. */
const PREVIEW_LINE = "h-4 truncate text-muted-foreground text-xs leading-4"

/** The row is the only trigger the actions have, so it says it carries them
 * and lights up while they are open. */
const ROW = "py-2 aria-expanded:bg-sidebar-accent/70"

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
	/** The tint drawn behind the animal — what tells two rows apart at a glance. */
	blot?: BotAvatarBlot
	/** A picture the reader uploaded, already a URL the host is happy to load. It
	 * wins over the animal and never animates — the activity dot is what says the
	 * bot is busy. */
	image?: string
	status?: AgentSidebarStatus
	/** What the bot is busy with while `status` is `working`. */
	pose?: BotWorkingKind
}

const poseOf = (bot: AgentSidebarBot) => bot.pose ?? "thinking"

const isBusy = (bot: AgentSidebarBot) => bot.status === "working"

const announcementFor = (bot?: AgentSidebarBot) => {
	if (!bot) return "No bot selected"
	return `${bot.name} selected, ${isBusy(bot) ? poseOf(bot) : "idle"}`
}

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
	const pose = poseOf(bot)
	const working = isBusy(bot)

	return (
		<AnimatedSidebarMenuItem>
			<ContextMenu>
				<ContextMenuTrigger>
					<AnimatedSidebarMenuButton
						className={ROW}
						icon={
							<BotIdentityAvatar
								animal={bot.animal}
								blot={bot.blot}
								image={bot.image}
								kind={pose}
								seed={bot.id}
								size={ROW_AVATAR_SIZE}
								working={working}
							/>
						}
						isActive={isSelected}
						isIconDecorative={false}
						label={bot.name}
						onSelect={() => onSelect?.(bot.id)}
					>
						<span className="flex min-w-0 flex-col">
							<span className={NAME_LINE}>
								<span className="truncate" data-slot="roster-row-name">
									{bot.name}
								</span>
								{bot.title ? (
									<span className={TITLE_BADGE} data-slot="roster-row-badge">
										{bot.title}
									</span>
								) : null}
								<span className={TIMESTAMP_SLOT} data-slot="roster-row-timestamp">
									{bot.timestamp}
								</span>
							</span>
							<span className={PREVIEW_LINE} data-slot="roster-row-preview">
								{working ? `${pose}…` : bot.lastMessage}
							</span>
						</span>
					</AnimatedSidebarMenuButton>
				</ContextMenuTrigger>
				<ContextMenuContent ariaLabel={`Actions for ${bot.name}`}>
					<ContextMenuItem onSelect={() => onEdit?.(bot.id)}>
						<Icons.Settings aria-hidden="true" className="size-3.5" />
						Bot settings
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => onDelete?.(bot.id)}
						tone="destructive"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</AnimatedSidebarMenuItem>
	)
}

interface AgentSidebarProps {
	/** The roster, in the order it is read. Empty is a reader who owns no bot, and
	 * the panel says so: there is no bot of its own to fall back on. */
	bots: AgentSidebarBot[]
	/** The selected row. Controlled: the panel never selects on its own. */
	selectedBotId?: string
	onSelectBot?: (id: string) => void
	onCreateBot?: () => void
	onEditBot?: (id: string) => void
	onDeleteBot?: (id: string) => void
}

const AgentSidebarBase = ({
	bots: roster,
	selectedBotId: selectedId,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDeleteBot,
}: AgentSidebarProps) => {
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
						// The header is against the top of the window and the label is taller
						// than the gap above it, so above is off the screen.
						tooltipSide="bottom"
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

export {
	AgentSidebar,
	type AgentSidebarBot,
	type AgentSidebarProps,
	type BotAvatarBlot,
}
