"use client"

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react"
import {
	type ComponentPropsWithRef,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

interface PrependPin {
	anchor: HTMLElement
	offset: number
}

const offsetFromViewportTop = (anchor: HTMLElement, viewportTop: number) =>
	anchor.getBoundingClientRect().top - viewportTop

const topVisibleRow = (content: HTMLElement, viewportTop: number) => {
	const rows = Array.from(content.children) as HTMLElement[]
	return rows.find((row) => row.getBoundingClientRect().bottom > viewportTop)
}

export interface MessageScrollerHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	isFollowing: () => boolean
}

export interface MessageScrollerOlder {
	has: boolean
	isLoading?: boolean
	onLoad: () => void
	label?: string
	startOfHistoryLabel?: string
}

export interface MessageScrollerProps extends ComponentPropsWithRef<"div"> {
	followOutput?: boolean
	followThreshold?: number
	smooth?: boolean
	onFollowChange?: (following: boolean) => void
	label?: string
	busy?: boolean
	older?: MessageScrollerOlder
	viewportClassName?: string
	contentClassName?: string
	viewportRef?: Ref<HTMLElement>
	scrollerRef?: Ref<MessageScrollerHandle>
	viewportProps?: Omit<
		HTMLMotionProps<"section">,
		"children" | "className" | "ref"
	>
	contentProps?: Omit<
		ComponentPropsWithRef<"div">,
		"children" | "className" | "ref"
	>
}

export function MessageScroller({
	followOutput = true,
	followThreshold = 56,
	smooth = true,
	onFollowChange,
	label,
	busy,
	older,
	viewportClassName,
	contentClassName,
	viewportRef: externalViewportRef,
	scrollerRef,
	viewportProps,
	contentProps,
	className,
	children,
	...props
}: MessageScrollerProps) {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false
	const viewportRef = useRef<HTMLElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const followingRef = useRef(followOutput)
	const programmaticScrollRef = useRef(false)
	const scrollTimerRef = useRef<number | undefined>(undefined)
	const frameRef = useRef<number | undefined>(undefined)
	const pinRef = useRef<PrependPin | null>(null)
	const {
		onScroll: onViewportScroll,
		onWheel: onViewportWheel,
		onTouchStart: onViewportTouchStart,
		onKeyDown: onViewportKeyDown,
		...restViewportProps
	} = viewportProps ?? {}

	const setViewportRef = useCallback(
		(node: HTMLElement | null) => {
			viewportRef.current = node
			if (typeof externalViewportRef === "function") {
				externalViewportRef(node)
			} else if (externalViewportRef) {
				externalViewportRef.current = node
			}
		},
		[externalViewportRef],
	)

	const setFollowing = useCallback(
		(next: boolean) => {
			if (followingRef.current === next) return
			followingRef.current = next
			onFollowChange?.(next)
		},
		[onFollowChange],
	)

	const holdProgrammaticScroll = useCallback((duration: number) => {
		programmaticScrollRef.current = true
		if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = window.setTimeout(() => {
			programmaticScrollRef.current = false
		}, duration)
	}, [])

	const scrollToEnd = useCallback(
		(behavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			if (!viewport) return

			holdProgrammaticScroll(behavior === "smooth" ? 320 : 0)
			if (typeof viewport.scrollTo === "function") {
				viewport.scrollTo({ top: viewport.scrollHeight, behavior })
			} else {
				viewport.scrollTop = viewport.scrollHeight
			}
		},
		[holdProgrammaticScroll],
	)

	const pinTopVisibleRow = useCallback(() => {
		const viewport = viewportRef.current
		const content = contentRef.current
		if (!viewport || !content) return

		const viewportTop = viewport.getBoundingClientRect().top
		const anchor = topVisibleRow(content, viewportTop)
		pinRef.current = anchor
			? { anchor, offset: offsetFromViewportTop(anchor, viewportTop) }
			: null
	}, [])

	const handleScroll = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport || programmaticScrollRef.current) return

		if (pinRef.current) pinTopVisibleRow()

		const distance =
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
		setFollowing(distance <= followThreshold)
	}, [followThreshold, pinTopVisibleRow, setFollowing])

	const leaveLiveEdge = useCallback(() => {
		programmaticScrollRef.current = false
	}, [])

	const requestOlder = () => {
		if (!older || older.isLoading) return
		pinTopVisibleRow()
		older.onLoad()
	}

	useImperativeHandle(
		scrollerRef,
		() => ({
			scrollToEnd: (behavior) => {
				setFollowing(true)
				scrollToEnd(behavior ?? (reduce || !smooth ? "auto" : "smooth"))
			},
			isFollowing: () => followingRef.current,
		}),
		[reduce, scrollToEnd, setFollowing, smooth],
	)

	useLayoutEffect(() => {
		followingRef.current = followOutput
		if (!followOutput) return

		frameRef.current = requestAnimationFrame(() => scrollToEnd("auto"))
		return () => {
			if (frameRef.current) cancelAnimationFrame(frameRef.current)
		}
	}, [followOutput, scrollToEnd])

	useLayoutEffect(() => {
		const viewport = viewportRef.current
		const pin = pinRef.current
		if (!viewport || !pin) return

		if (!pin.anchor.isConnected) {
			pinRef.current = null
			return
		}

		const viewportTop = viewport.getBoundingClientRect().top
		const drift = offsetFromViewportTop(pin.anchor, viewportTop) - pin.offset
		if (drift !== 0) {
			holdProgrammaticScroll(0)
			viewport.scrollTop += drift
		}
		if (!older?.isLoading) pinRef.current = null
	})

	useEffect(() => {
		const content = contentRef.current
		if (!content || typeof ResizeObserver === "undefined") return

		const observer = new ResizeObserver(() => {
			if (pinRef.current) return
			if (!followOutput || !followingRef.current) return
			scrollToEnd(reduce || !smooth ? "auto" : "smooth")
		})
		observer.observe(content)

		return () => observer.disconnect()
	}, [followOutput, reduce, scrollToEnd, smooth])

	useEffect(
		() => () => {
			if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
			if (frameRef.current) cancelAnimationFrame(frameRef.current)
		},
		[],
	)

	return (
		<div
			data-slot="message-scroller"
			className={cn("min-h-0", className)}
			{...props}
		>
			<motion.section
				layoutScroll
				ref={setViewportRef}
				aria-label={label ?? t("transcript.label")}
				tabIndex={0}
				{...restViewportProps}
				onScroll={(event) => {
					handleScroll()
					onViewportScroll?.(event)
				}}
				onWheel={(event) => {
					leaveLiveEdge()
					onViewportWheel?.(event)
				}}
				onTouchStart={(event) => {
					leaveLiveEdge()
					onViewportTouchStart?.(event)
				}}
				onKeyDown={(event) => {
					if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
						leaveLiveEdge()
					}
					onViewportKeyDown?.(event)
				}}
				className={cn(
					"h-full overflow-y-auto overscroll-contain outline-none [overflow-anchor:none] [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
					viewportClassName,
				)}
			>
				{older ? (
					<div
						data-slot="message-scroller-older"
						className="flex min-h-9 items-center justify-center px-3"
					>
						{older.has ? (
							<Button
								variant="ghost"
								size="sm"
								aria-busy={older.isLoading}
								aria-disabled={older.isLoading}
								className="aria-disabled:opacity-60"
								onClick={requestOlder}
							>
								{older.isLoading ? (
									<Icons.Loading
										data-icon="inline-start"
										className={cn(!reduce && "animate-spin")}
									/>
								) : null}
								{older.label ?? t("transcript.loadOlder")}
							</Button>
						) : (
							<p className="text-muted-foreground text-xs">
								{older.startOfHistoryLabel ?? t("transcript.startOfHistory")}
							</p>
						)}
					</div>
				) : null}

				<div
					ref={contentRef}
					role="log"
					aria-live="polite"
					aria-relevant="additions text"
					aria-busy={busy}
					className={contentClassName}
					{...contentProps}
				>
					{children}
				</div>
			</motion.section>
		</div>
	)
}
