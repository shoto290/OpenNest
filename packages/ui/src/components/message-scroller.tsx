"use client"

import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	useReducedMotion,
} from "motion/react"
import {
	type ComponentPropsWithRef,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { MessageHighlightProvider } from "@workspace/ui/components/message-highlight-context"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

const SETTLE_TIMEOUT = 150

const NOTHING_LANDED = Symbol("nothing landed")

const JUMP_HIDDEN = { opacity: 0, y: 6 } as const
const JUMP_VISIBLE = { opacity: 1, y: 0 } as const

interface PrependPin {
	anchor: HTMLElement
	offset: number
}

const offsetFromViewportTop = (anchor: HTMLElement, viewportTop: number) =>
	anchor.getBoundingClientRect().top - viewportTop

const distanceFromEnd = (viewport: HTMLElement) =>
	viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight

const isOnLastBubble = (viewport: HTMLElement, threshold: number) =>
	distanceFromEnd(viewport) <= threshold

const isTravellingDown = (viewport: HTMLElement, targetTop: number) =>
	targetTop > viewport.scrollTop

const hasReachedTarget = (viewport: HTMLElement, targetTop: number) => {
	const maxTop = viewport.scrollHeight - viewport.clientHeight
	return Math.abs(viewport.scrollTop - Math.min(targetTop, maxTop)) <= 1
}

const anchorFor = (viewport: HTMLElement, messageId: string) => {
	for (const anchor of viewport.querySelectorAll<HTMLElement>(
		"[data-message-id]",
	)) {
		if (anchor.dataset.messageId === messageId) return anchor
	}
}

const centeredTop = (viewport: HTMLElement, anchor: HTMLElement) => {
	const offset = offsetFromViewportTop(
		anchor,
		viewport.getBoundingClientRect().top,
	)
	const gutter = (viewport.clientHeight - anchor.clientHeight) / 2
	return Math.max(viewport.scrollTop + offset - gutter, 0)
}

const topVisibleRow = (content: HTMLElement, viewportTop: number) => {
	const rows = Array.from(content.children) as HTMLElement[]
	return rows.find((row) => row.getBoundingClientRect().bottom > viewportTop)
}

export interface MessageScrollerHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	scrollToMessage: (messageId: string, behavior?: ScrollBehavior) => boolean
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
	transcriptKey?: string
	followOutput?: boolean
	followThreshold?: number
	smooth?: boolean
	onFollowChange?: (following: boolean) => void
	label?: string
	busy?: boolean
	highlightedMessageId?: string
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
	transcriptKey,
	followOutput = true,
	followThreshold = 56,
	smooth = true,
	onFollowChange,
	label,
	busy,
	highlightedMessageId,
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
	const [isAtLiveEdge, setIsAtLiveEdge] = useState(followOutput)
	const programmaticScrollRef = useRef(false)
	const targetTopRef = useRef(0)
	const scrollTimerRef = useRef<number | undefined>(undefined)
	const frameRef = useRef<number | undefined>(undefined)
	const landedKeyRef = useRef<string | typeof NOTHING_LANDED | undefined>(
		NOTHING_LANDED,
	)
	const landedRowsRef = useRef(0)
	const pinRef = useRef<PrependPin | null>(null)
	const lastScrollTopRef = useRef(0)
	const behavior: ScrollBehavior = reduce || !smooth ? "auto" : "smooth"
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
			setIsAtLiveEdge(next)
			onFollowChange?.(next)
		},
		[onFollowChange],
	)

	const holdLastBubble = useCallback(() => {
		const viewport = viewportRef.current
		if (viewport && isOnLastBubble(viewport, followThreshold))
			setFollowing(true)
	}, [followThreshold, setFollowing])

	const syncFollowing = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport) return
		setFollowing(isOnLastBubble(viewport, followThreshold))
	}, [followThreshold, setFollowing])

	const releaseProgrammaticScroll = useCallback(() => {
		programmaticScrollRef.current = false
		if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
	}, [])

	const abandonProgrammaticScroll = useCallback(() => {
		releaseProgrammaticScroll()
		holdLastBubble()
	}, [holdLastBubble, releaseProgrammaticScroll])

	const deferSettle = useCallback(() => {
		if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current)
		scrollTimerRef.current = window.setTimeout(
			abandonProgrammaticScroll,
			SETTLE_TIMEOUT,
		)
	}, [abandonProgrammaticScroll])

	const holdProgrammaticScroll = useCallback(
		(targetTop: number) => {
			programmaticScrollRef.current = true
			targetTopRef.current = targetTop
			deferSettle()
		},
		[deferSettle],
	)

	const rememberPosition = useCallback((viewport: HTMLElement) => {
		lastScrollTopRef.current = viewport.scrollTop
	}, [])

	const scrollToEnd = useCallback(
		(nextBehavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			if (!viewport || distanceFromEnd(viewport) <= 1) return

			holdProgrammaticScroll(viewport.scrollHeight)
			if (typeof viewport.scrollTo === "function") {
				viewport.scrollTo({
					top: viewport.scrollHeight,
					behavior: nextBehavior,
				})
			} else {
				viewport.scrollTop = viewport.scrollHeight
			}
			rememberPosition(viewport)
		},
		[holdProgrammaticScroll, rememberPosition],
	)

	const landOnLiveEdge = useCallback(() => {
		const rows = contentRef.current?.children.length ?? 0
		const isSameTranscript = landedKeyRef.current === transcriptKey
		const hasNewRow = rows !== landedRowsRef.current

		scrollToEnd(isSameTranscript && hasNewRow ? behavior : "auto")
		if (rows > 0) {
			landedKeyRef.current = transcriptKey
			landedRowsRef.current = rows
		}
	}, [behavior, scrollToEnd, transcriptKey])

	const returnToLiveEdge = useCallback(
		(nextBehavior: ScrollBehavior = behavior) => {
			setFollowing(true)
			scrollToEnd(nextBehavior)
		},
		[behavior, scrollToEnd, setFollowing],
	)

	const scrollToMessage = useCallback(
		(messageId: string, nextBehavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			const anchor = viewport && anchorFor(viewport, messageId)
			if (!anchor) return false

			setFollowing(false)
			holdProgrammaticScroll(centeredTop(viewport, anchor))
			anchor.scrollIntoView({ behavior: nextBehavior, block: "center" })
			rememberPosition(viewport)
			return true
		},
		[holdProgrammaticScroll, rememberPosition, setFollowing],
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
		if (!viewport) return

		const hasReaderMovedUp = viewport.scrollTop < lastScrollTopRef.current
		lastScrollTopRef.current = viewport.scrollTop

		if (programmaticScrollRef.current) {
			const isReaderTakingOver =
				hasReaderMovedUp && isTravellingDown(viewport, targetTopRef.current)

			if (
				!isReaderTakingOver &&
				!hasReachedTarget(viewport, targetTopRef.current)
			) {
				deferSettle()
				return
			}
			releaseProgrammaticScroll()
		}

		if (pinRef.current) pinTopVisibleRow()

		if (hasReaderMovedUp) syncFollowing()
		else holdLastBubble()
	}, [
		deferSettle,
		holdLastBubble,
		pinTopVisibleRow,
		releaseProgrammaticScroll,
		syncFollowing,
	])

	const requestOlder = () => {
		if (!older || older.isLoading) return
		pinTopVisibleRow()
		older.onLoad()
	}

	useImperativeHandle(
		scrollerRef,
		() => ({
			scrollToEnd: returnToLiveEdge,
			scrollToMessage: (messageId, nextBehavior) =>
				scrollToMessage(messageId, nextBehavior ?? behavior),
			isFollowing: () => followingRef.current,
		}),
		[behavior, returnToLiveEdge, scrollToMessage],
	)

	useLayoutEffect(() => {
		setFollowing(followOutput)
		if (!followOutput) return

		frameRef.current = requestAnimationFrame(landOnLiveEdge)
		return () => {
			if (frameRef.current) cancelAnimationFrame(frameRef.current)
		}
	}, [followOutput, landOnLiveEdge, setFollowing])

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
			holdProgrammaticScroll(viewport.scrollTop + drift)
			viewport.scrollTop += drift
			rememberPosition(viewport)
		}
		if (!older?.isLoading) pinRef.current = null
	})

	useEffect(() => {
		const content = contentRef.current
		const viewport = viewportRef.current
		if (!content || !viewport || typeof ResizeObserver === "undefined") return

		const observer = new ResizeObserver(() => {
			if (pinRef.current) return
			if (!followOutput || !followingRef.current) return
			landOnLiveEdge()
		})
		observer.observe(content)
		observer.observe(viewport)

		return () => observer.disconnect()
	}, [followOutput, landOnLiveEdge])

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
			className={cn("relative min-h-0", className)}
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
					releaseProgrammaticScroll()
					onViewportWheel?.(event)
				}}
				onTouchStart={(event) => {
					releaseProgrammaticScroll()
					onViewportTouchStart?.(event)
				}}
				onKeyDown={(event) => {
					if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
						releaseProgrammaticScroll()
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
					<MessageHighlightProvider messageId={highlightedMessageId}>
						{children}
					</MessageHighlightProvider>
				</div>
			</motion.section>

			<AnimatePresence>
				{isAtLiveEdge ? null : (
					<motion.div
						data-slot="message-scroller-live-edge"
						className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
						initial={JUMP_HIDDEN}
						animate={JUMP_VISIBLE}
						exit={JUMP_HIDDEN}
						transition={reduce ? TRANSITION_NONE : SPRING_PANEL}
					>
						<Button
							variant="secondary"
							size="sm"
							className="pointer-events-auto rounded-full shadow-xl"
							onClick={() => returnToLiveEdge()}
						>
							<Icons.ArrowDown data-icon="inline-start" />
							{t("transcript.jumpToLatest")}
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
