"use client"

import {
	useVirtualizer,
	type VirtualItem,
	type Virtualizer,
} from "@tanstack/react-virtual"
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
import { SPRING_PANEL, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import {
	isScrollSpringAtRest,
	type ScrollSpringState,
	stepScrollSpring,
} from "@workspace/ui/lib/scroll-spring"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const ESTIMATED_ROW_HEIGHT = 120

const ROW_OVERSCAN = 3

const AIM_FRAME_BUDGET = 20

const TRAVEL_FRAME_CAP = 600

const REST_SPRING: ScrollSpringState = { position: 0, velocity: 0 }

const JUMP_INSET = 12

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

const holdsReadingPosition = (
	item: VirtualItem,
	_delta: number,
	instance: Virtualizer<HTMLElement, Element>,
) => {
	const fold = (instance.scrollOffset ?? 0) + instance.scrollAdjustments
	return instance.itemSizeCache.has(item.key)
		? item.end <= fold
		: item.start < fold
}

const indexOfKey = (rows: MessageScrollerRow[], key: string | null) =>
	key === null ? -1 : rows.findIndex((row) => row.key === key)

const keyAfter = (rows: MessageScrollerRow[], key: string | null) => {
	const index = indexOfKey(rows, key)
	return index < 0 ? undefined : rows[index + 1]?.key
}

const messagesAfter = (rows: MessageScrollerRow[], key: string | null) => {
	const index = indexOfKey(rows, key)
	if (index < 0) return 0

	let counted = 0
	for (let next = index + 1; next < rows.length; next += 1) {
		counted += rows[next].messageIds?.length ?? 1
	}
	return counted
}

type MessageScrollerTracePhase = "landing" | "live"

type MessageScrollerTraceDetail =
	| {
			type: "scroll-to-end"
			behavior: ScrollBehavior
			target: number
			totalSize: number
	  }
	| {
			type: "size-change"
			previousTotalSize: number
			totalSize: number
			distanceFromEnd: number
	  }
	| { type: "reader-scroll"; atLiveEdge: boolean; isFollowing: boolean }

export type MessageScrollerTrace = MessageScrollerTraceDetail & {
	seq: number
	phase: MessageScrollerTracePhase
	scrollTop: number
	scrollHeight: number
}

export interface MessageScrollerHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	scrollToMessage: (messageId: string, behavior?: ScrollBehavior) => boolean
	anchorSend: () => void
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
	anchorOnSend?: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	onFollowChange?: (following: boolean) => void
	onLandingTrace?: (event: MessageScrollerTrace) => void
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
	anchorOnSend = false,
	marksNewMessages = false,
	countsNewMessages = false,
	onFollowChange,
	onLandingTrace,
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
	const listRef = useRef<HTMLDivElement>(null)
	const tailRef = useRef<HTMLDivElement>(null)
	const roomRef = useRef<HTMLDivElement>(null)
	const followingRef = useRef(followOutput)
	const [isAtLiveEdge, setIsAtLiveEdge] = useState(followOutput)
	const [listOffset, setListOffset] = useState(0)
	const [tailClearance, setTailClearance] = useState(0)
	const landingRef = useRef(false)
	const holdFrameRef = useRef<number | undefined>(undefined)
	const hasMissedResizeRef = useRef(false)
	const lastScrollTopRef = useRef(0)
	const heldViewportHeightRef = useRef(0)
	const isHoldPendingRef = useRef(false)
	const aimFrameRef = useRef<number | undefined>(undefined)
	const landingFrameRef = useRef<number | undefined>(undefined)
	const landedKeyRef = useRef(transcriptKey)
	const landedRowsRef = useRef(0)
	const traceRef = useRef(onLandingTrace)
	const virtualizerRef = useRef<Virtualizer<HTMLElement, Element> | null>(null)
	const traceSeqRef = useRef(0)
	const tracedTotalSizeRef = useRef(0)
	const tracePhaseRef = useRef<MessageScrollerTracePhase>("landing")
	const springRef = useRef<ScrollSpringState>(REST_SPRING)
	const rowsRef = useRef(rows)
	const pendingSendRef = useRef<number | undefined>(undefined)
	const anchorKeyRef = useRef<string | undefined>(undefined)
	const [countAfterKey, setCountAfterKey] = useState<string | null>(null)
	const [separatorAfterKey, setSeparatorAfterKey] = useState<string | null>(
		null,
	)
	const hasRows = rows.length > 0
	const behavior: ScrollBehavior = reduce || !smooth ? "auto" : "smooth"
	const {
		onScroll: onViewportScroll,
		onWheel: onViewportWheel,
		onTouchStart: onViewportTouchStart,
		onKeyDown: onViewportKeyDown,
		...restViewportProps
	} = viewportProps ?? {}

	traceRef.current = onLandingTrace
	rowsRef.current = rows

	const emitTrace = useCallback((detail: MessageScrollerTraceDetail) => {
		const sink = traceRef.current
		const viewport = viewportRef.current
		if (!sink || !viewport) return

		traceSeqRef.current += 1
		sink({
			...detail,
			seq: traceSeqRef.current,
			phase: tracePhaseRef.current,
			scrollTop: viewport.scrollTop,
			scrollHeight: viewport.scrollHeight,
		})
	}, [])

	const traceScrollRequest = useCallback(
		(nextBehavior: ScrollBehavior, viewport: HTMLElement) => {
			if (!traceRef.current) return

			emitTrace({
				type: "scroll-to-end",
				behavior: nextBehavior,
				target: viewport.scrollHeight,
				totalSize: virtualizerRef.current?.getTotalSize() ?? 0,
			})
		},
		[emitTrace],
	)

	const traceSizeChange = useCallback(() => {
		const viewport = viewportRef.current
		if (!traceRef.current || !viewport) return

		const totalSize = virtualizerRef.current?.getTotalSize() ?? 0
		emitTrace({
			type: "size-change",
			previousTotalSize: tracedTotalSizeRef.current,
			totalSize,
			distanceFromEnd: distanceFromEnd(viewport),
		})
		tracedTotalSizeRef.current = totalSize
	}, [emitTrace])

	const traceReaderScroll = useCallback(
		(atLiveEdge: boolean) => {
			if (!traceRef.current) return

			emitTrace({
				type: "reader-scroll",
				atLiveEdge,
				isFollowing: followingRef.current,
			})
		},
		[emitTrace],
	)

	const aimAtEnd = useCallback(
		(nextBehavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			if (!viewport) return true

			heldViewportHeightRef.current = viewport.clientHeight
			if (distanceFromEnd(viewport) <= 1) {
				springRef.current = REST_SPRING
				return true
			}

			traceScrollRequest(nextBehavior, viewport)
			landingRef.current = true
			if (nextBehavior === "smooth") {
				const target = viewport.scrollHeight - viewport.clientHeight
				springRef.current = stepScrollSpring(
					{
						position: viewport.scrollTop,
						velocity: springRef.current.velocity,
					},
					target,
				)
				viewport.scrollTop = isScrollSpringAtRest(springRef.current, target)
					? target
					: springRef.current.position
			} else if (typeof viewport.scrollTo === "function") {
				viewport.scrollTo({
					top: viewport.scrollHeight,
					behavior: nextBehavior,
				})
			} else {
				viewport.scrollTop = viewport.scrollHeight
			}
			lastScrollTopRef.current = viewport.scrollTop
			return false
		},
		[traceScrollRequest],
	)

	const stopLanding = useCallback(() => {
		if (landingFrameRef.current === undefined) return

		cancelAnimationFrame(landingFrameRef.current)
		landingFrameRef.current = undefined
	}, [])

	const holdAimAtEnd = useCallback(
		(nextBehavior: ScrollBehavior) => {
			let restFrames = AIM_FRAME_BUDGET
			let framesLeft = TRAVEL_FRAME_CAP

			const reaim = () => {
				landingFrameRef.current = undefined
				framesLeft -= 1
				if (framesLeft <= 0 || !followingRef.current) return

				restFrames = aimAtEnd(nextBehavior) ? restFrames - 1 : AIM_FRAME_BUDGET
				if (restFrames <= 0) return

				landingFrameRef.current = requestAnimationFrame(reaim)
			}

			stopLanding()
			landingFrameRef.current = requestAnimationFrame(reaim)
		},
		[aimAtEnd, stopLanding],
	)

	const scrollViewportToEnd = useCallback(
		(nextBehavior: ScrollBehavior) => {
			aimAtEnd(nextBehavior)
			holdAimAtEnd(nextBehavior)
		},
		[aimAtEnd, holdAimAtEnd],
	)

	const measureListOffset = useCallback(() => {
		const list = listRef.current
		const viewport = viewportRef.current
		if (!list || !viewport) return

		const offset = offsetWithinViewport(list, viewport)
		setListOffset((current) =>
			Math.abs(current - offset) <= 1 ? current : offset,
		)
	}, [])

	const measureSendRoom = useCallback(() => {
		const viewport = viewportRef.current
		const room = roomRef.current
		const anchorKey = anchorKeyRef.current
		if (!viewport || !room || anchorKey === undefined) return

		const anchor = virtualizerRef.current
			?.getVirtualItems()
			.find((item) => item.key === anchorKey)
		const contentBelowAnchor = anchor
			? viewport.scrollHeight - room.offsetHeight - anchor.start
			: viewport.clientHeight
		const height = Math.max(0, viewport.clientHeight - contentBelowAnchor)

		room.style.height = `${height}px`
		room.style.display = height === 0 ? "none" : "block"
		if (height === 0) anchorKeyRef.current = undefined
	}, [])

	const measureTailClearance = useCallback(() => {
		const viewport = viewportRef.current
		const tail = tailRef.current
		if (!viewport || !tail || followingRef.current) return

		const frame = viewport.getBoundingClientRect()
		const box = tail.getBoundingClientRect()
		const overlap = box.height === 0 ? 0 : frame.bottom - box.top
		const clearance = Math.max(0, Math.min(overlap, frame.height / 2))

		setTailClearance((current) =>
			Math.abs(current - clearance) <= 1 ? current : clearance,
		)
	}, [])

	const holdLiveEdge = useCallback(() => {
		traceSizeChange()
		measureSendRoom()
		measureTailClearance()
		if (holdFrameRef.current) {
			hasMissedResizeRef.current = true
			return
		}

		holdFrameRef.current = requestAnimationFrame(() => {
			holdFrameRef.current = undefined
			if (!hasMissedResizeRef.current) return

			hasMissedResizeRef.current = false
			if (!followOutput || !followingRef.current) return

			scrollViewportToEnd("auto")
		})
		if (!followOutput || !followingRef.current) return

		scrollViewportToEnd("auto")
	}, [
		followOutput,
		measureSendRoom,
		measureTailClearance,
		scrollViewportToEnd,
		traceSizeChange,
	])

	const virtualizer = useVirtualizer({
		anchorTo: "end",
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

	virtualizerRef.current = virtualizer
	virtualizer.shouldAdjustScrollPositionOnItemSizeChange = holdsReadingPosition

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

	const markRelease = useCallback(() => {
		const lastKey = rowsRef.current.at(-1)?.key
		if (lastKey === undefined) return

		setCountAfterKey(lastKey)
		setSeparatorAfterKey((current) => current ?? lastKey)
	}, [])

	const setFollowing = useCallback(
		(next: boolean) => {
			if (followingRef.current === next) return
			followingRef.current = next
			setIsAtLiveEdge(next)
			if (!next) markRelease()
			onFollowChange?.(next)
		},
		[markRelease, onFollowChange],
	)

	const stopAiming = useCallback(() => {
		if (aimFrameRef.current === undefined) return

		cancelAnimationFrame(aimFrameRef.current)
		aimFrameRef.current = undefined
	}, [])

	const returnToLiveEdge = useCallback(
		(nextBehavior: ScrollBehavior = behavior) => {
			stopAiming()
			springRef.current = REST_SPRING
			setFollowing(true)
			scrollViewportToEnd(nextBehavior)
		},
		[behavior, scrollViewportToEnd, setFollowing, stopAiming],
	)

	const anchorSend = useCallback(() => {
		if (anchorOnSend) pendingSendRef.current = rowsRef.current.length
		returnToLiveEdge("auto")
	}, [anchorOnSend, returnToLiveEdge])

	const centerAnchor = useCallback(
		(messageId: string, nextBehavior: ScrollBehavior) => {
			const viewport = viewportRef.current
			const anchor = viewport && anchorFor(viewport, messageId)
			anchor?.scrollIntoView({ behavior: nextBehavior, block: "center" })
		},
		[],
	)

	const offsetOfRow = useCallback(
		(index: number) => virtualizer.getOffsetForIndex(index, "center")?.[0],
		[virtualizer],
	)

	const aimAtRow = useCallback(
		(index: number, messageId: string, nextBehavior: ScrollBehavior) => {
			virtualizer.scrollToIndex(index, {
				align: "center",
				behavior: nextBehavior,
			})
			centerAnchor(messageId, nextBehavior)
		},
		[centerAnchor, virtualizer],
	)

	const holdAimOnRow = useCallback(
		(index: number, messageId: string) => {
			let framesLeft = AIM_FRAME_BUDGET
			let lastOffset = offsetOfRow(index)

			const reaim = () => {
				const offset = offsetOfRow(index)
				const hasMoved = offset !== lastOffset
				lastOffset = offset
				framesLeft -= 1
				if (framesLeft <= 0) {
					aimFrameRef.current = undefined
					return
				}

				if (hasMoved) aimAtRow(index, messageId, "auto")
				aimFrameRef.current = requestAnimationFrame(reaim)
			}

			aimFrameRef.current = requestAnimationFrame(reaim)
		},
		[aimAtRow, offsetOfRow],
	)

	const scrollToMessage = useCallback(
		(messageId: string, nextBehavior: ScrollBehavior) => {
			landingRef.current = false
			stopLanding()
			stopAiming()

			const index = rows.findIndex((row) => row.messageIds?.includes(messageId))
			if (index < 0) return false

			setFollowing(false)
			aimAtRow(index, messageId, nextBehavior)
			holdAimOnRow(index, messageId)
			return true
		},
		[aimAtRow, holdAimOnRow, rows, setFollowing, stopAiming, stopLanding],
	)

	const handleScroll = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport) return

		const hasLostHeight = viewport.clientHeight < heldViewportHeightRef.current
		const hasReaderMovedUp = viewport.scrollTop < lastScrollTopRef.current
		lastScrollTopRef.current = viewport.scrollTop
		if (hasLostHeight && followOutput && followingRef.current) {
			isHoldPendingRef.current = true
		}

		const atLiveEdge = isOnLastBubble(viewport, followThreshold)
		traceReaderScroll(atLiveEdge)
		if (isHoldPendingRef.current) {
			isHoldPendingRef.current = !atLiveEdge
			return
		}

		if (landingRef.current && !atLiveEdge && !hasReaderMovedUp) return

		landingRef.current = false
		tracePhaseRef.current = "live"
		if (hasReaderMovedUp) setFollowing(atLiveEdge)
		else if (atLiveEdge) setFollowing(true)
		measureTailClearance()
	}, [
		followOutput,
		followThreshold,
		measureTailClearance,
		setFollowing,
		traceReaderScroll,
	])

	const forgetRelease = useCallback(() => {
		const room = roomRef.current
		anchorKeyRef.current = undefined
		if (room) {
			room.style.height = "0px"
			room.style.display = "none"
		}
		setCountAfterKey(null)
		setSeparatorAfterKey(null)
	}, [])

	const releaseLanding = useCallback(() => {
		landingRef.current = false
		tracePhaseRef.current = "live"
		isHoldPendingRef.current = false
		stopLanding()
		stopAiming()
	}, [stopAiming, stopLanding])

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
			anchorSend,
			isFollowing: () => followingRef.current,
		}),
		[anchorSend, behavior, returnToLiveEdge, scrollToMessage],
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
		const pendingSend = pendingSendRef.current
		landedKeyRef.current = transcriptKey
		landedRowsRef.current = count
		if (!isSameTranscript) {
			forgetRelease()
			pendingSendRef.current = undefined
			setFollowing(followOutput)
		} else if (pendingSend !== undefined && count > pendingSend) {
			pendingSendRef.current = undefined
			anchorKeyRef.current = rows.at(-1)?.key
		}

		measureSendRoom()
		if (!followOutput || !followingRef.current) return

		scrollViewportToEnd(
			hasLandedBefore && pendingSend === undefined ? behavior : "auto",
		)
	})

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || typeof ResizeObserver === "undefined") return

		const tail = tailRef.current
		const observer = new ResizeObserver(() => {
			measureListOffset()
			holdLiveEdge()
		})
		observer.observe(viewport)
		if (tail) observer.observe(tail)

		return () => observer.disconnect()
	}, [holdLiveEdge, measureListOffset])

	useEffect(
		() => () => {
			stopAiming()
			stopLanding()
			if (holdFrameRef.current) cancelAnimationFrame(holdFrameRef.current)
		},
		[stopAiming, stopLanding],
	)

	const separatorKey = marksNewMessages
		? keyAfter(rows, separatorAfterKey)
		: undefined
	const newMessagesLabel = t("transcript.newMessages")
	const newCount = countsNewMessages ? messagesAfter(rows, countAfterKey) : 0

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
					"h-full overflow-y-auto overscroll-contain outline-none scrollbar-overlay [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
										className="absolute inset-x-0 top-0 flex flex-col"
										style={{
											gap: rowGap,
											transform: `translateY(${item.start - listOffset}px)`,
										}}
									>
										{item.key === separatorKey ? (
											<div
												data-slot="message-scroller-new-line"
												className="flex items-center gap-3"
											>
												<span
													aria-hidden="true"
													className="h-px flex-1 bg-primary"
												/>
												<span className="font-medium text-foreground text-xs">
													{newMessagesLabel}
												</span>
												<span
													aria-hidden="true"
													className="h-px flex-1 bg-primary"
												/>
											</div>
										) : null}
										<RowContent render={rows[item.index].render} />
									</div>
								))}
							</div>
						) : null}
						<div
							ref={tailRef}
							data-slot="message-scroller-tail"
							className={cn("flex flex-col empty:hidden", !hasRows && "flex-1")}
							style={{ gap: rowGap }}
						>
							{children}
						</div>
						{anchorOnSend ? (
							<div
								ref={roomRef}
								data-slot="message-scroller-room"
								aria-hidden="true"
								style={{ display: "none" }}
							/>
						) : null}
					</MessageHighlightProvider>
				</div>
			</motion.section>

			<AnimatePresence>
				{isAtLiveEdge ? null : (
					<motion.div
						data-slot="message-scroller-live-edge"
						className="pointer-events-none absolute inset-x-0 flex justify-center"
						style={{ bottom: JUMP_INSET + tailClearance }}
						initial={JUMP_HIDDEN}
						animate={JUMP_VISIBLE}
						exit={JUMP_HIDDEN}
						transition={reduce ? TRANSITION_NONE : SPRING_PANEL}
					>
						<Button
							variant="secondary"
							size="sm"
							className="pointer-events-auto rounded-full shadow-xl tabular-nums"
							onClick={() => returnToLiveEdge()}
						>
							<Icons.ArrowDown data-icon="inline-start" />
							{newCount > 0
								? t("transcript.newCounted", { count: newCount })
								: t("transcript.jumpToLatest")}
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
