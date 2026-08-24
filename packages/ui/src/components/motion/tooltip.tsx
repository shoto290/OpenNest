"use client"

import {
	AnimatePresence,
	motion,
	useReducedMotion,
	type Variants,
} from "motion/react"
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"

import { EASE_OUT, SPRING_PANEL } from "@workspace/ui/lib/ease"
import { useHoverCapable } from "@workspace/ui/lib/hooks/use-hover-capable"
import { cn } from "@workspace/ui/lib/utils"

type Side = "top" | "right" | "bottom" | "left"

export interface TooltipProps {
	content: ReactNode
	children: ReactElement
	side?: Side
	delay?: number
	className?: string
	wrapperClassName?: string
}

const GAP = 8

const EDGE = 8

const centredInside = (centre: number, extent: number) =>
	`min(max(-50%, ${EDGE - centre}px), calc(${extent - EDGE - centre}px - 100%))`

type Placement = { top: number; left: number; transform: string }

const transformOrigin: Record<Side, string> = {
	top: "center bottom",
	bottom: "center top",
	left: "right center",
	right: "left center",
}

const offsetFrom: Record<Side, { x?: number; y?: number }> = {
	top: { y: 8 },
	bottom: { y: -8 },
	left: { x: 8 },
	right: { x: -8 },
}

function buildVariants(side: Side): Variants {
	const o = offsetFrom[side]
	return {
		initial: {
			scale: 0.9,
			x: o.x ?? 0,
			y: o.y ?? 0,
		},
		animate: {
			scale: 1,
			x: 0,
			y: 0,
			transition: SPRING_PANEL,
		},
		exit: {
			scale: 0.94,
			x: (o.x ?? 0) * 0.6,
			y: (o.y ?? 0) * 0.6,
			transition: { duration: 0.12, ease: EASE_OUT },
		},
	}
}

const WARM_WINDOW_MS = 300
let lastHiddenAt = 0

export function Tooltip({
	content,
	children,
	side = "top",
	delay = 120,
	className,
	wrapperClassName,
}: TooltipProps) {
	const [open, setOpen] = useState(false)
	const [coords, setCoords] = useState<Placement | null>(null)
	const id = useId()
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const anchorRef = useRef<HTMLSpanElement>(null)
	const reduce = useReducedMotion()
	const canHover = useHoverCapable()

	const place = useCallback(() => {
		const el = anchorRef.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const cx = r.left + r.width / 2
		const cy = r.top + r.height / 2
		const insideX = centredInside(cx, window.innerWidth)
		const insideY = centredInside(cy, window.innerHeight)
		const point: Record<Side, Placement> = {
			top: {
				top: r.top - GAP,
				left: cx,
				transform: `translate(${insideX}, -100%)`,
			},
			bottom: {
				top: r.bottom + GAP,
				left: cx,
				transform: `translate(${insideX}, 0)`,
			},
			left: {
				top: cy,
				left: r.left - GAP,
				transform: `translate(-100%, ${insideY})`,
			},
			right: {
				top: cy,
				left: r.right + GAP,
				transform: `translate(0, ${insideY})`,
			},
		}
		setCoords(point[side])
	}, [side])

	const show = useCallback(() => {
		if (!canHover) return
		if (timer.current) clearTimeout(timer.current)
		const warm = Date.now() - lastHiddenAt < WARM_WINDOW_MS
		timer.current = setTimeout(
			() => {
				place()
				setOpen(true)
			},
			warm ? 0 : delay,
		)
	}, [canHover, delay, place])

	const hide = useCallback(() => {
		if (timer.current) {
			clearTimeout(timer.current)
			timer.current = null
		}
		if (open) lastHiddenAt = Date.now()
		setOpen(false)
	}, [open])

	useEffect(() => {
		if (!open) return
		const onMove = () => place()
		window.addEventListener("scroll", onMove, true)
		window.addEventListener("resize", onMove)
		return () => {
			window.removeEventListener("scroll", onMove, true)
			window.removeEventListener("resize", onMove)
		}
	}, [open, place])

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[],
	)

	const variants = useMemo(
		() => (reduce ? undefined : buildVariants(side)),
		[reduce, side],
	)

	if (!isValidElement(children)) return children

	const trigger = cloneElement(
		children as ReactElement<Record<string, unknown>>,
		{
			onMouseEnter: show,
			onMouseLeave: hide,
			onFocus: show,
			onBlur: hide,
			"aria-describedby": open ? id : undefined,
		},
	)

	return (
		<>
			<span
				ref={anchorRef}
				className={cn("relative inline-flex align-middle", wrapperClassName)}
			>
				{trigger}
			</span>
			{typeof document !== "undefined"
				? createPortal(
						<AnimatePresence>
							{open && coords ? (
								<span
									className="pointer-events-none fixed z-[9999]"
									style={{
										top: coords.top,
										left: coords.left,
										transform: coords.transform,
									}}
								>
									<motion.span
										id={id}
										role="tooltip"
										variants={variants}
										initial="initial"
										animate="animate"
										exit="exit"
										style={{ transformOrigin: transformOrigin[side] }}
										className={cn(
											"block whitespace-nowrap rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-lg",
											className,
										)}
									>
										{content}
									</motion.span>
								</span>
							) : null}
						</AnimatePresence>,
						document.body,
					)
				: null}
		</>
	)
}
