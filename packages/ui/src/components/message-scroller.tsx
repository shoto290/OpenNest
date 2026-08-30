"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	useReducedMotion,
} from "motion/react"
import {
	type ComponentPropsWithRef,
	memo,
	type ReactNode,
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
import { useOverlayScroll } from "@workspace/ui/hooks/use-overlay-scroll"
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const ESTIMATED_ROW_HEIGHT = 120

const ROW_OVERSCAN = 3

const JUMP_HIDDEN = { opacity: 0, y: 6 } as const
const JUMP_VISIBLE = { opacity: 1, y: 0 } as const

const distanceFromEnd = (viewport: HTMLElement) =>
	viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight

const isOnLastBubble = (viewport: HTMLElement, threshold: number) =>
	distanceFromEnd(viewport) <= threshold

const anchorFor = (viewport: HTMLElement, messageId: string) => {
	for (const anchor of viewport.querySelectorAll<HTMLElement>(
		"[data-message-id]",
	)) {
		if (anchor.dataset.messageId === messageId) return anchor
	}
}

const offsetWithinViewport = (list: HTMLElement, viewport: HTMLElement) =>
	list.getBoundingClientRect().top -
	viewport.getBoundingClientRect().top +
	viewport.scrollTop

const nextFrames = (run: () => void) => {
	const outer = requestAnimationFrame(() => requestAnimationFrame(run))
	return () => cancelAnimationFrame(outer)
}

export interface MessageScrollerHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	scrollToMessage: (messageId: string, behavior?: ScrollBehavior) => boolean
	isFollowing: () => boolean
}

export interface MessageScrollerRow {
	key: string
	messageIds?: string[]
	render: () => ReactNode
}

export interface MessageScrollerOlder {
	has: boolean
	isLoading?: boolean
	onLoad: () => void
	label?: string
	startOfHistoryLabel?: string
}

export interface MessageScrollerProps extends ComponentPropsWithRef<"div"> {
	rows?: MessageScrollerRow[]
	rowGap?: number
	estimatedRowHeight?: number
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

const RowContent = memo(({ render }: { render: () => ReactNode }) => (
	<>{render()}</>
))

const NO_ROWS: MessageScrollerRow[] = []

export function MessageScroller({
	rows = NO_ROWS,
	rowGap = 0,
	estimatedRowHeight = ESTIMATED_ROW_HEIGHT,
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
	const overlayScroll = useOverlayScroll()
	const listRef = useRef<HTMLDivElement>(null)
	const tailRef = useRef<HTMLDivElement>(null)
	const followingRef = useRef(followOutput)
	const [isAtLiveEdge, setIsAtLiveEdge] = useState(followOutput)
	const [listOffset, setListOffset] = useState(0)
	const landingRef = useRef(false)
	const holdFrameRef = useRef<number | undefined>(undefined)
	const lastScrollTopRef = useRef(0)
	const centerFrameRef = useRef<(() => void) | undefined>(undefined)
	const landedKeyRef = useRef(transcriptKey)
	const landedRowsRef = useRef(0)
	const hasRows = rows.length > 0
	const behavior: ScrollBehavior = reduce || !smooth ? "auto" : "smooth"
	const {
		onScroll: onViewportScroll,
		onWheel: onViewportWheel,
		onTouchStart: onViewportTouchStart,
		onKeyDown: onViewportKeyDown,
		...restViewportProps
	} = viewportProps ?? {}

	const scrollViewportToEnd = useCallback((nextBehavior: ScrollBehavior) => {
		const viewport = viewportRef.current
		if (!viewport || distanceFromEnd(viewport) <= 1) return

		landingRef.current = true
		if (typeof viewport.scrollTo === "function") {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior: nextBehavior })
		} else {
			viewport.scrollTop = viewport.scrollHeight
		}
		lastScrollTopRef.current = viewport.scrollTop
	}, [])

	const measureListOffset = useCallback(() => {
		const list = listRef.current
		const viewport = viewportRef.current
		if (!list || !viewport) return

		const offset = offsetWithinViewport(list, viewport)
		setListOffset((current) =>
			Math.abs(current - offset) <= 1 ? current : offset,
		)
	}, [])

	const holdLiveEdge = useCallback(() => {
		if (holdFrameRef.current) return

		holdFrameRef.current = requestAnimationFrame(() => {
			holdFrameRef.current = undefined
		})
		if (!followOutput || !followingRef.current) return

		scrollViewportToEnd("auto")
	}, [followOutput, scrollViewportToEnd])

	const virtualizer = useVirtualizer({
		anchorTo: "end",
		directDomUpdates: true,
		count: rows.length,
		estimateSize: () => estimatedRowHeight,
		gap: rowGap,
		getItemKey: (index) => rows[index]?.key ?? index,
		getScrollElement: () => viewportRef.current,
		onChange: holdLiveEdge,
		overscan: ROW_OVERSCAN,
		scrollEndThreshold: followThreshold,
		scrollMargin: listOffset,
	})

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

	const returnToLiveEdge = useCallback(
		(nextBehavior: ScrollBehavior = behavior) => {
			setFollowing(true)
			scrollViewportToEnd(nextBehavior)
		},
		[behavior, scrollViewportToEnd, setFollowing],
	)

	const centerAnchor = useCallback(
		(messageId: string, nextBehavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			const anchor = viewport && anchorFor(viewport, messageId)
			if (!anchor) return false

			anchor.scrollIntoView({ behavior: nextBehavior, block: "center" })
			return true
		},
		[],
	)

	const scrollToMessage = useCallback(
		(messageId: string, nextBehavior: ScrollBehavior) => {
			landingRef.current = false
			if (centerAnchor(messageId, nextBehavior)) {
				setFollowing(false)
				return true
			}

			const index = rows.findIndex((row) => row.messageIds?.includes(messageId))
			if (index < 0) return false

			setFollowing(false)
			virtualizer.scrollToIndex(index, { align: "center", behavior: "auto" })
			centerFrameRef.current?.()
			centerFrameRef.current = nextFrames(() => centerAnchor(messageId, "auto"))
			return true
		},
		[centerAnchor, rows, setFollowing, virtualizer],
	)

	const handleScroll = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport) return

		const hasReaderMovedUp = viewport.scrollTop < lastScrollTopRef.current
		lastScrollTopRef.current = viewport.scrollTop

		const atLiveEdge = isOnLastBubble(viewport, followThreshold)
		if (landingRef.current && !atLiveEdge && !hasReaderMovedUp) return

		landingRef.current = false
		if (hasReaderMovedUp) setFollowing(atLiveEdge)
		else if (atLiveEdge) setFollowing(true)
	}, [followThreshold, setFollowing])

	const releaseLanding = useCallback(() => {
		landingRef.current = false
	}, [])

	const requestOlder = () => {
		if (!older || older.isLoading) return
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

	useLayoutEffect(measureListOffset)

	useLayoutEffect(() => {
		setFollowing(followOutput)
	}, [followOutput, setFollowing])

	useLayoutEffect(() => {
		const { count } = virtualizer.options
		const isSameTranscript = landedKeyRef.current === transcriptKey
		if (isSameTranscript && count === landedRowsRef.current) return

		const hasLandedBefore = isSameTranscript && landedRowsRef.current > 0
		landedKeyRef.current = transcriptKey
		landedRowsRef.current = count
		if (!isSameTranscript) setFollowing(followOutput)
		if (!followOutput || !followingRef.current) return

		scrollViewportToEnd(hasLandedBefore ? behavior : "auto")
	})

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || typeof ResizeObserver === "undefined") return

		const tail = hasRows ? tailRef.current : null
		const observer = new ResizeObserver(() => {
			measureListOffset()
			holdLiveEdge()
		})
		observer.observe(viewport)
		if (tail) observer.observe(tail)

		return () => observer.disconnect()
	}, [holdLiveEdge, measureListOffset, hasRows])

	useEffect(
		() => () => {
			centerFrameRef.current?.()
			if (holdFrameRef.current) cancelAnimationFrame(holdFrameRef.current)
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
				ref={mergeRefs<HTMLElement>(overlayScroll, setViewportRef)}
				aria-label={label ?? t("transcript.label")}
				tabIndex={0}
				{...restViewportProps}
				onScroll={(event) => {
					handleScroll()
					onViewportScroll?.(event)
				}}
				onWheel={(event) => {
					releaseLanding()
					onViewportWheel?.(event)
				}}
				onTouchStart={(event) => {
					releaseLanding()
					onViewportTouchStart?.(event)
				}}
				onKeyDown={(event) => {
					if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
						releaseLanding()
					}
					onViewportKeyDown?.(event)
				}}
				className={cn(
					"h-full overflow-y-auto overscroll-contain outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
					role="log"
					aria-live="polite"
					aria-relevant="additions text"
					aria-busy={busy}
					className={contentClassName}
					{...contentProps}
					style={{ gap: rowGap, ...contentProps?.style }}
				>
					<MessageHighlightProvider messageId={highlightedMessageId}>
						{hasRows ? (
							<>
								<div
									ref={mergeRefs<HTMLDivElement>(
										listRef,
										virtualizer.containerRef,
									)}
									data-slot="message-scroller-rows"
									className="relative w-full"
									style={{ height: virtualizer.getTotalSize() }}
								>
									{virtualizer.getVirtualItems().map((item) => (
										<div
											key={item.key}
											data-index={item.index}
											data-slot="message-scroller-row"
											ref={virtualizer.measureElement}
											className="absolute inset-x-0 top-0"
											style={{
												transform: `translateY(${item.start - listOffset}px)`,
											}}
										>
											<RowContent render={rows[item.index].render} />
										</div>
									))}
								</div>
								<div
									ref={tailRef}
									data-slot="message-scroller-tail"
									className="flex flex-col"
									style={{ gap: rowGap }}
								>
									{children}
								</div>
							</>
						) : (
							children
						)}
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
