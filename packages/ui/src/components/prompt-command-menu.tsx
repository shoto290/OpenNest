"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

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

export interface PromptCommandMenuProps {
	/** Command names, rendered in the order given. */
	commands: string[]
	open: boolean
	/** Filters the list, case-insensitively, on a contained match. */
	query: string
	onSelect: (command: string) => void
	/** Escape, or a pointer press outside the menu. */
	onDismiss: () => void
	/** The composer the menu is anchored above. */
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
	const rootRef = useRef<HTMLDivElement>(null)
	const lastPointer = useRef({ x: -1, y: -1 })
	const reduce = useReducedMotion() ?? false
	const [activeIndex, setActiveIndex] = useState(0)

	const matches = useMemo(() => {
		const needle = query.toLocaleLowerCase()
		return commands.filter((command) =>
			command.toLocaleLowerCase().includes(needle),
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

			if (step === undefined) onSelect(matches[active])
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
						className="absolute bottom-full left-0 z-50 mb-2 min-w-64 max-w-full overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
					>
						<div
							role="listbox"
							aria-label="Commands"
							tabIndex={0}
							className="max-h-64 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							{matches.map((command, index) => (
								<button
									key={command}
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
									onClick={() => onSelect(command)}
									className={cn(
										"flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-foreground text-sm outline-none",
										index === active && "bg-muted",
									)}
								>
									<span className="truncate">{command}</span>
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
