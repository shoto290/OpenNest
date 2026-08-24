"use client"

import type { TFunction } from "i18next"
import { memo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

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
	AnimatedSidebarFooter,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
	type AnimatedSidebarProps,
} from "@workspace/ui/components/motion/animated-sidebar"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"
import {
	UserChip,
	type UserChipIdentity,
} from "@workspace/ui/components/user-chip"

const WINDOW_CONTROLS_INSET =
	"h-12 flex-row items-center justify-end px-2.5 py-0 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"

const ROW_AVATAR_SIZE = 40
const TIMESTAMP_SLOT =
	"ml-auto h-5 w-11 shrink-0 truncate text-right text-[11px] text-muted-foreground leading-5 tabular-nums"

const NAME_LINE = "flex h-5 min-w-0 items-center gap-1.5"
const TITLE_BADGE =
	"max-w-16 shrink-0 truncate rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-sidebar-foreground/80 leading-none"

const PREVIEW_LINE = "h-4 truncate text-muted-foreground text-xs leading-4"

const ROW = "py-2 aria-expanded:bg-sidebar-accent/70"

const FOOTER_INSET =
	"flex-row items-center group-data-[state=collapsed]/sidebar:flex-col-reverse group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:px-0"

const FOOTER_SLOT = "shrink-0 empty:hidden"

const EMPTY_COPY =
	"px-3 py-6 text-center text-sidebar-foreground/70 text-sm group-data-[state=collapsed]/sidebar:hidden"

type AgentSidebarStatus = "idle" | "working"

interface AgentSidebarBot {
	id: string
	name: string
	title?: string
	lastMessage?: string
	timestamp?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	image?: string
	status?: AgentSidebarStatus
	pose?: BotWorkingKind
}

const poseOf = (bot: AgentSidebarBot) => bot.pose ?? "thinking"

const isBusy = (bot: AgentSidebarBot) => bot.status === "working"

const announcementFor = (t: TFunction<"bots">, bot?: AgentSidebarBot) => {
	if (!bot) return t("roster.announcement.none")
	return t("roster.announcement.selected", {
		name: bot.name,
		state: isBusy(bot) ? t(`roster.pose.${poseOf(bot)}`) : t("roster.idle"),
	})
}

interface BotRosterRowProps {
	bot: AgentSidebarBot
	isSelected: boolean
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onDelete?: (id: string) => void
}

const BotRosterRow = ({
	bot,
	isSelected,
	onSelect,
	onEdit,
	onDuplicate,
	onDelete,
}: BotRosterRowProps) => {
	const { t } = useTranslation("bots")
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
								name={bot.name}
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
								<span
									className={TIMESTAMP_SLOT}
									data-slot="roster-row-timestamp"
								>
									{bot.timestamp}
								</span>
							</span>
							<span className={PREVIEW_LINE} data-slot="roster-row-preview">
								{working
									? t("roster.working", { pose: t(`roster.pose.${pose}`) })
									: bot.lastMessage}
							</span>
						</span>
					</AnimatedSidebarMenuButton>
				</ContextMenuTrigger>
				<ContextMenuContent ariaLabel={t("roster.actions", { name: bot.name })}>
					<ContextMenuItem onSelect={() => onEdit?.(bot.id)}>
						<Icons.Settings aria-hidden="true" className="size-3.5" />
						{t("roster.settings")}
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => onDuplicate?.(bot.id)}>
						<Icons.Copy aria-hidden="true" className="size-3.5" />
						{t("roster.duplicate")}
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => onDelete?.(bot.id)}
						tone="destructive"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("roster.delete")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</AnimatedSidebarMenuItem>
	)
}

type AgentSidebarPanelProps = Omit<
	AnimatedSidebarProps,
	"ariaLabel" | "children" | "collapsible"
>

interface AgentSidebarProps extends AgentSidebarPanelProps {
	bots: AgentSidebarBot[]
	selectedBotId?: string
	onSelectBot?: (id: string) => void
	onCreateBot?: () => void
	onEditBot?: (id: string) => void
	onDuplicateBot?: (id: string) => void
	onDeleteBot?: (id: string) => void
	footer?: ReactNode
	user?: UserChipIdentity
	onOpenUserSettings?: () => void
}

const AgentSidebarBase = ({
	bots: roster,
	selectedBotId: selectedId,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDuplicateBot,
	onDeleteBot,
	footer,
	user,
	onOpenUserSettings,
	...panel
}: AgentSidebarProps) => {
	const { t } = useTranslation("bots")
	const selectedBot = roster.find((bot) => bot.id === selectedId)
	const createLabel = t("roster.create")

	return (
		<>
			<AnimatedSidebar
				{...panel}
				aria-busy={roster.some(isBusy)}
				ariaLabel={t("roster.label")}
				collapsible="icon"
			>
				<AnimatedSidebarHeader className={WINDOW_CONTROLS_INSET}>
					<Button
						aria-label={createLabel}
						onClick={onCreateBot}
						size="icon-sm"
						tooltip={createLabel}
						tooltipSide="bottom"
						variant="ghost"
					>
						<Icons.Add aria-hidden="true" />
					</Button>
				</AnimatedSidebarHeader>
				<AnimatedSidebarContent className="pt-0 group-data-[state=collapsed]/sidebar:px-0">
					{roster.length === 0 ? (
						<p className={EMPTY_COPY}>{t("roster.empty")}</p>
					) : (
						<AnimatedSidebarMenu>
							{roster.map((bot) => (
								<BotRosterRow
									bot={bot}
									isSelected={bot.id === selectedId}
									key={bot.id}
									onDelete={onDeleteBot}
									onDuplicate={onDuplicateBot}
									onEdit={onEditBot}
									onSelect={onSelectBot}
								/>
							))}
						</AnimatedSidebarMenu>
					)}
				</AnimatedSidebarContent>
				{user || footer ? (
					<AnimatedSidebarFooter className={FOOTER_INSET}>
						{user ? (
							<UserChip
								image={user.image}
								name={user.name}
								onOpen={onOpenUserSettings}
							/>
						) : null}
						<span className={FOOTER_SLOT}>{footer}</span>
					</AnimatedSidebarFooter>
				) : null}
			</AnimatedSidebar>
			<span className="sr-only" role="status">
				{announcementFor(t, selectedBot)}
			</span>
		</>
	)
}

const AgentSidebar = memo(AgentSidebarBase)

export {
	AgentSidebar,
	type AgentSidebarBot,
	type AgentSidebarProps,
	type BotAvatarBlot,
	type UserChipIdentity,
}
