"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { useDismiss } from "@workspace/ui/lib/hooks/use-dismiss"
import { cn } from "@workspace/ui/lib/utils"

const TRAVEL_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

const PANEL_HIDDEN = { y: 6, scale: 0.98 } as const
const PANEL_VISIBLE = { y: 0, scale: 1 } as const
const PANEL_LEAVING = { ...PANEL_HIDDEN, pointerEvents: "none" } as const

const ROW_AVATAR_SIZE = 24

const OPENING_ROWS = 6

const COUNT_GLYPH = "×"

const scrollActiveIntoView = (row: HTMLButtonElement | null) => {
	row?.scrollIntoView({ block: "nearest" })
}

type MentionBot = RosterBot & {
	isOutside?: boolean
}

interface PromptMentionMenuProps {
	bots: MentionBot[]
	counts?: Record<string, number>
	leadId?: string
	spaceName?: string
	open: boolean
	query: string
	onSelect: (id: string, isOutside: boolean) => void
	onDismiss: () => void
	children: ReactNode
	className?: string
}

const runsFor = (bots: MentionBot[], query: string) => {
	const needle = query.toLocaleLowerCase()
	const named = bots.filter((bot) =>
		bot.name.toLocaleLowerCase().includes(needle),
	)
	const inside = named.filter((bot) => !bot.isOutside)
	const outside = needle ? named.filter((bot) => bot.isOutside) : []
	const shown = needle ? inside : inside.slice(0, OPENING_ROWS)

	return { inside: shown, outside, matches: [...shown, ...outside] }
}

const PromptMentionMenu = ({
	bots,
	counts,
	leadId,
	spaceName,
	open,
	query,
	onSelect,
	onDismiss,
	children,
	className,
}: PromptMentionMenuProps) => {
	const { t } = useTranslation("chat")
	const rootRef = useRef<HTMLDivElement>(null)
	const lastPointer = useRef({ x: -1, y: -1 })
	const boundaryId = useId()
	const reduce = useReducedMotion() ?? false
	const [activeIndex, setActiveIndex] = useState(0)

	const { inside, outside, matches } = useMemo(
		() => runsFor(bots, query),
		[bots, query],
	)

	const further = query ? 0 : bots.length - matches.length

	const isOpen = open && matches.length > 0
	const [lastScope, setLastScope] = useState({ open, query })

	if (lastScope.open !== open || lastScope.query !== query) {
		setLastScope({ open, query })
		setActiveIndex(0)
	}

	const active = Math.min(activeIndex, Math.max(matches.length - 1, 0))

	useEffect(() => {
		if (!isOpen) return

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing) return

			const step = TRAVEL_STEPS[event.key]
			const selects = event.key === "Enter" || event.key === "Tab"
			if (step === undefined && !selects) return

			event.preventDefault()
			event.stopPropagation()

			if (step === undefined) {
				const { id, isOutside } = matches[active]
				onSelect(id, Boolean(isOutside))
			} else setActiveIndex((active + step + matches.length) % matches.length)
		}

		window.addEventListener("keydown", onKeyDown, true)
		return () => window.removeEventListener("keydown", onKeyDown, true)
	}, [isOpen, matches, active, onSelect])

	useDismiss(isOpen, onDismiss, rootRef)

	const renderRow = (bot: MentionBot, index: number) => {
		const count = counts?.[bot.id] ?? 0
		const isLead = bot.id === leadId

		return (
			<button
				key={bot.id}
				ref={index === active ? scrollActiveIntoView : undefined}
				type="button"
				role="option"
				aria-selected={index === active}
				tabIndex={-1}
				onPointerMove={(event) => {
					if (event.pointerType === "touch") return
					const { x, y } = lastPointer.current
					lastPointer.current = {
						x: event.clientX,
						y: event.clientY,
					}
					if (event.clientX !== x || event.clientY !== y) {
						setActiveIndex(index)
					}
				}}
				onClick={() => onSelect(bot.id, Boolean(bot.isOutside))}
				className={cn(
					"flex h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-foreground text-sm outline-none",
					index === active && "bg-muted",
				)}
			>
				<span
					aria-hidden="true"
					className={cn("flex shrink-0", bot.isOutside && "opacity-70")}
				>
					<BotIdentityAvatar
						animal={bot.animal}
						blot={bot.blot}
						image={bot.image}
						name={bot.name}
						seed={bot.id}
						size={ROW_AVATAR_SIZE}
					/>
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-1.5">
					<span className="flex min-w-0 items-center gap-1">
						<span className="truncate" data-slot="prompt-mention-name">
							{bot.name}
						</span>
						{count > 0 ? (
							<>
								<span
									aria-hidden="true"
									className="shrink-0 text-muted-foreground tabular-nums"
									data-slot="prompt-mention-count"
								>
									{`${COUNT_GLYPH}${count}`}
								</span>
								<span className="sr-only">
									{t("composer.mentioned", { count })}
								</span>
							</>
						) : null}
					</span>
					<BotTitleBadge title={bot.title} />
				</span>
				{isLead || bot.isOutside ? (
					<span
						className="flex w-14 shrink-0 items-center justify-end gap-1"
						data-slot="prompt-mention-trailing"
					>
						{isLead ? (
							<>
								<Icons.Crown
									aria-hidden="true"
									className="size-4 shrink-0 text-bot-badge-attention"
									data-slot="prompt-mention-lead"
								/>
								<span className="sr-only">{t("composer.lead")}</span>
							</>
						) : null}
						{bot.isOutside ? (
							<>
								<Icons.Add
									aria-hidden="true"
									className="size-3.5 shrink-0 text-muted-foreground"
									data-slot="prompt-mention-invite"
								/>
								<span className="sr-only">{t("composer.invite")}</span>
							</>
						) : null}
					</span>
				) : null}
			</button>
		)
	}

	return (
		<div
			ref={rootRef}
			data-slot="prompt-mention-menu"
			className={cn("relative", className)}
		>
			<AnimatePresence>
				{isOpen ? (
					<motion.div
						initial={PANEL_HIDDEN}
						animate={PANEL_VISIBLE}
						exit={PANEL_LEAVING}
						transition={reduce ? TRANSITION_NONE : SPRING_PANEL}
						onPointerDown={(event) => event.preventDefault()}
						style={{ transformOrigin: "bottom left" }}
						className={cn(
							POPUP_CLASS,
							"absolute bottom-full left-0 z-50 mb-2 w-84 max-w-full overflow-hidden rounded-xl p-1.5 shadow-popover",
						)}
					>
						<div
							role="listbox"
							aria-label={t("composer.mentions")}
							tabIndex={0}
							className="max-h-64 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{inside.map(renderRow)}
							{outside.length > 0 ? (
								<div role="group" aria-labelledby={boundaryId}>
									<div
										className="flex items-center gap-2 px-2 pt-3 pb-1.5"
										data-slot="prompt-mention-boundary"
									>
										<span
											id={boundaryId}
											className="shrink-0 font-medium text-muted-foreground text-xs"
										>
											{t("composer.outside")}
										</span>
										<span
											aria-hidden="true"
											className="h-px flex-1 bg-border"
										/>
									</div>
									{outside.map((bot, index) =>
										renderRow(bot, inside.length + index),
									)}
								</div>
							) : null}
						</div>
						{further > 0 && spaceName ? (
							<div
								className="mt-1.5 flex items-center gap-1.5 border-border border-t p-2 text-muted-foreground text-xs"
								data-slot="prompt-mention-footer"
							>
								<Icons.Search
									aria-hidden="true"
									className="size-3.5 shrink-0"
								/>
								<span>
									{t("composer.further", { count: further, space: spaceName })}
								</span>
							</div>
						) : null}
					</motion.div>
				) : null}
			</AnimatePresence>

			{children}
		</div>
	)
}

export { type MentionBot, PromptMentionMenu, type PromptMentionMenuProps }
