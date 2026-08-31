"use client"

import { useTranslation } from "react-i18next"

import {
	type BotBadge,
	BotBadgeDot,
	botBadgeRingVariants,
} from "@workspace/ui/components/badge"
import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/bot-avatar"
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
import {
	dropArea,
	dropAreaAt,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
import { SPACE_RANK_LIMIT } from "@workspace/ui/hooks/use-space-shortcut"
import { cn } from "@workspace/ui/lib/utils"

const SWITCHER =
	"relative mr-auto min-w-0 max-w-[62%] px-2 group-data-[state=collapsed]/sidebar:mr-0 group-data-[state=collapsed]/sidebar:size-7 group-data-[state=collapsed]/sidebar:px-0"

const SWITCHER_NAME =
	"min-w-0 truncate group-data-[state=collapsed]/sidebar:hidden"

const SWITCHER_DOT = "hidden group-data-[state=collapsed]/sidebar:block"

const DOT = "h-2.5 w-2.5 shrink-0 rounded-full"

const DOTS =
	"flex flex-wrap items-center justify-center group-data-[state=collapsed]/sidebar:hidden"

const DOT_BUTTON =
	"group/space-dot relative grid size-5 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

const DOT_LIFTED =
	"pointer-events-none z-10 scale-125 drop-shadow-md translate-x-[var(--lift-dx,0px)] translate-y-[var(--lift-dy,0px)]"

const INSERTION_LINE =
	"pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-full bg-sidebar-primary"

const INSERTION_BEFORE = "start-0"

const INSERTION_AFTER = "end-0"

const DOT_MOTION =
	"transition-[width,background-color] duration-150 ease-out motion-reduce:transition-none"

const DOT_OPEN = "w-4 bg-sidebar-foreground"

const DOT_CLOSED = "group-hover/space-dot:bg-sidebar-foreground"

const DOT_UNTINTED = "bg-sidebar-foreground/30"

const BADGE_RANK: BotBadge[] = ["attention", "failed", "done"]

const strongestBadge = (badges: (BotBadge | undefined)[]) =>
	BADGE_RANK.find((badge) => badges.includes(badge))

const placedOrder = (spaces: Space[], id: string, at: number) => {
	const order = spaces
		.filter((space) => space.id !== id)
		.map((space) => space.id)
	order.splice(at, 0, id)
	return order.every((held, rank) => held === spaces[rank]?.id) ? null : order
}

type SpaceDotProps = {
	colour?: BotAvatarBlot | null
	badge?: BotBadge
	isFilled?: boolean
	className?: string
}

const SpaceDot = ({
	colour,
	badge,
	isFilled = true,
	className,
}: SpaceDotProps) => {
	const tint = isFilled && colour ? blotTint(colour) : undefined

	return (
		<span
			aria-hidden="true"
			className={cn(
				DOT,
				DOT_MOTION,
				!tint && DOT_UNTINTED,
				badge && botBadgeRingVariants({ badge }),
				className,
			)}
			data-badge={badge}
			data-slot="space-dot"
			style={tint ? { backgroundColor: tint } : undefined}
		/>
	)
}

type SpaceSelection = {
	spaces: Space[]
	selectedSpaceId?: string
	badgesBySpaceId?: Record<string, BotBadge>
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
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
	onReorderSpaces,
	onCreateSpace,
	onOpenSpaceSettings,
}: SpaceSwitcherProps) => {
	const { t } = useTranslation("bots")
	const selected =
		spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]

	if (!selected) return null

	const rank = spaces.indexOf(selected)

	const moveSelected = (by: number) => {
		const order = placedOrder(spaces, selected.id, rank + by)
		if (order) onReorderSpaces?.(order)
	}

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
						<BotBadgeDot
							badge={elsewhere}
							data-slot="space-switcher-badge"
							placement="switcher"
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
				{spaces.length > 1 ? (
					<>
						<ContextMenuItem
							disabled={rank === 0}
							onSelect={() => moveSelected(-1)}
						>
							<Icons.ArrowUp aria-hidden="true" className="size-3.5" />
							{t("spaces.moveUp")}
						</ContextMenuItem>
						<ContextMenuItem
							disabled={rank === spaces.length - 1}
							onSelect={() => moveSelected(1)}
						>
							<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
							{t("spaces.moveDown")}
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				) : null}
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
	onReorderSpaces,
}: SpaceSelection) => {
	const { t } = useTranslation("bots")

	const placeSpace = (id: string, at: number) => {
		const order = placedOrder(spaces, id, at)
		if (order) onReorderSpaces?.(order)
	}

	const insertionAt = (x: number, y: number) => {
		const over = dropAreaAt(x, y)
		const rank = spaces.findIndex((space) => space.id === over)
		return rank < 0 ? null : rank
	}

	const lift = useRosterLift({
		isEnabled: spaces.length > 1,
		landingAt: insertionAt,
		onLand: placeSpace,
	})

	if (spaces.length < 2) return null

	const liftedId = lift.lift?.id
	const insertion = lift.lift?.landing ?? null
	const placed = spaces.filter((space) => space.id !== liftedId)
	const insertsBefore = insertion === null ? null : placed[insertion]?.id
	const insertsAfter =
		insertion !== null && insertion >= placed.length
			? placed[placed.length - 1]?.id
			: null

	return (
		<span
			aria-label={t("spaces.label")}
			className={DOTS}
			data-slot="space-dots"
			data-tauri-drag-region="false"
			role="group"
		>
			{spaces.map((space) => {
				const isSelected = space.id === selectedSpaceId
				const isLifted = space.id === liftedId
				const edge =
					insertsBefore === space.id
						? INSERTION_BEFORE
						: insertsAfter === space.id
							? INSERTION_AFTER
							: null
				return (
					<button
						{...dropArea(space.id)}
						{...lift.handlersFor(space.id)}
						aria-current={isSelected}
						aria-label={t("spaces.open", { name: space.name })}
						className={cn(DOT_BUTTON, isLifted && DOT_LIFTED)}
						data-slot="space-dot-button"
						key={space.id}
						onClick={() => {
							if (lift.hasJustDropped()) return
							onSelectSpace?.(space.id)
						}}
						ref={isLifted ? lift.followRef : undefined}
						type="button"
					>
						{edge ? (
							<span
								className={cn(INSERTION_LINE, edge)}
								data-slot="space-insertion"
							/>
						) : null}
						<SpaceDot
							badge={badgesBySpaceId?.[space.id]}
							className={isSelected ? DOT_OPEN : DOT_CLOSED}
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
