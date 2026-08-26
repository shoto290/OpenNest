"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import { Icons } from "@workspace/ui/components/icons"
import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { useDismiss } from "@workspace/ui/lib/hooks/use-dismiss"
import { cn } from "@workspace/ui/lib/utils"

const TRAVEL_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

const PANEL_HIDDEN = { y: 6, scale: 0.98 } as const
const PANEL_VISIBLE = { y: 0, scale: 1 } as const
const PANEL_LEAVING = { ...PANEL_HIDDEN, pointerEvents: "none" } as const

const ROW_AVATAR_SIZE = 24

const scrollActiveIntoView = (row: HTMLButtonElement | null) => {
	row?.scrollIntoView({ block: "nearest" })
}

interface PromptMentionMenuProps {
	bots: ConversationBot[]
	leadId?: string
	open: boolean
	query: string
	onSelect: (id: string) => void
	onDismiss: () => void
	children: ReactNode
	className?: string
}

const PromptMentionMenu = ({
	bots,
	leadId,
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
	const reduce = useReducedMotion() ?? false
	const [activeIndex, setActiveIndex] = useState(0)

	const matches = useMemo(() => {
		const needle = query.toLocaleLowerCase()
		return bots.filter((bot) => bot.name.toLocaleLowerCase().includes(needle))
	}, [bots, query])

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

			if (step === undefined) onSelect(matches[active].id)
			else setActiveIndex((active + step + matches.length) % matches.length)
		}

		window.addEventListener("keydown", onKeyDown, true)
		return () => window.removeEventListener("keydown", onKeyDown, true)
	}, [isOpen, matches, active, onSelect])

	useDismiss(isOpen, onDismiss, rootRef)

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
							"absolute bottom-full left-0 z-50 mb-2 min-w-64 max-w-[min(24rem,100%)] overflow-hidden rounded-xl p-1.5",
						)}
					>
						<div
							role="listbox"
							aria-label={t("composer.mentions")}
							tabIndex={0}
							className="max-h-64 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{matches.map((bot, index) => (
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
									onClick={() => onSelect(bot.id)}
									className={cn(
										"flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-foreground text-sm outline-none",
										index === active && "bg-muted",
									)}
								>
									<span aria-hidden="true" className="contents">
										<BotIdentityAvatar
											animal={bot.animal}
											blot={bot.blot}
											image={bot.image}
											name={bot.name}
											seed={bot.id}
											size={ROW_AVATAR_SIZE}
										/>
									</span>
									<span className="min-w-0 flex-1 truncate">{bot.name}</span>
									{bot.id === leadId ? (
										<>
											<Icons.Crown
												aria-hidden="true"
												className="size-4 shrink-0 text-bot-badge-attention"
												data-slot="prompt-mention-lead"
											/>
											<span className="sr-only">
												{t("newConversation.picked.lead")}
											</span>
										</>
									) : null}
								</button>
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>

			{children}
		</div>
	)
}

export { PromptMentionMenu, type PromptMentionMenuProps }
