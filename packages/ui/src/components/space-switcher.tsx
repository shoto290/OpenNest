"use client"

import { useTranslation } from "react-i18next"

import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/bot-avatar"
import {
	BOT_BADGE_FILL,
	type BotBadge,
} from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@workspace/ui/components/motion/context-menu"
import type { Space } from "@workspace/ui/components/space"
import { SPACE_RANK_LIMIT } from "@workspace/ui/hooks/use-space-shortcut"
import { cn } from "@workspace/ui/lib/utils"

const SWITCHER =
	"relative mr-auto min-w-0 max-w-[62%] px-2 group-data-[state=collapsed]/sidebar:mr-0 group-data-[state=collapsed]/sidebar:size-7 group-data-[state=collapsed]/sidebar:px-0"

const SWITCHER_NAME =
	"min-w-0 truncate group-data-[state=collapsed]/sidebar:hidden"

const SWITCHER_DOT = "hidden group-data-[state=collapsed]/sidebar:block"

const SWITCHER_BADGE =
	"pointer-events-none absolute top-1 right-1 size-2 rounded-full ring-2 ring-sidebar"

const DOT = "size-2.5 shrink-0 rounded-full"

const DOTS =
	"flex flex-wrap items-center justify-center group-data-[state=collapsed]/sidebar:hidden"

const DOT_BUTTON =
	"grid size-5 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

const DOT_MOTION =
	"transition-transform duration-150 ease-out motion-reduce:transition-none"

const DOT_RESTING = "scale-75 bg-sidebar-foreground/30"

const DOT_BADGE = "ring-2"

const BADGE_RING: Record<BotBadge, string> = {
	attention: "ring-bot-badge-attention motion-safe:animate-pulse",
	done: "ring-bot-badge-done",
	failed: "ring-bot-badge-failed",
}

const BADGE_RANK: BotBadge[] = ["attention", "failed", "done"]

const strongestBadge = (badges: (BotBadge | undefined)[]) =>
	BADGE_RANK.find((badge) => badges.includes(badge))

type SpaceDotProps = {
	colour: BotAvatarBlot
	badge?: BotBadge
	isFilled?: boolean
	className?: string
}

const SpaceDot = ({
	colour,
	badge,
	isFilled = true,
	className,
}: SpaceDotProps) => (
	<span
		aria-hidden="true"
		className={cn(
			DOT,
			DOT_MOTION,
			!isFilled && DOT_RESTING,
			badge && cn(DOT_BADGE, BADGE_RING[badge]),
			className,
		)}
		data-badge={badge}
		data-slot="space-dot"
		style={isFilled ? { backgroundColor: blotTint(colour) } : undefined}
	/>
)

type SpaceSelection = {
	spaces: Space[]
	selectedSpaceId?: string
	badgesBySpaceId?: Record<string, BotBadge>
	onSelectSpace?: (id: string) => void
}

type SpaceSwitcherProps = SpaceSelection & {
	onCreateSpace?: () => void
	onOpenSpaceSettings?: () => void
}

const SpaceSwitcher = ({
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	onSelectSpace,
	onCreateSpace,
	onOpenSpaceSettings,
}: SpaceSwitcherProps) => {
	const { t } = useTranslation("bots")
	const selected =
		spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]

	if (!selected) return null

	const elsewhere = strongestBadge(
		spaces
			.filter((space) => space.id !== selected.id)
			.map((space) => badgesBySpaceId?.[space.id]),
	)

	return (
		<ContextMenu>
			<ContextMenuTrigger opensOnPress>
				<Button
					aria-label={t("spaces.switch", { name: selected.name })}
					className={SWITCHER}
					data-slot="space-switcher"
					size="sm"
					variant="ghost"
				>
					<SpaceDot className={SWITCHER_DOT} colour={selected.colour} />
					<span className={SWITCHER_NAME} data-slot="space-switcher-name">
						{selected.name}
					</span>
					{elsewhere ? (
						<span
							aria-hidden="true"
							className={cn(SWITCHER_BADGE, BOT_BADGE_FILL[elsewhere])}
							data-badge={elsewhere}
							data-slot="space-switcher-badge"
						/>
					) : null}
				</Button>
			</ContextMenuTrigger>
			<ContextMenuContent ariaLabel={t("spaces.label")}>
				<ContextMenuRadioGroup
					onValueChange={onSelectSpace}
					value={selected.id}
				>
					{spaces.map((space, index) => (
						<ContextMenuRadioItem
							key={space.id}
							textValue={space.name}
							value={space.id}
						>
							<SpaceDot
								badge={badgesBySpaceId?.[space.id]}
								colour={space.colour}
							/>
							<span className="min-w-0 truncate">{space.name}</span>
							{index < SPACE_RANK_LIMIT ? (
								<ContextMenuShortcut>
									{t("spaces.shortcut", { rank: index + 1 })}
								</ContextMenuShortcut>
							) : null}
						</ContextMenuRadioItem>
					))}
				</ContextMenuRadioGroup>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onCreateSpace}>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("spaces.create")}
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSpaceSettings}>
					<Icons.Settings aria-hidden="true" className="size-3.5" />
					{t("spaces.settings")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const SpaceDots = ({
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	onSelectSpace,
}: SpaceSelection) => {
	const { t } = useTranslation("bots")

	if (spaces.length < 2) return null

	return (
		<span
			aria-label={t("spaces.label")}
			className={DOTS}
			data-slot="space-dots"
			role="group"
		>
			{spaces.map((space) => {
				const isSelected = space.id === selectedSpaceId
				return (
					<button
						aria-current={isSelected}
						aria-label={t("spaces.open", { name: space.name })}
						className={DOT_BUTTON}
						data-slot="space-dot-button"
						key={space.id}
						onClick={() => onSelectSpace?.(space.id)}
						type="button"
					>
						<SpaceDot
							badge={badgesBySpaceId?.[space.id]}
							colour={space.colour}
							isFilled={isSelected}
						/>
					</button>
				)
			})}
		</span>
	)
}

export { SpaceDot, SpaceDots, SpaceSwitcher, type SpaceSwitcherProps }
