"use client"

import { useReducedMotion } from "motion/react"
import {
	type ComponentPropsWithRef,
	memo,
	type ReactNode,
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { MessageHighlightProvider } from "@workspace/ui/components/message-highlight-context"
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
	useMessageScrollerScrollable,
} from "@workspace/ui/components/message-scroller"
import { cn } from "@workspace/ui/lib/utils"

export interface TranscriptItem {
	key: string
	messageIds?: string[]
	isAnchor?: boolean
	render: () => ReactNode
}

export interface TranscriptOlder {
	has: boolean
	isLoading?: boolean
	onLoad: () => void
	label?: string
	startOfHistoryLabel?: string
}

export interface TranscriptHandle {
	scrollToEnd: (behavior?: ScrollBehavior) => void
	scrollToMessage: (messageId: string, behavior?: ScrollBehavior) => boolean
}

export interface TranscriptProps extends ComponentPropsWithRef<"div"> {
	rows?: TranscriptItem[]
	transcriptKey?: string
	anchorOnSend?: boolean
	marksNewMessages?: boolean
	countsNewMessages?: boolean
	onFollowChange?: (following: boolean) => void
	label?: string
	busy?: boolean
	highlightedMessageId?: string
	older?: TranscriptOlder
	scrollerRef?: Ref<TranscriptHandle>
	contentClassName?: string
}

const NO_ROWS: TranscriptItem[] = []

const indexOfKey = (rows: TranscriptItem[], key: string | null) =>
	key === null ? -1 : rows.findIndex((row) => row.key === key)

const keyAfter = (rows: TranscriptItem[], key: string | null) => {
	const index = indexOfKey(rows, key)
	return index < 0 ? undefined : rows[index + 1]?.key
}

const messagesAfter = (rows: TranscriptItem[], key: string | null) => {
	const index = indexOfKey(rows, key)
	if (index < 0) return 0

	let counted = 0
	for (let next = index + 1; next < rows.length; next += 1) {
		counted += rows[next].messageIds?.length ?? 1
	}
	return counted
}

const lastAnchorKey = (rows: TranscriptItem[]) => {
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		if (rows[index].isAnchor) return rows[index].key
	}
}

const rowHolding = (rows: TranscriptItem[], messageId: string) =>
	rows.find(
		(row) => row.key === messageId || row.messageIds?.includes(messageId),
	)

const RowContent = memo(({ render }: { render: () => ReactNode }) => (
	<>{render()}</>
))

type NewMarksInput = {
	rows: TranscriptItem[]
	isFollowing: boolean
	onFollowChange?: (following: boolean) => void
}

const useNewMarks = ({ rows, isFollowing, onFollowChange }: NewMarksInput) => {
	const [releasedAfterKey, setReleasedAfterKey] = useState<string | null>(null)
	const [markedAfterKey, setMarkedAfterKey] = useState<string | null>(null)
	const lastRowKeyRef = useRef<string | undefined>(undefined)
	const wasFollowingRef = useRef(true)

	lastRowKeyRef.current = rows.at(-1)?.key

	useEffect(() => {
		if (wasFollowingRef.current === isFollowing) return

		wasFollowingRef.current = isFollowing
		onFollowChange?.(isFollowing)
		if (isFollowing) return

		const lastRowKey = lastRowKeyRef.current
		if (lastRowKey === undefined) return

		setReleasedAfterKey(lastRowKey)
		setMarkedAfterKey((current) => current ?? lastRowKey)
	}, [isFollowing, onFollowChange])

	return { markedAfterKey, releasedAfterKey }
}

const useTranscriptHandle = (
	scrollerRef: Ref<TranscriptHandle> | undefined,
	rows: TranscriptItem[],
	defaultBehavior: ScrollBehavior,
) => {
	const { scrollToEnd, scrollToMessage } = useMessageScroller()
	const rowsRef = useRef(rows)

	rowsRef.current = rows

	useImperativeHandle(
		scrollerRef,
		() => ({
			scrollToEnd: (behavior = defaultBehavior) => {
				scrollToEnd({ behavior })
			},
			scrollToMessage: (messageId, behavior = defaultBehavior) => {
				const row = rowHolding(rowsRef.current, messageId)
				return row
					? scrollToMessage(row.key, { align: "center", behavior })
					: false
			},
		}),
		[defaultBehavior, scrollToEnd, scrollToMessage],
	)
}

type TranscriptOlderControlProps = {
	older: TranscriptOlder
	isStill: boolean
}

const TranscriptOlderControl = ({
	older,
	isStill,
}: TranscriptOlderControlProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="transcript-older"
			className="flex min-h-9 items-center justify-center px-3"
		>
			{older.has ? (
				<Button
					variant="ghost"
					size="sm"
					aria-busy={older.isLoading}
					aria-disabled={older.isLoading}
					className="aria-disabled:opacity-60"
					onClick={() => {
						if (!older.isLoading) older.onLoad()
					}}
				>
					{older.isLoading ? (
						<Icons.Loading
							data-icon="inline-start"
							className={cn(!isStill && "animate-spin")}
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
	)
}

const TranscriptNewMark = () => {
	const { t } = useTranslation("chat")

	return (
		<div data-slot="transcript-new-mark" className="flex items-center gap-3">
			<span aria-hidden="true" className="h-px flex-1 bg-transcript-new-mark" />
			<span className="font-medium text-transcript-new-mark text-xs">
				{t("transcript.newMessages")}
			</span>
			<span aria-hidden="true" className="h-px flex-1 bg-transcript-new-mark" />
		</div>
	)
}

type TranscriptBodyProps = Omit<TranscriptProps, "transcriptKey">

const TranscriptBody = ({
	rows = NO_ROWS,
	anchorOnSend,
	marksNewMessages,
	countsNewMessages,
	onFollowChange,
	label,
	busy,
	highlightedMessageId,
	older,
	scrollerRef,
	contentClassName,
	className,
	children,
	...props
}: TranscriptBodyProps) => {
	const { t } = useTranslation("chat")
	const isStill = useReducedMotion() ?? false
	const behavior: ScrollBehavior = isStill ? "auto" : "smooth"
	const { end: hasContentBelow } = useMessageScrollerScrollable()
	const { markedAfterKey, releasedAfterKey } = useNewMarks({
		rows,
		isFollowing: !hasContentBelow,
		onFollowChange,
	})

	useTranscriptHandle(scrollerRef, rows, behavior)

	const anchorKey = anchorOnSend ? lastAnchorKey(rows) : undefined
	const markKey = marksNewMessages ? keyAfter(rows, markedAfterKey) : undefined
	const newCount = countsNewMessages ? messagesAfter(rows, releasedAfterKey) : 0

	return (
		<MessageScroller className={cn("min-h-0", className)} {...props}>
			<MessageScrollerViewport
				aria-label={label ?? t("transcript.label")}
				className="scrollbar-overlay focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				{older ? (
					<TranscriptOlderControl isStill={isStill} older={older} />
				) : null}

				<MessageScrollerContent
					aria-busy={busy}
					className={cn("gap-6", contentClassName)}
				>
					<MessageHighlightProvider messageId={highlightedMessageId}>
						{rows.map((row) => (
							<MessageScrollerItem
								className="flex flex-col gap-6 [content-visibility:visible]"
								key={row.key}
								messageId={row.key}
								scrollAnchor={row.key === anchorKey}
							>
								{row.key === markKey ? <TranscriptNewMark /> : null}
								<RowContent render={row.render} />
							</MessageScrollerItem>
						))}
						{children}
					</MessageHighlightProvider>
				</MessageScrollerContent>
			</MessageScrollerViewport>

			<MessageScrollerButton
				behavior={behavior}
				className="start-1/2 rounded-full shadow-xl tabular-nums"
				size="sm"
				variant="secondary"
			>
				<Icons.ArrowDown data-icon="inline-start" />
				{newCount > 0
					? t("transcript.newCounted", { count: newCount })
					: t("transcript.jumpToLatest")}
			</MessageScrollerButton>
		</MessageScroller>
	)
}

function Transcript({ transcriptKey, ...props }: TranscriptProps) {
	return (
		<MessageScrollerProvider
			autoScroll
			defaultScrollPosition="end"
			key={transcriptKey}
		>
			<TranscriptBody {...props} />
		</MessageScrollerProvider>
	)
}

export { Transcript }
