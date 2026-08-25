"use client"

import type { TFunction } from "i18next"
import { useReducedMotion } from "motion/react"
import {
	memo,
	type ReactNode,
	type UIEvent,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	BotAvatar,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import { BOT_IDENTITY_ANIMALS } from "@workspace/ui/components/bot-settings"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarFooter,
	AnimatedSidebarGroup,
	AnimatedSidebarGroupContent,
	AnimatedSidebarGroupLabel,
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
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
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
	"pl-[78px] group-data-[state=collapsed]/sidebar:*:hidden"

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

const SECTION_GROUP = "px-0 py-0 pt-2"

const SECTION_LABEL =
	"px-0 font-normal text-xs normal-case tracking-normal group-data-[state=collapsed]/sidebar:hidden"

const SECTION_TRIGGER =
	"flex h-7 w-full min-w-0 select-none items-center gap-1 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent/60"

const SECTION_NAME = "min-w-0 truncate"

const SECTION_CHEVRON =
	"ml-auto size-3 shrink-0 text-sidebar-foreground/50 transition-transform duration-150 ease-out motion-reduce:transition-none"

const SECTION_CLOSED = "hidden group-data-[state=collapsed]/sidebar:block"

const SECTION_FIELD =
	"h-7 w-full min-w-0 border-none bg-transparent px-2 text-sidebar-foreground outline-none"

const SECTION_DROP =
	"flex items-center justify-center gap-2 rounded-lg border border-sidebar-border border-dashed px-3 py-3 text-center text-muted-foreground text-xs group-data-[state=collapsed]/sidebar:hidden"

const SECTION_DROP_AVATAR = "block opacity-40"

const DROP_AVATAR_SIZE = 28

const DROP_POSES: BotAvatarState[] = [
	"thinking",
	"searching",
	"working",
	"writing",
	"listening",
]

const drawnFrom = <Item,>(pool: Item[], seed: string) => {
	const total = [...seed].reduce((sum, letter) => sum + letter.charCodeAt(0), 0)
	return pool[total % pool.length]
}

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

const NO_SECTIONS: AgentSidebarSection[] = []

const NO_SECTION = "__none__"

interface AgentSidebarSection {
	id: string
	name: string
}

interface AgentSidebarBot {
	id: string
	name: string
	sectionId?: string | null
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

interface SectionActions {
	onCreateSection?: (name: string, botId?: string) => void
	onRenameSection?: (id: string, name: string) => void
	onReorderSections?: (ids: string[]) => void
	onDeleteSection?: (id: string) => void
	onMoveBotToSection?: (botId: string, sectionId: string | null) => void
}

interface BotSectionBranchProps {
	bot: AgentSidebarBot
	sections: AgentSidebarSection[]
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
}

const BotSectionBranch = ({
	bot,
	sections,
	onMoveToSection,
	onCreateSectionFor,
}: BotSectionBranchProps) => {
	const { t } = useTranslation("bots")

	if (!onMoveToSection && !onCreateSectionFor) return null

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<Icons.Folder aria-hidden="true" className="size-3.5" />
				{t("roster.section.moveTo")}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent>
				<ContextMenuRadioGroup
					onValueChange={(value) =>
						onMoveToSection?.(bot.id, value === NO_SECTION ? null : value)
					}
					value={bot.sectionId ?? NO_SECTION}
				>
					<ContextMenuRadioItem
						textValue={t("roster.section.none")}
						value={NO_SECTION}
					>
						<span className={DESTINATION_NAME}>{t("roster.section.none")}</span>
					</ContextMenuRadioItem>
					{sections.map((section) => (
						<ContextMenuRadioItem
							key={section.id}
							textValue={section.name}
							value={section.id}
						>
							<span className={DESTINATION_NAME}>{section.name}</span>
						</ContextMenuRadioItem>
					))}
				</ContextMenuRadioGroup>
				{onCreateSectionFor ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={() => onCreateSectionFor(bot.id)}
							textValue={t("roster.section.create")}
						>
							<Icons.Add aria-hidden="true" className="size-3.5" />
							{t("roster.section.create")}
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuSubContent>
		</ContextMenuSub>
	)
}

interface BotRosterRowProps {
	bot: AgentSidebarBot
	isSelected: boolean
	destinations: Space[]
	sections: AgentSidebarSection[]
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onDuplicateToSpace?: (id: string, spaceId: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
}

const BotRosterRow = ({
	bot,
	isSelected,
	destinations,
	sections,
	onSelect,
	onEdit,
	onDuplicate,
	onDuplicateToSpace,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
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
					<ContextMenuSeparator />
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
					<BotSectionBranch
						bot={bot}
						onCreateSectionFor={onCreateSectionFor}
						onMoveToSection={onMoveToSection}
						sections={sections}
					/>
					<ContextMenuSeparator />
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

interface SectionLabelProps {
	children: ReactNode
}

const SectionLabel = ({ children }: SectionLabelProps) => (
	<AnimatedSidebarGroupLabel className={SECTION_LABEL}>
		{children}
	</AnimatedSidebarGroupLabel>
)

interface SectionDropZoneProps {
	name: string
}

const SectionDropZone = ({ name }: SectionDropZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className={SECTION_DROP} data-slot="roster-section-drop">
			<span aria-hidden="true" className={SECTION_DROP_AVATAR}>
				<BotAvatar
					animal={drawnFrom(BOT_IDENTITY_ANIMALS, name)}
					animated={false}
					size={DROP_AVATAR_SIZE}
					state={drawnFrom(DROP_POSES, name)}
				/>
			</span>
			{t("roster.section.empty")}
		</div>
	)
}

interface SectionNameFieldProps {
	ariaLabel: string
	initialName: string
	onCommit: (name: string) => void
	onCancel: () => void
}

const SectionNameField = ({
	ariaLabel,
	initialName,
	onCommit,
	onCancel,
}: SectionNameFieldProps) => {
	const [draft, setDraft] = useState(initialName)
	const isSettled = useRef(false)
	const selectAll = useCallback((node: HTMLInputElement | null) => {
		node?.select()
	}, [])

	const settle = () => {
		if (isSettled.current) return
		isSettled.current = true
		const named = draft.trim()
		if (named) onCommit(named)
		else onCancel()
	}

	const abandon = () => {
		isSettled.current = true
		onCancel()
	}

	return (
		<input
			aria-label={ariaLabel}
			className={SECTION_FIELD}
			data-slot="roster-section-field"
			onBlur={settle}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				event.stopPropagation()
				if (event.key === "Enter") settle()
				if (event.key === "Escape") abandon()
			}}
			ref={selectAll}
			value={draft}
		/>
	)
}

interface RosterSectionProps {
	section: AgentSidebarSection
	isFirst: boolean
	isLast: boolean
	onRename?: (id: string, name: string) => void
	onMove?: (id: string, by: number) => void
	onDelete?: (id: string) => void
	children: ReactNode
}

const RosterSection = ({
	section,
	isFirst,
	isLast,
	onRename,
	onMove,
	onDelete,
	children,
}: RosterSectionProps) => {
	const { t } = useTranslation("bots")
	const bodyId = useId()
	const [isRenaming, setIsRenaming] = useState(false)
	const [isOpen, setIsOpen] = useState(true)

	return (
		<AnimatedSidebarGroup className={SECTION_GROUP} data-slot="roster-section">
			<SectionLabel>
				{isRenaming ? (
					<SectionNameField
						ariaLabel={t("roster.section.renameField", { name: section.name })}
						initialName={section.name}
						onCancel={() => setIsRenaming(false)}
						onCommit={(name) => {
							setIsRenaming(false)
							onRename?.(section.id, name)
						}}
					/>
				) : (
					<ContextMenu>
						<ContextMenuTrigger announcesPopup={false}>
							<button
								aria-controls={bodyId}
								aria-expanded={isOpen}
								className={SECTION_TRIGGER}
								onClick={() => setIsOpen((open) => !open)}
								type="button"
							>
								<span className={SECTION_NAME} data-slot="roster-section-name">
									{section.name}
								</span>
								<Icons.Next
									aria-hidden="true"
									className={cn(SECTION_CHEVRON, isOpen && "rotate-90")}
								/>
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent
							ariaLabel={t("roster.section.actions", { name: section.name })}
						>
							<ContextMenuItem onSelect={() => setIsRenaming(true)}>
								<Icons.Edit aria-hidden="true" className="size-3.5" />
								{t("roster.section.rename")}
							</ContextMenuItem>
							<ContextMenuItem
								disabled={isFirst}
								onSelect={() => onMove?.(section.id, -1)}
							>
								<Icons.ArrowUp aria-hidden="true" className="size-3.5" />
								{t("roster.section.moveUp")}
							</ContextMenuItem>
							<ContextMenuItem
								disabled={isLast}
								onSelect={() => onMove?.(section.id, 1)}
							>
								<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
								{t("roster.section.moveDown")}
							</ContextMenuItem>
							<ContextMenuItem
								onSelect={() => onDelete?.(section.id)}
								tone="destructive"
							>
								<Icons.Delete aria-hidden="true" className="size-3.5" />
								{t("roster.section.delete")}
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
			</SectionLabel>
			<AnimatedSidebarGroupContent
				className={isOpen ? undefined : SECTION_CLOSED}
				id={bodyId}
			>
				{children}
			</AnimatedSidebarGroupContent>
		</AnimatedSidebarGroup>
	)
}

const sectionOf = (bot: AgentSidebarBot, known: Set<string>) =>
	bot.sectionId && known.has(bot.sectionId) ? bot.sectionId : null

interface BotRosterProps extends BotRosterActions, SectionActions {
	bots: AgentSidebarBot[]
	selectedBotId?: string
	destinations: Space[]
	sections: AgentSidebarSection[]
}

const BotRoster = ({
	bots,
	selectedBotId,
	destinations,
	sections,
	onSelectBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onDeleteBot,
	onCreateSection,
	onRenameSection,
	onReorderSections,
	onDeleteSection,
	onMoveBotToSection,
}: BotRosterProps) => {
	const { t } = useTranslation("bots")
	const [namingFor, setNamingFor] = useState<string | null>(null)

	const known = new Set(sections.map((section) => section.id))

	const botsUnder = (sectionId: string | null) =>
		bots.filter((bot) => sectionOf(bot, known) === sectionId)

	const moveSection = (id: string, by: number) => {
		const order = sections.map((section) => section.id)
		const at = order.indexOf(id)
		order.splice(at, 1)
		order.splice(at + by, 0, id)
		onReorderSections?.(order)
	}

	const rowsFor = (held: AgentSidebarBot[]) => (
		<AnimatedSidebarMenu>
			{held.map((bot) => (
				<BotRosterRow
					bot={bot}
					destinations={destinations}
					isSelected={bot.id === selectedBotId}
					key={bot.id}
					onCreateSectionFor={onCreateSection ? setNamingFor : undefined}
					onDelete={onDeleteBot}
					onDuplicate={onDuplicateBot}
					onDuplicateToSpace={onDuplicateBotToSpace}
					onEdit={onEditBot}
					onMoveToSection={onMoveBotToSection}
					onSelect={onSelectBot}
					sections={sections}
				/>
			))}
		</AnimatedSidebarMenu>
	)

	if (bots.length === 0 && sections.length === 0)
		return <p className={EMPTY_COPY}>{t("roster.empty")}</p>

	const loose = botsUnder(null)

	return (
		<>
			{loose.length > 0 ? rowsFor(loose) : null}
			{sections.map((section, rank) => {
				const held = botsUnder(section.id)
				return (
					<RosterSection
						isFirst={rank === 0}
						isLast={rank === sections.length - 1}
						key={section.id}
						onDelete={onDeleteSection}
						onMove={moveSection}
						onRename={onRenameSection}
						section={section}
					>
						{held.length > 0 ? (
							rowsFor(held)
						) : (
							<SectionDropZone name={section.name} />
						)}
					</RosterSection>
				)
			})}
			{namingFor ? (
				<AnimatedSidebarGroup className={SECTION_GROUP}>
					<SectionLabel>
						<SectionNameField
							ariaLabel={t("roster.section.createField")}
							initialName=""
							onCancel={() => setNamingFor(null)}
							onCommit={(name) => {
								setNamingFor(null)
								onCreateSection?.(name, namingFor)
							}}
						/>
					</SectionLabel>
				</AnimatedSidebarGroup>
			) : null}
		</>
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

interface AgentSidebarProps
	extends AgentSidebarPanelProps,
		BotRosterActions,
		SectionActions {
	bots: AgentSidebarBot[]
	botsBySpaceId?: Record<string, AgentSidebarBot[]>
	sections?: AgentSidebarSection[]
	sectionsBySpaceId?: Record<string, AgentSidebarSection[]>
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
	sections = NO_SECTIONS,
	sectionsBySpaceId,
	selectedBotId: selectedId,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onDeleteBot,
	onCreateSection,
	onRenameSection,
	onReorderSections,
	onDeleteSection,
	onMoveBotToSection,
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
	const actions: BotRosterActions & SectionActions = {
		onCreateSection,
		onDeleteBot,
		onDeleteSection,
		onDuplicateBot,
		onDuplicateBotToSpace,
		onEditBot,
		onMoveBotToSection,
		onRenameSection,
		onReorderSections,
		onSelectBot,
	}

	const rosterOf = (spaceId: string) => botsBySpaceId?.[spaceId] ?? NO_BOTS

	const sectionsOf = (spaceId: string) =>
		sectionsBySpaceId ? (sectionsBySpaceId[spaceId] ?? NO_SECTIONS) : sections

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
									sections={sectionsOf(space.id)}
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
							sections={sections}
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
	type AgentSidebarSection,
	type BotAvatarBlot,
	type Space,
	type UserChipIdentity,
}
