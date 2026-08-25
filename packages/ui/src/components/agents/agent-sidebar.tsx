"use client"

import type { TFunction } from "i18next"
import { useReducedMotion } from "motion/react"
import {
	memo,
	type ReactNode,
	type UIEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
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
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"
import { type Space, spaceAtRank } from "@workspace/ui/components/space"
import {
	SpaceDot,
	SpaceDots,
	SpaceSwitcher,
} from "@workspace/ui/components/space-switcher"
import {
	UserChip,
	type UserChipIdentity,
} from "@workspace/ui/components/user-chip"
import { useSpaceShortcut } from "@workspace/ui/hooks/use-space-shortcut"
import { toPlainText } from "@workspace/ui/lib/plain-text"
import { cn } from "@workspace/ui/lib/utils"

const HEADER =
	"h-12 flex-row items-center justify-end py-0 pr-2.5 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"

const WINDOW_CONTROLS_INSET =
	"pl-[79px] group-data-[state=collapsed]/sidebar:*:hidden"

const NO_WINDOW_CONTROLS_INSET = "pl-2.5"

const ROW_AVATAR_SIZE = 40
const TIMESTAMP_SLOT =
	"ml-auto h-5 w-11 shrink-0 truncate text-right text-[11px] text-muted-foreground leading-5 tabular-nums"

const NAME_LINE = "flex h-5 min-w-0 items-center gap-1.5"
const TITLE_BADGE =
	"max-w-16 shrink-0 truncate rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-sidebar-foreground/80 leading-none"

const PREVIEW_LINE = "h-4 truncate text-muted-foreground text-xs leading-4"

const DESTINATION_NAME = "min-w-0 truncate"

const ROW = "py-2 aria-expanded:bg-sidebar-accent/70"

const FOOTER_INSET = "group-data-[state=collapsed]/sidebar:px-0"

const FOOTER_ROW =
	"flex flex-row items-center gap-2 group-data-[state=collapsed]/sidebar:flex-col-reverse group-data-[state=collapsed]/sidebar:items-center"

const FOOTER_SLOT = "shrink-0 empty:hidden"

const EMPTY_COPY =
	"px-3 py-6 text-center text-sidebar-foreground/70 text-sm group-data-[state=collapsed]/sidebar:hidden"

const CONTENT_INSET = "pt-0 group-data-[state=collapsed]/sidebar:px-0"

const CAROUSEL_CONTENT = "overflow-y-hidden p-0"

const CAROUSEL =
	"flex min-h-0 flex-1 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

const CAROUSEL_SWIPEABLE = "overflow-x-auto"

const CAROUSEL_HELD = "overflow-x-hidden"

const CAROUSEL_PANEL =
	"flex w-full flex-none snap-start snap-always flex-col gap-2 overflow-y-auto overscroll-y-contain px-2 pb-2 group-data-[state=collapsed]/sidebar:px-0"

type AgentSidebarStatus = "idle" | "working"

const NO_BOTS: AgentSidebarBot[] = []

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

interface BotRosterActions {
	onSelectBot?: (id: string) => void
	onEditBot?: (id: string) => void
	onDuplicateBot?: (id: string) => void
	onDuplicateBotToSpace?: (id: string, spaceId: string) => void
	onDeleteBot?: (id: string) => void
}

interface BotRosterRowProps {
	bot: AgentSidebarBot
	isSelected: boolean
	destinations: Space[]
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onDuplicateToSpace?: (id: string, spaceId: string) => void
	onDelete?: (id: string) => void
}

const BotRosterRow = ({
	bot,
	isSelected,
	destinations,
	onSelect,
	onEdit,
	onDuplicate,
	onDuplicateToSpace,
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
									: bot.lastMessage && toPlainText(bot.lastMessage)}
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
					{destinations.length > 0 ? (
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<Icons.Copy aria-hidden="true" className="size-3.5" />
								{t("roster.duplicateTo")}
							</ContextMenuSubTrigger>
							<ContextMenuSubContent>
								{destinations.map((space) => (
									<ContextMenuItem
										key={space.id}
										onSelect={() => onDuplicateToSpace?.(bot.id, space.id)}
										textValue={space.name}
									>
										<SpaceDot colour={space.colour} />
										<span className={DESTINATION_NAME}>{space.name}</span>
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					) : null}
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

interface BotRosterProps extends BotRosterActions {
	bots: AgentSidebarBot[]
	selectedBotId?: string
	destinations: Space[]
}

const BotRoster = ({
	bots,
	selectedBotId,
	destinations,
	onSelectBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onDeleteBot,
}: BotRosterProps) => {
	const { t } = useTranslation("bots")

	if (bots.length === 0)
		return <p className={EMPTY_COPY}>{t("roster.empty")}</p>

	return (
		<AnimatedSidebarMenu>
			{bots.map((bot) => (
				<BotRosterRow
					bot={bot}
					destinations={destinations}
					isSelected={bot.id === selectedBotId}
					key={bot.id}
					onDelete={onDeleteBot}
					onDuplicate={onDuplicateBot}
					onDuplicateToSpace={onDuplicateBotToSpace}
					onEdit={onEditBot}
					onSelect={onSelectBot}
				/>
			))}
		</AnimatedSidebarMenu>
	)
}

const NEIGHBOURING = 1

interface SpacePanelProps {
	spaceId: string
	isInView: boolean
	scrolls: Map<string, number>
	children: ReactNode
}

const SpacePanel = ({
	spaceId,
	isInView,
	scrolls,
	children,
}: SpacePanelProps) => (
	<div
		className={CAROUSEL_PANEL}
		data-slot="space-panel"
		inert={!isInView}
		onScroll={(event) => {
			scrolls.set(spaceId, event.currentTarget.scrollTop)
		}}
		ref={(node) => {
			if (node) node.scrollTop = scrolls.get(spaceId) ?? 0
		}}
	>
		{children}
	</div>
)

interface SpaceCarouselProps {
	spaces: Space[]
	selectedSpaceId?: string
	isSwipeEnabled: boolean
	onSelectSpace?: (id: string) => void
	renderSpace: (space: Space) => ReactNode
}

const SpaceCarousel = ({
	spaces,
	selectedSpaceId,
	isSwipeEnabled,
	onSelectSpace,
	renderSpace,
}: SpaceCarouselProps) => {
	const viewport = useRef<HTMLDivElement>(null)
	const scrolls = useRef(new Map<string, number>()).current
	const isCut = useReducedMotion() ?? false
	const chosen = Math.max(
		spaces.findIndex((space) => space.id === selectedSpaceId),
		0,
	)
	const [restingOn, setRestingOn] = useState(chosen)
	const told = useRef(selectedSpaceId)
	const isMoving = useRef(false)

	const restsOn = Math.min(restingOn, spaces.length - 1)
	const firstDrawn = Math.max(restsOn - NEIGHBOURING, 0)
	const nearby = spaces.slice(firstDrawn, restsOn + NEIGHBOURING + 1)
	const restingSlot = restsOn - firstDrawn
	const chosenSlot = chosen - firstDrawn
	const isBeside = chosenSlot >= 0 && chosenSlot < nearby.length

	useLayoutEffect(() => {
		const node = viewport.current
		if (node) node.scrollLeft = restingSlot * node.clientWidth
	}, [restingSlot])

	useEffect(() => {
		const node = viewport.current
		if (!node || isMoving.current) return
		if (!isBeside || isCut) {
			setRestingOn(chosen)
			return
		}
		const landing = chosenSlot * node.clientWidth
		if (Math.abs(node.scrollLeft - landing) > 1)
			node.scrollTo({ behavior: "smooth", left: landing })
	}, [chosen, chosenSlot, isBeside, isCut])

	const spaceUnder = (node: HTMLDivElement) =>
		firstDrawn + Math.round(node.scrollLeft / node.clientWidth)

	const follow = (event: UIEvent<HTMLDivElement>) => {
		isMoving.current = true
		const crossed = spaces[spaceUnder(event.currentTarget)]
		if (!crossed || crossed.id === told.current) return
		told.current = crossed.id
		if (crossed.id !== selectedSpaceId) onSelectSpace?.(crossed.id)
	}

	const land = (event: UIEvent<HTMLDivElement>) => {
		isMoving.current = false
		const landedOn = spaceUnder(event.currentTarget)
		if (spaces[landedOn]) setRestingOn(landedOn)
	}

	return (
		<div
			className={cn(
				CAROUSEL,
				isSwipeEnabled ? CAROUSEL_SWIPEABLE : CAROUSEL_HELD,
			)}
			data-slot="space-carousel"
			onScroll={follow}
			onScrollEnd={land}
			ref={viewport}
		>
			{nearby.map((space) => (
				<SpacePanel
					isInView={space.id === selectedSpaceId}
					key={space.id}
					scrolls={scrolls}
					spaceId={space.id}
				>
					{renderSpace(space)}
				</SpacePanel>
			))}
		</div>
	)
}

type AgentSidebarPanelProps = Omit<
	AnimatedSidebarProps,
	"ariaLabel" | "children" | "collapsible"
>

interface AgentSidebarProps extends AgentSidebarPanelProps, BotRosterActions {
	bots: AgentSidebarBot[]
	botsBySpaceId?: Record<string, AgentSidebarBot[]>
	selectedBotId?: string
	onCreateBot?: () => void
	spaces?: Space[]
	selectedSpaceId?: string
	isSpaceSwitchingEnabled?: boolean
	onSelectSpace?: (id: string) => void
	onCreateSpace?: () => void
	onOpenSpaceSettings?: () => void
	footer?: ReactNode
	user?: UserChipIdentity
	onOpenUserSettings?: () => void
	insetWindowControls?: boolean
}

const AgentSidebarBase = ({
	bots: roster,
	botsBySpaceId,
	selectedBotId: selectedId,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onDeleteBot,
	spaces = [],
	selectedSpaceId,
	isSpaceSwitchingEnabled = true,
	onSelectSpace,
	onCreateSpace,
	onOpenSpaceSettings,
	footer,
	user,
	onOpenUserSettings,
	insetWindowControls = false,
	...panel
}: AgentSidebarProps) => {
	const { t } = useTranslation("bots")
	const createLabel = t("roster.create")
	const actions: BotRosterActions = {
		onDeleteBot,
		onDuplicateBot,
		onDuplicateBotToSpace,
		onEditBot,
		onSelectBot,
	}

	const rosterOf = (spaceId: string) => botsBySpaceId?.[spaceId] ?? NO_BOTS

	const destinationsFrom = (spaceId?: string) =>
		spaces.filter((space) => space.id !== spaceId)

	const hasRosterPerSpace = Boolean(botsBySpaceId) && spaces.length > 0
	const shown =
		hasRosterPerSpace && selectedSpaceId ? rosterOf(selectedSpaceId) : roster
	const selectedBot = shown.find((bot) => bot.id === selectedId)

	const selectRank = (rank: number) => {
		const space = spaceAtRank(spaces, rank)
		if (space) onSelectSpace?.(space.id)
	}

	useSpaceShortcut({
		count: spaces.length,
		isEnabled: isSpaceSwitchingEnabled,
		onRank: selectRank,
	})

	return (
		<>
			<AnimatedSidebar
				{...panel}
				aria-busy={shown.some(isBusy)}
				ariaLabel={t("roster.label")}
				collapsible="icon"
			>
				<AnimatedSidebarHeader
					className={cn(
						HEADER,
						insetWindowControls
							? WINDOW_CONTROLS_INSET
							: NO_WINDOW_CONTROLS_INSET,
					)}
				>
					<SpaceSwitcher
						onCreateSpace={onCreateSpace}
						onOpenSpaceSettings={onOpenSpaceSettings}
						onSelectSpace={onSelectSpace}
						selectedSpaceId={selectedSpaceId}
						spaces={spaces}
					/>
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
				<AnimatedSidebarContent
					className={hasRosterPerSpace ? CAROUSEL_CONTENT : CONTENT_INSET}
				>
					{hasRosterPerSpace ? (
						<SpaceCarousel
							isSwipeEnabled={isSpaceSwitchingEnabled && spaces.length > 1}
							onSelectSpace={onSelectSpace}
							renderSpace={(space) => (
								<BotRoster
									{...actions}
									bots={rosterOf(space.id)}
									destinations={destinationsFrom(space.id)}
									selectedBotId={selectedId}
								/>
							)}
							selectedSpaceId={selectedSpaceId}
							spaces={spaces}
						/>
					) : (
						<BotRoster
							{...actions}
							bots={roster}
							destinations={destinationsFrom(selectedSpaceId)}
							selectedBotId={selectedId}
						/>
					)}
				</AnimatedSidebarContent>
				{user || footer || spaces.length > 1 ? (
					<AnimatedSidebarFooter className={FOOTER_INSET}>
						<SpaceDots
							onSelectSpace={onSelectSpace}
							selectedSpaceId={selectedSpaceId}
							spaces={spaces}
						/>
						{user || footer ? (
							<span className={FOOTER_ROW}>
								{user ? (
									<UserChip
										image={user.image}
										name={user.name}
										onOpen={onOpenUserSettings}
									/>
								) : null}
								<span className={FOOTER_SLOT}>{footer}</span>
							</span>
						) : null}
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
	type Space,
	type UserChipIdentity,
}
