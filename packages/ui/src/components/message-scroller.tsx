"use client"
// beui.dev/components/agents/message-scroller

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

import { cn } from "@workspace/ui/lib/utils"

export interface MessageScrollerHandle {
	/** Returns to the newest content and re-arms follow. */
	scrollToEnd: (behavior?: ScrollBehavior) => void
	/** Whether the reader currently sits at the live edge. */
	isFollowing: () => boolean
}

export interface MessageScrollerProps extends ComponentPropsWithRef<"div"> {
	/** Keep streamed output pinned while the reader remains near the end. */
	followOutput?: boolean
	/** Distance from the end that still counts as following the output. */
	followThreshold?: number
	/** Smoothly follow growing content. */
	smooth?: boolean
	/** Reports when the reader leaves or returns to the live edge. */
	onFollowChange?: (following: boolean) => void
	/** Accessible label for the scrollable transcript. */
	label?: string
	/** Marks the transcript as waiting for more streamed content. */
	busy?: boolean
	viewportClassName?: string
	contentClassName?: string
	viewportRef?: Ref<HTMLElement>
	/** Imperative live edge, for a jump-to-latest control owned by the host. */
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
	label = "Conversation",
	busy,
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
	const reduce = useReducedMotion() ?? false
	const viewportRef = useRef<HTMLElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const followingRef = useRef(followOutput)
	const programmaticScrollRef = useRef(false)
	const scrollTimerRef = useRef<number | undefined>(undefined)
	const frameRef = useRef<number | undefined>(undefined)
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

	const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
		const viewport = viewportRef.current
		if (!viewport) return

		programmaticScrollRef.current = true
		if (typeof viewport.scrollTo === "function") {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior })
		} else {
			viewport.scrollTop = viewport.scrollHeight
		}
		if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = window.setTimeout(
			() => {
				programmaticScrollRef.current = false
			},
			behavior === "smooth" ? 320 : 0,
		)
	}, [])

	const handleScroll = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport || programmaticScrollRef.current) return

		const distance =
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
		setFollowing(distance <= followThreshold)
	}, [followThreshold, setFollowing])

	const leaveLiveEdge = useCallback(() => {
		programmaticScrollRef.current = false
	}, [])

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

	useEffect(() => {
		const content = contentRef.current
		if (!content || typeof ResizeObserver === "undefined") return

		const observer = new ResizeObserver(() => {
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
			{/* `layoutScroll` because this viewport scrolls under its own content:
			 * without it a mark animating between two rows is measured in a
			 * coordinate space the follow-scroll then moves, and it slides. */}
			<motion.section
				layoutScroll
				ref={setViewportRef}
				aria-label={label}
				// A scrollable region must be reachable by keyboard.
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
