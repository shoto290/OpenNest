"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { useDismiss } from "@workspace/ui/lib/hooks/use-dismiss"
import { cn } from "@workspace/ui/lib/utils"

const TRAVEL_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

const PANEL_HIDDEN = { y: 6, scale: 0.98 } as const
const PANEL_VISIBLE = { y: 0, scale: 1 } as const
const PANEL_LEAVING = { ...PANEL_HIDDEN, pointerEvents: "none" } as const

const scrollActiveIntoView = (row: HTMLButtonElement | null) => {
	row?.scrollIntoView({ block: "nearest" })
}

export interface PromptCommandOption {
	name: string
	description?: string
}

export interface PromptCommandMenuProps {
	commands: PromptCommandOption[]
	open: boolean
	query: string
	onSelect: (command: string) => void
	onDismiss: () => void
	children: ReactNode
	className?: string
}

export function PromptCommandMenu({
	commands,
	open,
	query,
	onSelect,
	onDismiss,
	children,
	className,
}: PromptCommandMenuProps) {
	const { t } = useTranslation("chat")
	const rootRef = useRef<HTMLDivElement>(null)
	const lastPointer = useRef({ x: -1, y: -1 })
	const reduce = useReducedMotion() ?? false
	const [activeIndex, setActiveIndex] = useState(0)

	const matches = useMemo(() => {
		const needle = query.toLocaleLowerCase()
		return commands.filter((command) =>
			command.name.toLocaleLowerCase().includes(needle),
		)
	}, [commands, query])

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

			if (step === undefined) onSelect(matches[active].name)
			else setActiveIndex((active + step + matches.length) % matches.length)
		}

		window.addEventListener("keydown", onKeyDown, true)
		return () => window.removeEventListener("keydown", onKeyDown, true)
	}, [isOpen, matches, active, onSelect])

	useDismiss(isOpen, onDismiss, rootRef)

	return (
		<div
			ref={rootRef}
			data-slot="prompt-command-menu"
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
							aria-label={t("composer.commands")}
							tabIndex={0}
							className="max-h-64 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{matches.map((command, index) => (
								<button
									key={command.name}
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
									onClick={() => onSelect(command.name)}
									className={cn(
										"flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-foreground text-sm outline-none",
										index === active && "bg-muted",
									)}
								>
									<span className="truncate">{command.name}</span>
									{command.description ? (
										<span className="truncate text-muted-foreground text-xs">
											{command.description}
										</span>
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
