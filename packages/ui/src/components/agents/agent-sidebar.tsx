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
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import type { BotBadge } from "@workspace/ui/components/badge"
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
import {
	ConversationAvatar,
	type ConversationParticipant,
} from "@workspace/ui/components/conversation-avatar"
import { type Icon, Icons } from "@workspace/ui/components/icons"
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
	useAnimatedSidebar,
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
import {
	dropArea,
	dropAreaAt,
	type Lifter,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
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

const SECTION_GROUP = "px-0 py-0"

const SECTION_SLOT = "mt-2"

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

const DROP_AREA =
	"relative rounded-xl transition-colors duration-150 ease-out motion-reduce:transition-none"

const DROP_AREA_LANDING = "bg-sidebar-accent/60"

const DROP_AREA_LIFTED =
	"pointer-events-none z-10 origin-top scale-90 bg-sidebar shadow-lg translate-y-[var(--lift-dy,0px)]"

const INSERTION_LINE =
	"pointer-events-none absolute inset-x-2 z-20 h-0.5 rounded-full bg-sidebar-primary"

const INSERTION_ABOVE = "-top-1"

const INSERTION_BELOW = "-bottom-1"

const LIFTED_BOT =
	"pointer-events-none fixed top-0 left-0 z-[100] drop-shadow-lg translate-x-[calc(var(--lift-x,0px)-50%)] translate-y-[calc(var(--lift-y,0px)-50%)]"

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

const NO_CONVERSATIONS: AgentSidebarConversation[] = []

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
	badge?: BotBadge
}

interface AgentSidebarConversation {
	id: string
	name: string
	sectionId?: string | null
	participants: AgentSidebarBot[]
	lastMessage?: string
	lastSpeaker?: string
	timestamp?: string
	status?: AgentSidebarStatus
	badge?: BotBadge
}

const poseOf = (bot: AgentSidebarBot) => bot.pose ?? "thinking"

const isBusy = (held: { status?: AgentSidebarStatus }) =>
	held.status === "working"

const badgeOf = (conversation: AgentSidebarConversation) =>
	conversation.participants.find(
		(participant) => isBusy(participant) && participant.badge,
	)?.badge ?? conversation.badge

const workingBotOf = ({
	participants,
	lastSpeaker,
}: AgentSidebarConversation) =>
	participants.find((bot) => isBusy(bot) && bot.name === lastSpeaker) ??
	participants.find(isBusy)

const previewOf = (
	t: TFunction<"bots">,
	conversation: AgentSidebarConversation,
) => {
	const working = workingBotOf(conversation)
	if (working)
		return t("roster.conversation.preview", {
			name: working.name,
			text: t("roster.working", { pose: t(`roster.pose.${poseOf(working)}`) }),
		})
	if (!conversation.lastMessage) return null
	const text = toPlainText(conversation.lastMessage)
	if (!conversation.lastSpeaker) return text
	return t("roster.conversation.preview", {
		name: conversation.lastSpeaker,
		text,
	})
}

const announcementFor = (
	t: TFunction<"bots">,
	bot?: AgentSidebarBot,
	conversation?: AgentSidebarConversation,
) => {
	if (conversation)
		return t("roster.announcement.selected", {
			name: conversation.name,
			state: isBusy(conversation) ? t("roster.pose.working") : t("roster.idle"),
		})
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
	onMoveBotToSpace?: (botId: string, spaceId: string) => void
	onDeleteBot?: (id: string) => void
}

interface SectionActions {
	onCreateSection?: (name: string, botId?: string) => void
	onRenameSection?: (id: string, name: string) => void
	onReorderSections?: (ids: string[]) => void
	onDeleteSection?: (id: string) => void
	onMoveBotToSection?: (botId: string, sectionId: string | null) => void
}

interface SectionBranchProps {
	id: string
	sectionId?: string | null
	sections: AgentSidebarSection[]
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
}

const SectionBranch = ({
	id,
	sectionId,
	sections,
	onMoveToSection,
	onCreateSectionFor,
}: SectionBranchProps) => {
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
						onMoveToSection?.(id, value === NO_SECTION ? null : value)
					}
					value={sectionId ?? NO_SECTION}
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
							onSelect={() => onCreateSectionFor(id)}
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

interface SpaceDestinationBranchProps {
	botId: string
	icon: Icon
	label: string
	destinations: Space[]
	onPick?: (botId: string, spaceId: string) => void
}

const SpaceDestinationBranch = ({
	botId,
	icon: Glyph,
	label,
	destinations,
	onPick,
}: SpaceDestinationBranchProps) => {
	if (!onPick || destinations.length === 0) return null

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<Glyph aria-hidden="true" className="size-3.5" />
				{label}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent>
				{destinations.map((space) => (
					<ContextMenuItem
						key={space.id}
						onSelect={() => onPick(botId, space.id)}
						textValue={space.name}
					>
						<SpaceDot colour={space.colour} />
						<span className={DESTINATION_NAME}>{space.name}</span>
					</ContextMenuItem>
				))}
			</ContextMenuSubContent>
		</ContextMenuSub>
	)
}

interface BotRowAvatarProps {
	bot: AgentSidebarBot
	badge?: BotBadge
}

const BotRowAvatar = ({ bot, badge }: BotRowAvatarProps) => (
	<BotIdentityAvatar
		animal={bot.animal}
		badge={badge}
		blot={bot.blot}
		image={bot.image}
		kind={poseOf(bot)}
		name={bot.name}
		seed={bot.id}
		size={ROW_AVATAR_SIZE}
		working={isBusy(bot)}
	/>
)

interface BotRosterRowProps {
	bot: AgentSidebarBot
	isSelected: boolean
	destinations: Space[]
	sections: AgentSidebarSection[]
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onDuplicateToSpace?: (id: string, spaceId: string) => void
	onMoveToSpace?: (id: string, spaceId: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
	lift: Lifter
}

const BotRosterRow = ({
	bot,
	isSelected,
	destinations,
	sections,
	lift,
	onSelect,
	onEdit,
	onDuplicate,
	onDuplicateToSpace,
	onMoveToSpace,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
}: BotRosterRowProps) => {
	const { t } = useTranslation("bots")
	const pose = poseOf(bot)
	const working = isBusy(bot)

	return (
		<AnimatedSidebarMenuItem data-tauri-drag-region="false">
			<ContextMenu>
				<ContextMenuTrigger>
					<AnimatedSidebarMenuButton
						{...lift.handlersFor(bot.id)}
						className={ROW}
						icon={<BotRowAvatar badge={bot.badge} bot={bot} />}
						isActive={isSelected}
						isIconDecorative={false}
						label={bot.name}
						onSelect={() => {
							if (lift.hasJustDropped()) return
							onSelect?.(bot.id)
						}}
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
					<SectionBranch
						id={bot.id}
						onCreateSectionFor={onCreateSectionFor}
						onMoveToSection={onMoveToSection}
						sectionId={bot.sectionId}
						sections={sections}
					/>
					<SpaceDestinationBranch
						botId={bot.id}
						destinations={destinations}
						icon={Icons.Copy}
						label={t("roster.duplicateTo")}
						onPick={onDuplicateToSpace}
					/>
					<SpaceDestinationBranch
						botId={bot.id}
						destinations={destinations}
						icon={Icons.ArrowRight}
						label={t("roster.moveToSpace")}
						onPick={onMoveToSpace}
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

const heldBotsOf = (
	conversation: AgentSidebarConversation,
): ConversationParticipant[] =>
	conversation.participants.map((participant) => ({
		...participant,
		kind: poseOf(participant),
		working: isBusy(participant),
	}))

interface ConversationRosterActions {
	onSelectConversation?: (id: string) => void
	onOpenConversationSettings?: (id: string) => void
	onDeleteConversation?: (id: string) => void
	onMoveConversationToSection?: (id: string, sectionId: string | null) => void
}

interface ConversationRosterRowProps {
	conversation: AgentSidebarConversation
	isSelected: boolean
	sections: AgentSidebarSection[]
	onSelect?: (id: string) => void
	onOpenSettings?: (id: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	lift: Lifter
}

const ConversationRosterRow = ({
	conversation,
	isSelected,
	sections,
	lift,
	onSelect,
	onOpenSettings,
	onDelete,
	onMoveToSection,
}: ConversationRosterRowProps) => {
	const { t } = useTranslation("bots")

	return (
		<AnimatedSidebarMenuItem data-tauri-drag-region="false">
			<ContextMenu>
				<ContextMenuTrigger>
					<AnimatedSidebarMenuButton
						{...lift.handlersFor(conversation.id)}
						className={ROW}
						icon={
							<ConversationAvatar
								badge={badgeOf(conversation)}
								participants={heldBotsOf(conversation)}
								size={ROW_AVATAR_SIZE}
							/>
						}
						isActive={isSelected}
						isIconDecorative={false}
						label={conversation.name}
						onSelect={() => {
							if (lift.hasJustDropped()) return
							onSelect?.(conversation.id)
						}}
					>
						<span className="flex min-w-0 flex-col">
							<span className={NAME_LINE}>
								<span className="truncate" data-slot="roster-row-name">
									{conversation.name}
								</span>
								<span
									className={TIMESTAMP_SLOT}
									data-slot="roster-row-timestamp"
								>
									{conversation.timestamp}
								</span>
							</span>
							<span className={PREVIEW_LINE} data-slot="roster-row-preview">
								{previewOf(t, conversation)}
							</span>
						</span>
					</AnimatedSidebarMenuButton>
				</ContextMenuTrigger>
				<ContextMenuContent
					ariaLabel={t("roster.actions", { name: conversation.name })}
				>
					<ContextMenuItem onSelect={() => onOpenSettings?.(conversation.id)}>
						<Icons.Settings aria-hidden="true" className="size-3.5" />
						{t("roster.settings")}
					</ContextMenuItem>
					<SectionBranch
						id={conversation.id}
						onMoveToSection={onMoveToSection}
						sectionId={conversation.sectionId}
						sections={sections}
					/>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={() => onDelete?.(conversation.id)}
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

type InsertionEdge = "above" | "below"

interface RosterDropAreaProps {
	landing: string
	isLanding: boolean
	isLifted?: boolean
	insertion?: InsertionEdge
	className?: string
	ref?: (node: HTMLElement | null) => void
	children: ReactNode
}

const RosterDropArea = ({
	landing,
	isLanding,
	isLifted = false,
	insertion,
	className,
	ref,
	children,
}: RosterDropAreaProps) => (
	<div
		{...dropArea(landing)}
		className={cn(
			DROP_AREA,
			isLanding && DROP_AREA_LANDING,
			isLifted && DROP_AREA_LIFTED,
			className,
		)}
		data-slot="roster-drop-area"
		data-tauri-drag-region="false"
		ref={ref}
	>
		{insertion ? (
			<span
				className={cn(
					INSERTION_LINE,
					insertion === "above" ? INSERTION_ABOVE : INSERTION_BELOW,
				)}
				data-slot="roster-insertion"
			/>
		) : null}
		{children}
	</div>
)

interface LiftedRowProps {
	bot?: AgentSidebarBot
	conversation?: AgentSidebarConversation
	ref: (node: HTMLElement | null) => void
}

const LiftedRow = ({ bot, conversation, ref }: LiftedRowProps) => (
	<span
		aria-hidden="true"
		className={LIFTED_BOT}
		data-slot="roster-lifted-bot"
		ref={ref}
	>
		{conversation ? (
			<ConversationAvatar
				participants={heldBotsOf(conversation)}
				size={ROW_AVATAR_SIZE}
			/>
		) : null}
		{bot ? <BotRowAvatar bot={bot} /> : null}
	</span>
)

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
	lift: Lifter
	children: ReactNode
}

const RosterSection = ({
	section,
	isFirst,
	isLast,
	lift,
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
								{...lift.handlersFor(section.id)}
								aria-controls={bodyId}
								aria-expanded={isOpen}
								className={SECTION_TRIGGER}
								onClick={() => {
									if (lift.hasJustDropped()) return
									setIsOpen((open) => !open)
								}}
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

const sectionOf = (held: { sectionId?: string | null }, known: Set<string>) =>
	held.sectionId && known.has(held.sectionId) ? held.sectionId : null

interface BotRosterProps
	extends BotRosterActions,
		ConversationRosterActions,
		SectionActions {
	bots: AgentSidebarBot[]
	conversations: AgentSidebarConversation[]
	selectedBotId?: string
	selectedConversationId?: string
	destinations: Space[]
	sections: AgentSidebarSection[]
}

const BotRoster = ({
	bots,
	conversations,
	selectedBotId,
	selectedConversationId,
	destinations,
	sections,
	onSelectConversation,
	onOpenConversationSettings,
	onDeleteConversation,
	onMoveConversationToSection,
	onSelectBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onMoveBotToSpace,
	onDeleteBot,
	onCreateSection,
	onRenameSection,
	onReorderSections,
	onDeleteSection,
	onMoveBotToSection,
}: BotRosterProps) => {
	const { t } = useTranslation("bots")
	const { isMobile, state } = useAnimatedSidebar()
	const [namingFor, setNamingFor] = useState<string | null>(null)

	const known = new Set(sections.map((section) => section.id))

	const activeBotId = selectedConversationId ? undefined : selectedBotId

	const naming = bots.find((bot) => bot.id === namingFor)

	const botsUnder = (sectionId: string | null) =>
		bots.filter(
			(bot) => bot.id !== namingFor && sectionOf(bot, known) === sectionId,
		)

	const conversationsUnder = (sectionId: string | null) =>
		conversations.filter(
			(conversation) => sectionOf(conversation, known) === sectionId,
		)

	const withoutSection = (id: string) =>
		sections.filter((section) => section.id !== id)

	const placeSection = (id: string, at: number) => {
		const order = withoutSection(id).map((section) => section.id)
		order.splice(at, 0, id)
		if (order.every((held, rank) => held === sections[rank]?.id)) return
		onReorderSections?.(order)
	}

	const moveSection = (id: string, by: number) => {
		const at = sections.findIndex((section) => section.id === id) + by
		if (at < 0 || at >= sections.length) return
		placeSection(id, at)
	}

	const fileRow = (id: string, landing: string) => {
		const sectionId = landing === NO_SECTION ? null : landing
		if (sectionId && !known.has(sectionId)) return
		const conversation = conversations.find((held) => held.id === id)
		if (conversation) {
			if (sectionOf(conversation, known) === sectionId) return
			onMoveConversationToSection?.(id, sectionId)
			return
		}
		const bot = bots.find((held) => held.id === id)
		if (!bot || sectionOf(bot, known) === sectionId) return
		onMoveBotToSection?.(id, sectionId)
	}

	const slots = useRef(new Map<string, HTMLElement>()).current

	const middleOf = (id: string) => {
		const box = slots.get(id)?.getBoundingClientRect()
		return box ? box.top + box.height / 2 : Number.POSITIVE_INFINITY
	}

	const insertionAt = (x: number, y: number, id: string) => {
		const column = slots.get(id)?.parentElement?.getBoundingClientRect()
		if (!column || x < column.left || x > column.right) return null
		return withoutSection(id).filter((section) => middleOf(section.id) < y)
			.length
	}

	const isLiftEnabled = isMobile || state === "expanded"

	const botLift = useRosterLift({
		isEnabled: isLiftEnabled,
		landingAt: dropAreaAt,
		onLand: fileRow,
	})

	const sectionLift = useRosterLift({
		isEnabled: isLiftEnabled,
		landingAt: insertionAt,
		onLand: placeSection,
	})

	const liftedRowId = botLift.lift?.id
	const liftedBot = liftedRowId
		? bots.find((bot) => bot.id === liftedRowId)
		: undefined
	const liftedConversation = liftedRowId
		? conversations.find((held) => held.id === liftedRowId)
		: undefined
	const liftedSectionId = sectionLift.lift?.id
	const landing = botLift.lift?.landing ?? null
	const insertion = sectionLift.lift?.landing ?? null
	const placed = liftedSectionId ? withoutSection(liftedSectionId) : sections
	const insertsBefore = insertion === null ? null : placed[insertion]?.id
	const insertsAfter =
		insertion !== null && insertion >= placed.length
			? placed[placed.length - 1]?.id
			: null

	const rowsFor = (
		heldConversations: AgentSidebarConversation[],
		held: AgentSidebarBot[],
	) => (
		<AnimatedSidebarMenu>
			{heldConversations.map((conversation) => (
				<ConversationRosterRow
					conversation={conversation}
					isSelected={conversation.id === selectedConversationId}
					key={conversation.id}
					lift={botLift}
					onDelete={onDeleteConversation}
					onMoveToSection={onMoveConversationToSection}
					onOpenSettings={onOpenConversationSettings}
					onSelect={onSelectConversation}
					sections={sections}
				/>
			))}
			{held.map((bot) => (
				<BotRosterRow
					bot={bot}
					destinations={destinations}
					isSelected={bot.id === activeBotId}
					key={bot.id}
					lift={botLift}
					onCreateSectionFor={onCreateSection ? setNamingFor : undefined}
					onDelete={onDeleteBot}
					onDuplicate={onDuplicateBot}
					onDuplicateToSpace={onDuplicateBotToSpace}
					onEdit={onEditBot}
					onMoveToSpace={onMoveBotToSpace}
					onMoveToSection={onMoveBotToSection}
					onSelect={onSelectBot}
					sections={sections}
				/>
			))}
		</AnimatedSidebarMenu>
	)

	if (bots.length === 0 && conversations.length === 0 && sections.length === 0)
		return <p className={EMPTY_COPY}>{t("roster.empty")}</p>

	const loose = botsUnder(null)
	const looseConversations = conversationsUnder(null)
	const hasLooseRows = loose.length + looseConversations.length > 0
	const isLifting = Boolean(liftedBot || liftedConversation)

	return (
		<>
			{hasLooseRows || isLifting ? (
				<RosterDropArea isLanding={landing === NO_SECTION} landing={NO_SECTION}>
					{hasLooseRows ? (
						rowsFor(looseConversations, loose)
					) : (
						<SectionDropZone name={t("roster.label")} />
					)}
				</RosterDropArea>
			) : null}
			{sections.map((section, rank) => {
				const held = botsUnder(section.id)
				const heldConversations = conversationsUnder(section.id)
				const hasRows = held.length + heldConversations.length > 0
				const isLifted = section.id === liftedSectionId
				return (
					<RosterDropArea
						className={SECTION_SLOT}
						insertion={
							insertsBefore === section.id
								? "above"
								: insertsAfter === section.id
									? "below"
									: undefined
						}
						isLanding={landing === section.id}
						isLifted={isLifted}
						key={section.id}
						landing={section.id}
						ref={(node) => {
							if (node) slots.set(section.id, node)
							else slots.delete(section.id)
							if (isLifted) sectionLift.followRef(node)
						}}
					>
						<RosterSection
							isFirst={rank === 0}
							isLast={rank === sections.length - 1}
							lift={sectionLift}
							onDelete={onDeleteSection}
							onMove={moveSection}
							onRename={onRenameSection}
							section={section}
						>
							{hasRows ? (
								rowsFor(heldConversations, held)
							) : (
								<SectionDropZone name={section.name} />
							)}
						</RosterSection>
					</RosterDropArea>
				)
			})}
			{naming ? (
				<AnimatedSidebarGroup className={cn(SECTION_GROUP, SECTION_SLOT)}>
					<SectionLabel>
						<SectionNameField
							ariaLabel={t("roster.section.createField")}
							initialName={t("roster.section.createDefault")}
							onCancel={() => setNamingFor(null)}
							onCommit={(name) => {
								setNamingFor(null)
								onCreateSection?.(name, naming.id)
							}}
						/>
					</SectionLabel>
					<AnimatedSidebarGroupContent>
						{rowsFor([], [naming])}
					</AnimatedSidebarGroupContent>
				</AnimatedSidebarGroup>
			) : null}
			{isLifting
				? createPortal(
						<LiftedRow
							bot={liftedBot}
							conversation={liftedConversation}
							ref={botLift.followRef}
						/>,
						document.body,
					)
				: null}
		</>
	)
}

const NEIGHBOURING = 1

const CROSSING = 0.55

const SETTLING = 150

const isFlushWithPanel = (row: HTMLDivElement) => {
	const under = row.children[Math.round(row.scrollLeft / row.clientWidth)]
	if (!under) return false
	const drift =
		under.getBoundingClientRect().left - row.getBoundingClientRect().left
	return Math.abs(drift) <= 1
}

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
	const covering = useRef(chosen)
	const settling = useRef<ReturnType<typeof setTimeout>>(undefined)

	const restsOn = Math.min(restingOn, spaces.length - 1)
	const firstDrawn = Math.max(restsOn - NEIGHBOURING, 0)
	const nearby = spaces.slice(firstDrawn, restsOn + NEIGHBOURING + 1)
	const chosenSlot = chosen - firstDrawn
	const isBeside = chosenSlot >= 0 && chosenSlot < nearby.length

	useLayoutEffect(() => {
		const node = viewport.current
		if (!node) return
		const restingSlot = restsOn - firstDrawn
		node.scrollLeft = restingSlot * node.clientWidth
	}, [restsOn, firstDrawn])

	useEffect(() => {
		const node = viewport.current
		if (!node || chosen === covering.current) return
		if (!isBeside || isCut) {
			setRestingOn(chosen)
			return
		}
		node.scrollTo({ behavior: "smooth", left: chosenSlot * node.clientWidth })
	}, [chosen, chosenSlot, isBeside, isCut])

	const spaceCrossed = (node: HTMLDivElement) => {
		const drifted =
			firstDrawn + node.scrollLeft / node.clientWidth - covering.current
		if (Math.abs(drifted) < CROSSING) return covering.current
		return covering.current + Math.round(drifted)
	}

	const settle = () => {
		const node = viewport.current
		if (!node || !isFlushWithPanel(node)) return
		setRestingOn(covering.current)
	}

	const follow = (event: UIEvent<HTMLDivElement>) => {
		clearTimeout(settling.current)
		settling.current = setTimeout(settle, SETTLING)
		const crossed = spaceCrossed(event.currentTarget)
		if (crossed === covering.current) return
		covering.current = crossed
		const space = spaces[crossed]
		if (space && space.id !== selectedSpaceId) onSelectSpace?.(space.id)
	}

	return (
		<div
			className={cn(
				CAROUSEL,
				isSwipeEnabled ? CAROUSEL_SWIPEABLE : CAROUSEL_HELD,
			)}
			data-slot="space-carousel"
			onScroll={follow}
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

interface CreateMenuProps {
	onCreateBot?: () => void
	onCreateConversation: () => void
}

const CreateMenu = ({ onCreateBot, onCreateConversation }: CreateMenuProps) => {
	const { t } = useTranslation("bots")
	const label = t("roster.createMenu")

	return (
		<ContextMenu>
			<ContextMenuTrigger opensOnPress>
				<Button
					aria-label={label}
					size="icon-sm"
					tooltip={label}
					tooltipSide="bottom"
					variant="ghost"
				>
					<Icons.Add aria-hidden="true" />
				</Button>
			</ContextMenuTrigger>
			<ContextMenuContent ariaLabel={label}>
				<ContextMenuItem onSelect={onCreateBot}>
					<Icons.User aria-hidden="true" className="size-3.5" />
					{t("roster.create")}
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateConversation}>
					<Icons.Message aria-hidden="true" className="size-3.5" />
					{t("roster.conversation.create")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

type AgentSidebarPanelProps = Omit<
	AnimatedSidebarProps,
	"ariaLabel" | "children" | "collapsible"
>

interface AgentSidebarProps
	extends AgentSidebarPanelProps,
		BotRosterActions,
		ConversationRosterActions,
		SectionActions {
	bots: AgentSidebarBot[]
	botsBySpaceId?: Record<string, AgentSidebarBot[]>
	conversations?: AgentSidebarConversation[]
	conversationsBySpaceId?: Record<string, AgentSidebarConversation[]>
	badgesBySpaceId?: Record<string, BotBadge>
	sections?: AgentSidebarSection[]
	sectionsBySpaceId?: Record<string, AgentSidebarSection[]>
	selectedBotId?: string
	selectedConversationId?: string
	onCreateBot?: () => void
	onCreateConversation?: () => void
	spaces?: Space[]
	selectedSpaceId?: string
	isSpaceSwitchingEnabled?: boolean
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
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
	conversations: rooms = NO_CONVERSATIONS,
	conversationsBySpaceId,
	badgesBySpaceId,
	sections = NO_SECTIONS,
	sectionsBySpaceId,
	selectedBotId: selectedId,
	selectedConversationId,
	onSelectConversation,
	onCreateConversation,
	onOpenConversationSettings,
	onDeleteConversation,
	onMoveConversationToSection,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDuplicateBot,
	onDuplicateBotToSpace,
	onMoveBotToSpace,
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
	onReorderSpaces,
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
	const actions: BotRosterActions & ConversationRosterActions & SectionActions =
		{
			onCreateSection,
			onDeleteBot,
			onDeleteConversation,
			onDeleteSection,
			onDuplicateBot,
			onDuplicateBotToSpace,
			onEditBot,
			onMoveBotToSection,
			onMoveBotToSpace,
			onMoveConversationToSection,
			onOpenConversationSettings,
			onRenameSection,
			onReorderSections,
			onSelectBot,
			onSelectConversation,
		}

	const rosterOf = (spaceId: string) => botsBySpaceId?.[spaceId] ?? NO_BOTS

	const roomsOf = (spaceId: string) =>
		conversationsBySpaceId
			? (conversationsBySpaceId[spaceId] ?? NO_CONVERSATIONS)
			: rooms

	const sectionsOf = (spaceId: string) =>
		sectionsBySpaceId ? (sectionsBySpaceId[spaceId] ?? NO_SECTIONS) : sections

	const destinationsFrom = (spaceId?: string) =>
		spaces.filter((space) => space.id !== spaceId)

	const hasRosterPerSpace = Boolean(botsBySpaceId) && spaces.length > 0
	const shown =
		hasRosterPerSpace && selectedSpaceId ? rosterOf(selectedSpaceId) : roster
	const shownRooms =
		hasRosterPerSpace && selectedSpaceId ? roomsOf(selectedSpaceId) : rooms
	const selectedBot = shown.find((bot) => bot.id === selectedId)
	const selectedConversation = shownRooms.find(
		(room) => room.id === selectedConversationId,
	)

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
				aria-busy={shown.some(isBusy) || shownRooms.some(isBusy)}
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
						badgesBySpaceId={badgesBySpaceId}
						onCreateSpace={onCreateSpace}
						onOpenSpaceSettings={onOpenSpaceSettings}
						onReorderSpaces={onReorderSpaces}
						onSelectSpace={onSelectSpace}
						selectedSpaceId={selectedSpaceId}
						spaces={spaces}
					/>
					{onCreateConversation ? (
						<CreateMenu
							onCreateBot={onCreateBot}
							onCreateConversation={onCreateConversation}
						/>
					) : (
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
					)}
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
									conversations={roomsOf(space.id)}
									destinations={destinationsFrom(space.id)}
									sections={sectionsOf(space.id)}
									selectedBotId={selectedId}
									selectedConversationId={selectedConversationId}
								/>
							)}
							selectedSpaceId={selectedSpaceId}
							spaces={spaces}
						/>
					) : (
						<BotRoster
							{...actions}
							bots={roster}
							conversations={rooms}
							destinations={destinationsFrom(selectedSpaceId)}
							sections={sections}
							selectedBotId={selectedId}
							selectedConversationId={selectedConversationId}
						/>
					)}
				</AnimatedSidebarContent>
				{user || footer || spaces.length > 1 ? (
					<AnimatedSidebarFooter className={FOOTER_INSET}>
						<SpaceDots
							badgesBySpaceId={badgesBySpaceId}
							onReorderSpaces={onReorderSpaces}
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
				{announcementFor(t, selectedBot, selectedConversation)}
			</span>
		</>
	)
}

const AgentSidebar = memo(AgentSidebarBase)

export {
	AgentSidebar,
	type AgentSidebarBot,
	type AgentSidebarConversation,
	type AgentSidebarProps,
	type AgentSidebarSection,
	type BotAvatarBlot,
	type Space,
	type UserChipIdentity,
}
