import { type RefObject, useImperativeHandle, useRef, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	MessageScroller,
	type MessageScrollerHandle,
	type MessageScrollerProps,
	type MessageScrollerRow,
} from "@workspace/ui/components/message-scroller"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import {
	CODE_ANSWER,
	MARKDOWN_ANSWER,
	MEASURED_ROWS,
	type MeasuredRow,
	ONE_LINE_REPLY,
	USER_MESSAGE,
} from "@workspace/ui/lib/measured-rows"
import { cn } from "@workspace/ui/lib/utils"

interface TranscriptEntry {
	id: string
	from: "user" | "assistant"
	text: string
}

const TRANSCRIPT: TranscriptEntry[] = [
	{
		id: "turn-1-user",
		from: "user",
		text: "Can you walk me through what the migration script touches?",
	},
	{
		id: "turn-1-assistant",
		from: "assistant",
		text: "It rewrites three tables: accounts, memberships and invites. Accounts gains a nullable region column, memberships loses the legacy role string, and invites moves its expiry to a timestamptz.",
	},
	{
		id: "turn-2-user",
		from: "user",
		text: "Is any of that destructive?",
	},
	{
		id: "turn-2-assistant",
		from: "assistant",
		text: "Only the memberships change. The legacy role string is copied into role_id before the column is dropped, so the drop is the last statement in the transaction.",
	},
	{
		id: "turn-3-user",
		from: "user",
		text: "What happens if the copy fails halfway?",
	},
	{
		id: "turn-3-assistant",
		from: "assistant",
		text: "The whole migration runs inside one transaction, so a failure rolls back every statement including the drop. Nothing is left half-migrated.",
	},
	{
		id: "turn-4-user",
		from: "user",
		text: "And the rollback path once it has already shipped?",
	},
	{
		id: "turn-4-assistant",
		from: "assistant",
		text: "The down migration recreates the role string from role_id. It is lossless for every row written by the up migration.",
	},
]

const SHORT_TRANSCRIPT: TranscriptEntry[] = [
	{
		id: "short-1-user",
		from: "user",
		text: "Ready when you are.",
	},
	{
		id: "short-1-assistant",
		from: "assistant",
		text: "Starting the dry run now.",
	},
]

const INCOMING: TranscriptEntry[] = [
	{
		id: "turn-5-user",
		from: "user",
		text: "Good. Queue it behind the index build.",
	},
	{
		id: "turn-5-assistant",
		from: "assistant",
		text: "Queued. The index build reports done at around four minutes, the migration starts right after it.",
	},
	{
		id: "turn-6-assistant",
		from: "assistant",
		text: "Both steps finished. Ada Martin approved the run in the deploy channel.",
	},
]

const OLDER_PAGES: TranscriptEntry[][] = [
	[
		{
			id: "older-2-user",
			from: "user",
			text: "Who wrote the first draft of the migration?",
		},
		{
			id: "older-2-assistant",
			from: "assistant",
			text: "Ada Martin drafted it last Thursday, then handed the review over once the invites table was added to the scope.",
		},
	],
	[
		{
			id: "older-1-user",
			from: "user",
			text: "Where did this whole plan start?",
		},
		{
			id: "older-1-assistant",
			from: "assistant",
			text: "With the billing incident: memberships carried two sources of truth for a role, and reconciling them by hand stopped scaling.",
		},
	],
]

const LONG_TRANSCRIPT_RUNS = 200

const MOUNTED_ROW_LIMIT = 20

const LONG_TRANSCRIPT: TranscriptEntry[] = Array.from(
	{ length: LONG_TRANSCRIPT_RUNS },
	(_, index) => ({
		id: `long-${index}`,
		from: index % 2 === 0 ? "user" : "assistant",
		text: `Run ${index + 1} of the resumed conversation.`,
	}),
)

const ANCHOR_TEXT = TRANSCRIPT[0].text

const distanceFromEnd = (viewport: HTMLElement) =>
	viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight

const settleScroll = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				setTimeout(resolve, 0)
			}),
		)
	})

const waitForLastBubble = (viewport: HTMLElement) =>
	waitFor(() => expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1))

const waitForOverflow = (viewport: HTMLElement) =>
	waitFor(() =>
		expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
	)

const holdsLastLineWhileStreaming = async (
	viewport: HTMLElement,
	isStreaming: () => boolean,
) => {
	let samples = 0
	while (isStreaming()) {
		await settleScroll()
		expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1)
		samples += 1
	}
	return samples
}

interface HistoryStartOptions {
	canvasElement: HTMLElement
	onFollowChange: MessageScrollerProps["onFollowChange"]
}

const scrollToHistoryStart = async ({
	canvasElement,
	onFollowChange,
}: HistoryStartOptions) => {
	const canvas = within(canvasElement)
	const viewport = canvas.getByRole("region", { name: "Conversation" })
	const anchorOffset = () =>
		canvas.getByText(ANCHOR_TEXT).getBoundingClientRect().top

	await waitForOverflow(viewport)
	await waitForLastBubble(viewport)
	viewport.scrollTop = 0
	await waitFor(() => expect(onFollowChange).toHaveBeenCalledWith(false))

	return { viewport, anchorOffset }
}

const FRAME_CLASS =
	"flex h-80 w-96 flex-col overflow-hidden rounded-xl border border-border bg-background"

const ROW_GAP = 8

const ROW_HEIGHT = 72

const TranscriptRow = ({ entry }: { entry: TranscriptEntry }) => (
	<div
		className={cn(
			"max-w-[85%] rounded-lg px-3 py-2 text-sm",
			entry.from === "user"
				? "ml-auto bg-secondary text-secondary-foreground"
				: "border border-border bg-card text-card-foreground",
		)}
	>
		{entry.text}
	</div>
)

const toRows = (entries: TranscriptEntry[]): MessageScrollerRow[] =>
	entries.map((entry) => ({
		key: entry.id,
		messageIds: [entry.id],
		render: () => <TranscriptRow entry={entry} />,
	}))

const TAIL_SEAT_HEIGHT = 40

const seatLabel = (index: number) => `Seat ${index + 1} waiting`

interface TailSeatsHandle {
	add: () => void
	clear: () => void
}

interface TailSeatsProps {
	seats: number
	seatsRef: RefObject<TailSeatsHandle | null>
}

const TailSeats = ({ seats, seatsRef }: TailSeatsProps) => {
	const [count, setCount] = useState(seats)

	useImperativeHandle(seatsRef, () => ({
		add: () => setCount((current) => current + 1),
		clear: () => setCount(0),
	}))

	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<div
					key={seatLabel(index)}
					className="flex items-center rounded-lg border border-border border-dashed px-3 text-muted-foreground text-xs"
					style={{ height: TAIL_SEAT_HEIGHT }}
				>
					{seatLabel(index)}
				</div>
			))}
		</>
	)
}

interface TranscriptScrollerProps
	extends Omit<MessageScrollerProps, "children" | "scrollerRef"> {
	entries?: TranscriptEntry[]
	incoming?: TranscriptEntry[]
	olderPages?: TranscriptEntry[][]
	hasComposer?: boolean
	tailSeats?: number
}

const TranscriptScroller = ({
	entries = TRANSCRIPT,
	incoming = INCOMING,
	olderPages,
	hasComposer,
	tailSeats,
	onFollowChange,
	...scrollerProps
}: TranscriptScrollerProps) => {
	const [visible, setVisible] = useState(entries)
	const seatsRef = useRef<TailSeatsHandle>(null)
	const [sent, setSent] = useState(0)
	const [pending, setPending] = useState(olderPages ?? [])
	const [isLoadingOlder, setIsLoadingOlder] = useState(false)
	const [composerRows, setComposerRows] = useState(1)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const nextIncoming = incoming[sent]

	const requestOlder = () => {
		scrollerProps.older?.onLoad()
		if (pending.length > 0) setIsLoadingOlder(true)
	}

	const deliverIncoming = () => {
		if (!nextIncoming) return
		setVisible((current) => [...current, nextIncoming])
		setSent((current) => current + 1)
	}

	const deliverOlder = () => {
		const page = pending[0]
		if (!page) return

		setVisible((current) => [...page, ...current])
		setPending((current) => current.slice(1))
		setIsLoadingOlder(false)
	}

	const older = olderPages
		? {
				has: pending.length > 0,
				isLoading: isLoadingOlder,
				onLoad: requestOlder,
			}
		: scrollerProps.older

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				{...scrollerProps}
				older={older}
				scrollerRef={scrollerRef}
				onFollowChange={onFollowChange}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				estimatedRowHeight={ROW_HEIGHT}
				rowGap={ROW_GAP}
				rows={toRows(visible)}
			>
				{tailSeats === undefined ? null : (
					<TailSeats seats={tailSeats} seatsRef={seatsRef} />
				)}
			</MessageScroller>
			<div className="flex items-center justify-between gap-2 border-border border-t p-2">
				<Button size="sm" disabled={!nextIncoming} onClick={deliverIncoming}>
					Send reply
				</Button>
				{isLoadingOlder ? (
					<Button size="sm" variant="outline" onClick={deliverOlder}>
						Deliver older page
					</Button>
				) : null}
				{hasComposer ? (
					<Button
						size="sm"
						variant="outline"
						onClick={() => setComposerRows((rows) => rows + 3)}
					>
						Grow composer
					</Button>
				) : null}
				{hasComposer ? (
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							scrollerRef.current?.anchorSend()
							deliverIncoming()
						}}
					>
						Send prompt
					</Button>
				) : null}
				{tailSeats === undefined ? null : (
					<Button
						size="sm"
						variant="outline"
						onClick={() => seatsRef.current?.add()}
					>
						Add seat
					</Button>
				)}
				{tailSeats === undefined ? null : (
					<Button
						size="sm"
						variant="outline"
						onClick={() => seatsRef.current?.clear()}
					>
						Clear seats
					</Button>
				)}
			</div>
			{hasComposer ? (
				<div
					className="shrink-0 border-border border-t p-2 text-muted-foreground text-xs"
					style={{ height: composerRows * 28 }}
				>
					Composer
				</div>
			) : null}
		</div>
	)
}

const STREAM_PROMPT: TranscriptEntry = {
	id: "stream-user",
	from: "user",
	text: "Walk me through the rollout, one step at a time.",
}

const STREAM_WORDS = (
	"The index build goes first and reports done at around four minutes. " +
	"The migration starts right after it, inside a single transaction, so the " +
	"copy into role_id and the drop of the legacy column either both land or " +
	"neither does. Once the transaction commits, the deploy channel gets the " +
	"summary and the invites backfill is queued behind it, which takes another " +
	"two minutes and touches nothing the accounts table depends on."
).split(" ")

const STREAM_TICK_MS = 16
const STREAM_TIMEOUT = { timeout: STREAM_TICK_MS * STREAM_WORDS.length * 4 }
const STREAM_LABEL = { streaming: "Streaming", idle: "Idle" }

const streamedAnswer = (words: number): TranscriptEntry => ({
	id: "stream-assistant",
	from: "assistant",
	text: STREAM_WORDS.slice(0, words).join(" "),
})

const StreamingTranscript = ({
	onFollowChange,
	...scrollerProps
}: Omit<MessageScrollerProps, "children" | "scrollerRef">) => {
	const [deliveredWords, setDeliveredWords] = useState(0)
	const [isStreaming, setIsStreaming] = useState(false)
	const [hasPrompt, setHasPrompt] = useState(false)

	const sendPrompt = () => {
		setHasPrompt(true)
		setDeliveredWords(0)
		setIsStreaming(true)

		let delivered = 0
		const timer = window.setInterval(() => {
			delivered += 1
			setDeliveredWords(delivered)
			if (delivered < STREAM_WORDS.length) return
			window.clearInterval(timer)
			setIsStreaming(false)
		}, STREAM_TICK_MS)
	}

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				{...scrollerProps}
				onFollowChange={onFollowChange}
				busy={isStreaming}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				estimatedRowHeight={ROW_HEIGHT}
				rowGap={ROW_GAP}
				rows={toRows([
					...TRANSCRIPT,
					...(hasPrompt ? [STREAM_PROMPT] : []),
					...(deliveredWords > 0 ? [streamedAnswer(deliveredWords)] : []),
				])}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button size="sm" disabled={isStreaming} onClick={sendPrompt}>
					Send prompt
				</Button>
				<span className="text-muted-foreground text-xs">
					{isStreaming ? STREAM_LABEL.streaming : STREAM_LABEL.idle}
				</span>
			</div>
		</div>
	)
}

const OTHER_TRANSCRIPT: TranscriptEntry[] = TRANSCRIPT.map((entry) => ({
	...entry,
	id: `other-${entry.id}`,
	text: `Second conversation — ${entry.text}`,
}))

const ConversationSwitcher = (
	props: Omit<MessageScrollerProps, "children" | "transcriptKey">,
) => {
	const [isSecond, setIsSecond] = useState(false)
	const [sent, setSent] = useState(0)
	const nextIncoming = INCOMING[sent]

	const openOther = () => {
		setIsSecond((current) => !current)
		setSent(0)
	}

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				{...props}
				transcriptKey={isSecond ? "second" : "first"}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				estimatedRowHeight={ROW_HEIGHT}
				rowGap={ROW_GAP}
				rows={toRows([
					...(isSecond ? OTHER_TRANSCRIPT : TRANSCRIPT),
					...INCOMING.slice(0, sent),
				])}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button size="sm" onClick={openOther}>
					Open other conversation
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!nextIncoming}
					onClick={() => setSent((current) => current + 1)}
				>
					Send reply
				</Button>
			</div>
		</div>
	)
}

const DROPPED_MESSAGE_ID = "turn-9-user"

const AnchoredTranscript = () => {
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const [highlightedMessageId, setHighlightedMessageId] = useState<string>()
	const [isMissing, setIsMissing] = useState(false)

	const jumpTo = (messageId: string) => {
		const reached =
			scrollerRef.current?.scrollToMessage(messageId, "auto") ?? false
		setHighlightedMessageId(reached ? messageId : undefined)
		setIsMissing(!reached)
	}

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				label="Conversation"
				scrollerRef={scrollerRef}
				highlightedMessageId={highlightedMessageId}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				estimatedRowHeight={ROW_HEIGHT}
				rowGap={ROW_GAP}
				rows={TRANSCRIPT.map((entry) => ({
					key: entry.id,
					messageIds: [entry.id],
					render: () =>
						entry.from === "user" ? (
							<UserTurn messageId={entry.id}>{entry.text}</UserTurn>
						) : (
							<AssistantTurn messageId={entry.id}>{entry.text}</AssistantTurn>
						),
				}))}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button size="sm" onClick={() => jumpTo(TRANSCRIPT[0].id)}>
					Jump to the quoted message
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() => jumpTo(DROPPED_MESSAGE_ID)}
				>
					Jump to a dropped message
				</Button>
				{isMissing ? (
					<span className="text-muted-foreground text-xs">Not on screen</span>
				) : null}
			</div>
		</div>
	)
}

const meta = preview.meta({
	title: "Conversation/Message/MessageScroller",
	component: MessageScroller,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Scroll container for a streamed transcript. It pins the viewport to the newest content while the reader sits at the live edge, and hands scroll control back the moment they move up into the history. It renders its own jump-to-latest control while the reader sits away from the live edge, reports the switch through `onFollowChange`, and exposes `scrollerRef.scrollToEnd()` so a host can return to the live edge when it accepts a prompt. Pass `older` to add the load-older control at the top of the viewport: the reader's anchor is held to the pixel while the page is prepended above it. Without that prop the affordance is not rendered at all. `scrollerRef.scrollToMessage(id)` brings a message anchored under `data-message-id` back into the middle of the viewport and answers whether it found one, and `highlightedMessageId` marks that message while the host names it. The transcript itself is passed as `rows`, one entry per run with its own `key` and the `messageIds` it anchors: only the rows near the viewport are mounted, so a thousand-run conversation costs the same first paint as a ten-run one. Anything passed as `children` sits under the rows and is always mounted — the working indicator and the queued turns of a live thread — and its own height changes hold the live edge exactly like a row, with or without rows above it. Three behaviours are the caller's to turn on, off by default: `anchorOnSend` puts the message the host announces through `scrollerRef.anchorSend()` at the top of the viewport and keeps the room below it for the answer, `marksNewMessages` marks the first message that arrives after the reader is released, and `countsNewMessages` names on the way back how many arrived since. A new `transcriptKey` forgets both marks.",
			},
		},
	},
	args: {
		followOutput: true,
		followThreshold: 56,
		smooth: false,
		label: "Conversation",
		onFollowChange: fn(),
	},
	argTypes: {
		followOutput: { control: "boolean" },
		followThreshold: {
			control: { type: "number", min: 0, max: 240, step: 8 },
		},
		smooth: { control: "boolean" },
		busy: { control: "boolean" },
		label: { control: "text" },
		older: { control: "object" },
		rowGap: { control: { type: "number", min: 0, max: 48, step: 4 } },
		estimatedRowHeight: {
			control: { type: "number", min: 24, max: 480, step: 8 },
		},
	},
	render: (args) => <TranscriptScroller {...args} />,
})

export const Default = meta.story({
	render: (args) => <TranscriptScroller {...args} entries={SHORT_TRANSCRIPT} />,
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a transcript short enough to fit, so nothing scrolls yet. Check that a non-overflowing viewport still reports the reader as following — no jump-to-latest control appears — and that appending replies stays pinned as soon as the content grows past the frame. `LongContent` covers the transcript that already overflows on mount.",
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeLessThanOrEqual(
			viewport.clientHeight + 1,
		)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the transcript is longer than the frame on first paint — the common case for a resumed conversation. Check that the viewport mounts scrolled to the newest message rather than to the top, so the reader lands on the live edge instead of on history they have already read.",
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
		await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0))
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
	},
})

export const StickToBottom = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when output lands while the reader is at the live edge: the viewport must follow the growth instead of leaving the new message below the fold. Check that the distance to the end stays at zero after the append and that no follow change is reported — growing content alone must never count as the reader leaving. `ScrolledBack` covers the same append with the reader up in the history.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		const heightBefore = viewport.scrollHeight

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

export const ScrolledBack = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the reader has moved up into the history and output keeps arriving. Check that the scroll position is held to the pixel across the append and that `onFollowChange(false)` fired — content arriving must never yank the reader back down. `StickToBottom` covers the same append at the live edge.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		const heightBefore = viewport.scrollHeight
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await settleScroll()
		await expect(viewport.scrollTop).toBe(0)
		await expect(distanceFromEnd(viewport)).toBeGreaterThan(56)
	},
})

export const ReturnToLatest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to exercise the way back: from up in the history, the scroller's own jump control returns to the live edge. Check that the control appears only once the reader is away from it, that the viewport lands on the newest message, that the control disappears because follow is re-armed, and that the next reply is followed again — returning to the live edge must restore the pinning `ScrolledBack` suspended.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)

		viewport.scrollTop = 0
		const jump = await waitFor(() =>
			canvas.getByRole("button", { name: "Jump to latest" }),
		)

		await userEvent.click(jump)

		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await waitFor(() =>
			expect(
				canvas.queryByRole("button", { name: "Jump to latest" }),
			).toBeNull(),
		)

		const heightBefore = viewport.scrollHeight
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
	},
})

export const LoadOlderPage = meta.story({
	args: { older: { has: true, onLoad: fn() } },
	render: (args) => <TranscriptScroller {...args} olderPages={OLDER_PAGES} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host pages the transcript by cursor: the reader is up in the history and asks for the page above. Check that the row they were reading keeps the exact same offset in the viewport while the older page is inserted above it, and that `scrollTop` grew by precisely the height that was added — the viewport disables browser scroll anchoring, so the correction is the component's job and a missed pixel is a jumped reader.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { viewport, anchorOffset } = await scrollToHistoryStart({
			canvasElement,
			onFollowChange: args.onFollowChange,
		})

		const offsetBefore = anchorOffset()
		const heightBefore = viewport.scrollHeight

		await userEvent.click(
			canvas.getByRole("button", { name: "Load older messages" }),
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "Deliver older page" }),
		)

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await settleScroll()

		const addedHeight = viewport.scrollHeight - heightBefore
		await expect(Math.abs(anchorOffset() - offsetBefore)).toBeLessThanOrEqual(1)
		await expect(
			Math.abs(viewport.scrollTop - addedHeight),
		).toBeLessThanOrEqual(1)
		await expect(args.older?.onLoad).toHaveBeenCalledTimes(1)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(true)
	},
})

export const OlderPageDuringStream = meta.story({
	args: { older: { has: true, onLoad: fn() } },
	render: (args) => <TranscriptScroller {...args} olderPages={OLDER_PAGES} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the transcript is still streaming while an older page is in flight — the interleaving a cursor-paginated live conversation hits constantly. The reply landing at the bottom grows the transcript without moving the reader's anchor, so it must consume nothing: only the rows that actually land above the anchor are compensated. Check that the anchor holds both while the request is open and once the page arrives.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { viewport, anchorOffset } = await scrollToHistoryStart({
			canvasElement,
			onFollowChange: args.onFollowChange,
		})
		const offsetBefore = anchorOffset()
		const heightBefore = viewport.scrollHeight

		await userEvent.click(
			canvas.getByRole("button", { name: "Load older messages" }),
		)
		await expect(
			canvas.getByRole("button", { name: "Load older messages" }),
		).toHaveAttribute("aria-busy", "true")

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await settleScroll()
		await expect(Math.abs(anchorOffset() - offsetBefore)).toBeLessThanOrEqual(1)

		const heightBeforeOlder = viewport.scrollHeight
		await userEvent.click(
			canvas.getByRole("button", { name: "Deliver older page" }),
		)
		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBeforeOlder),
		)
		await settleScroll()

		await expect(Math.abs(anchorOffset() - offsetBefore)).toBeLessThanOrEqual(2)
	},
})

export const LoadingOlderPage = meta.story({
	args: { older: { has: true, isLoading: true, onLoad: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a page request is in flight. Check that the control announces itself busy and refuses a second request, and that it keeps its name and its focus rather than being removed from the tab order — a reader who fired it with the keyboard must not be dropped back to the top of the viewport while they wait.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const loadOlder = canvas.getByRole("button", {
			name: "Load older messages",
		})

		await expect(loadOlder).toHaveAttribute("aria-busy", "true")
		await expect(loadOlder).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(loadOlder)
		await userEvent.click(loadOlder)

		await expect(args.older?.onLoad).not.toHaveBeenCalled()
		await expect(loadOlder).toHaveFocus()
	},
})

export const StartOfHistory = meta.story({
	args: { older: { has: false, onLoad: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once every page has been read: the control is replaced by a quiet start-of-conversation row rather than left there to fire a request that returns nothing. Check that no load-older button remains and that the row sits above the oldest message.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Beginning of the conversation"),
		).toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: "Load older messages" }),
		).toBeNull()
	},
})

export const KeyboardLoadOlder = meta.story({
	args: { older: { has: true, onLoad: fn() } },
	render: (args) => <TranscriptScroller {...args} olderPages={OLDER_PAGES} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to walk the pagination path with the keyboard only. Check that Tab reaches the viewport and then the control, that the control keeps focus while its page is in flight, and that both Enter and Space request a page with the anchor held across each load. Tabbing back to the control after a load scrolls it into view again — that is the browser revealing the focused element, not a correction failing, which is why each load is measured from its own starting offset.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { viewport, anchorOffset } = await scrollToHistoryStart({
			canvasElement,
			onFollowChange: args.onFollowChange,
		})

		await userEvent.tab()
		await expect(viewport).toHaveFocus()
		await userEvent.tab()
		const loadOlder = canvas.getByRole("button", {
			name: "Load older messages",
		})
		await expect(loadOlder).toHaveFocus()

		const offsetBeforeEnter = anchorOffset()
		await userEvent.keyboard("{Enter}")
		await waitFor(() => expect(args.older?.onLoad).toHaveBeenCalledTimes(1))
		await expect(loadOlder).toHaveAttribute("aria-busy", "true")
		await expect(loadOlder).toHaveFocus()

		await userEvent.click(
			canvas.getByRole("button", { name: "Deliver older page" }),
		)
		await settleScroll()
		await expect(
			Math.abs(anchorOffset() - offsetBeforeEnter),
		).toBeLessThanOrEqual(2)

		viewport.focus()
		await userEvent.tab()
		await expect(loadOlder).toHaveFocus()
		await settleScroll()

		const offsetBeforeSpace = anchorOffset()
		await userEvent.keyboard("[Space]")
		await waitFor(() => expect(args.older?.onLoad).toHaveBeenCalledTimes(2))
		await userEvent.click(
			canvas.getByRole("button", { name: "Deliver older page" }),
		)
		await waitFor(() =>
			expect(
				canvas.queryByRole("button", { name: "Load older messages" }),
			).toBeNull(),
		)
		await settleScroll()

		await expect(
			Math.abs(anchorOffset() - offsetBeforeSpace),
		).toBeLessThanOrEqual(2)
		await expect(
			canvas.getByText("Beginning of the conversation"),
		).toBeInTheDocument()
	},
})

export const PaginatedStickToBottom = meta.story({
	args: { older: { has: true, onLoad: fn() } },
	render: (args) => <TranscriptScroller {...args} olderPages={OLDER_PAGES} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to prove the pagination affordance costs the live edge nothing. Check that a reply landing while the reader sits at the bottom is still followed and that no follow change is reported — the anchor correction must only ever answer a prepend, never a stream. `StickToBottom` runs the same append without the `older` prop.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await expect(
			canvas.getByRole("button", { name: "Load older messages" }),
		).toBeInTheDocument()
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		const heightBefore = viewport.scrollHeight

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(heightBefore),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
		await expect(args.older?.onLoad).not.toHaveBeenCalled()
	},
})

export const ComposerGrowth = meta.story({
	render: (args) => <TranscriptScroller {...args} hasComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the frame itself shrinks under a reader who never moved — a prompt taking a second line is the everyday case. Check that growing the composer returns the newest message above it and that no follow change is reported: a viewport losing height is not the reader leaving. `StickToBottom` covers the transcript growing instead.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		const heightBefore = viewport.clientHeight

		await userEvent.click(canvas.getByRole("button", { name: "Grow composer" }))

		await waitFor(() =>
			expect(viewport.clientHeight).toBeLessThan(heightBefore),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

export const PromptReturnsToLiveEdge = meta.story({
	render: (args) => <TranscriptScroller {...args} hasComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the host's own way back: a submitted prompt calls `scrollerRef.scrollToEnd()` before its own bubble is rendered, so the transcript grows under the landing. Check that the viewport ends on the sent message rather than just above it, that follow is re-armed, and that the jump control removes itself — the answer the reader just asked for is what they want in front of them.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))

		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await waitFor(() =>
			expect(
				canvas.queryByRole("button", { name: "Jump to latest" }),
			).toBeNull(),
		)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
	},
})

export const PromptHoldsWhileAnswerArrives = meta.story({
	render: (args) => <TranscriptScroller {...args} hasComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the whole span of a send: the reader is up in the history, submits, and the answer lands row after row. Check that every arrival keeps the newest message in front of the reader, that follow is never reported as lost, and that the jump control stays away — the transcript growing under a landing is the system moving, never the reader leaving.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { viewport } = await scrollToHistoryStart({
			canvasElement,
			onFollowChange: args.onFollowChange,
		})

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitForLastBubble(viewport)

		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const ReaderLeavesWhileAnswerArrives = meta.story({
	render: (args) => <TranscriptScroller {...args} hasComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the other half of the send: holding the last bubble must never become a cage. Check that a reader scrolling up mid-answer is let go, that the jump control comes back, and that the next arriving row is left where it falls instead of dragging the viewport down.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await settleScroll()
		await expect(viewport.scrollTop).toBe(0)

		await userEvent.click(
			await canvas.findByRole("button", { name: "Jump to latest" }),
		)
		await waitForLastBubble(viewport)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
	},
})

export const SmoothFollow = meta.story({
	args: { smooth: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the transcript should travel to new output rather than jump to it. The animation is the system's own scroll, so it must never register as the reader leaving: check that follow survives the whole run and that the viewport still ends on the live edge. Under a reader who asked for less motion — the test environment included — the travel collapses to an instant jump.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))

		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const StreamHoldsLastLine = meta.story({
	args: { smooth: true },
	render: (args) => <StreamingTranscript {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a reply that arrives word by word rather than row by row, with motion left on. One row grows for hundreds of frames, so the travel to the live edge is re-aimed under itself the whole time: check that the last line stays in front of the reader for every frame of the growth, that the transcript rests exactly on the end once the growth stops, and that neither the jump control nor a lost follow ever appears — a row growing is the system moving. `SmoothFollow` covers the same travel for a whole row landing at once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const isStreaming = () =>
			canvas.queryByText(STREAM_LABEL.streaming) !== null
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitForLastBubble(viewport)

		const samples = await holdsLastLineWhileStreaming(viewport, isStreaming)

		await expect(samples).toBeGreaterThan(10)
		await waitForLastBubble(viewport)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const ReaderLeavesMidStream = meta.story({
	args: { smooth: true },
	render: (args) => <StreamingTranscript {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the reader who walks out of a growing reply: they scroll up while the transcript is mid-travel, so the system's own scroll and the reader's must be told apart. Check that the reader wins — the travel is dropped, the jump control comes back, and the rest of the answer grows below the fold without moving them — then that the jump control puts them back on the live edge with follow re-armed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const isStreaming = () =>
			canvas.queryByText(STREAM_LABEL.streaming) !== null
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(0))
		viewport.scrollTop = 0

		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await canvas.findByRole("button", { name: "Jump to latest" })

		await waitFor(() => expect(isStreaming()).toBe(false), STREAM_TIMEOUT)
		await expect(viewport.scrollTop).toBe(0)

		await userEvent.click(
			canvas.getByRole("button", { name: "Jump to latest" }),
		)
		await waitForLastBubble(viewport)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
	},
})

export const RowsArriveAfterEmpty = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} entries={[]} incoming={TRANSCRIPT} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the transcript is laid out before it holds anything — a conversation opening on its first exchange. The empty layouts spend nothing: the landing is owed to the first layout that actually carries rows. Check that the viewport sits on the newest message once the rows have filled past the frame, and that follow was never reported as lost. `LongContent` covers the transcript that already overflows on the very first layout.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const send = () =>
			canvas.getByRole<HTMLButtonElement>("button", { name: "Send reply" })

		while (!send().disabled) {
			await userEvent.click(send())
		}

		await waitFor(() =>
			expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

export const LongTranscript = meta.story({
	render: (args) => <TranscriptScroller {...args} entries={LONG_TRANSCRIPT} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a resumed conversation with hundreds of runs behind it — the case the transcript is virtualised for. Check that the viewport still opens on the newest run and that only a handful of rows are mounted: every row outside the viewport and its overscan is left out of the DOM, so the first paint never walks the whole history.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(viewport).toHaveClass("scrollbar-overlay")
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
		await expect(
			canvasElement.querySelectorAll('[data-slot="message-scroller-row"]')
				.length,
		).toBeLessThan(MOUNTED_ROW_LIMIT)
		await waitFor(() =>
			expect(
				canvas.getByText(LONG_TRANSCRIPT[LONG_TRANSCRIPT.length - 1].text),
			).toBeVisible(),
		)
	},
})

export const ConversationChange = meta.story({
	render: (args) => <ConversationSwitcher {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host swaps the conversation under a scroller it keeps mounted. A new `transcriptKey` is a new transcript: check that the reader lands on its live edge with follow armed even though they were up in the history of the one before it, and that the landing is instant rather than a travel through rows they never read.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(
			canvas.getByRole("button", { name: "Open other conversation" }),
		)

		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(true)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const Jump = meta.story({
	render: () => <AnchoredTranscript />,
	parameters: {
		docs: {
			description: {
				story:
					"The other end of a quoted message: the host calls `scrollerRef.scrollToMessage(id)` and the viewport brings that message to the middle. Every message anchors itself once, on the row itself, so a run split into paragraphs is still one target. The call answers whether it found anything — a message dropped from the window, paged out or never loaded, moves nothing and reports false, which is what the screen needs to fall back on fetching it. While the host names a message as highlighted, that row marks itself, so the reader sees where they landed instead of hunting for it. Check both buttons, then check that leaving the live edge this way is reported as such: the transcript stops following, so a reply landing next does not yank the reader back down.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const highlighted = () =>
			canvasElement
				.querySelector("[data-highlighted]")
				?.getAttribute("data-message-id")

		await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0))

		await userEvent.click(
			canvas.getByRole("button", { name: "Jump to the quoted message" }),
		)
		await waitFor(() => expect(viewport.scrollTop).toBe(0))
		await expect(highlighted()).toBe(TRANSCRIPT[0].id)

		await userEvent.click(
			canvas.getByRole("button", { name: "Jump to a dropped message" }),
		)
		await expect(canvas.getByText("Not on screen")).toBeVisible()
		await expect(viewport.scrollTop).toBe(0)
		await expect(highlighted()).toBeUndefined()
	},
})

export const NewMessageCount = meta.story({
	args: { countsNewMessages: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host wants the way back to say how much was missed — the conversation case. Check that the control counts every message that landed since the reader was released, that it counts up as they keep arriving, that it draws the number in tabular figures so the control does not jitter as the count grows, and that activating it drops the count with the control. `ReturnToLatest` runs the same way back with the count left off.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		const send = canvas.getByRole("button", { name: "Send reply" })
		await userEvent.click(send)
		await canvas.findByRole("button", { name: "1 new message" })

		await userEvent.click(send)
		const control = await canvas.findByRole("button", {
			name: "2 new messages",
		})
		await expect(getComputedStyle(control).fontVariantNumeric).toContain(
			"tabular-nums",
		)

		await userEvent.click(control)

		await waitForLastBubble(viewport)
		await waitFor(() =>
			expect(canvas.queryByRole("button", { name: /new message/ })).toBeNull(),
		)
	},
})

export const NewMessageSeparator = meta.story({
	args: { marksNewMessages: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the reader's own place in the transcript: the first message that lands after they were released is marked, the way Slack marks the new-messages line. Check that the mark carries a label rather than a colour alone, that it sits above the first message that arrived and not above the one they had already read, and that it survives the way back to the newest content — a reader who returns still wants to see where they left off. `ConversationChangeForgetsNewMarks` covers the only thing that clears it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const markedRow = () =>
			newLine(canvasElement)?.closest('[data-slot="message-scroller-row"]')
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await expect(newLine(canvasElement)).toBeNull()

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await userEvent.click(
			await canvas.findByRole("button", { name: "Jump to latest" }),
		)
		await waitForLastBubble(viewport)

		await waitFor(() => expect(newLine(canvasElement)).not.toBeNull())
		await expect(newLine(canvasElement)).toHaveTextContent("New messages")
		await expect(markedRow()).toHaveTextContent(INCOMING[0].text)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitForLastBubble(viewport)

		await expect(markedRow()).toHaveTextContent(INCOMING[0].text)
	},
})

export const ConversationChangeForgetsNewMarks = meta.story({
	args: { marksNewMessages: true, countsNewMessages: true },
	render: (args) => <ConversationSwitcher {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host swaps the conversation under a scroller it keeps mounted, with both marks turned on. The mark and the count belong to the visit, not to the component: check that opening another transcript drops the separator, and that leaving its live edge offers a bare way back rather than one still counting the messages of the conversation before it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await userEvent.click(
			await canvas.findByRole("button", { name: "1 new message" }),
		)
		await waitForLastBubble(viewport)
		await waitFor(() => expect(newLine(canvasElement)).not.toBeNull())

		await userEvent.click(
			canvas.getByRole("button", { name: "Open other conversation" }),
		)
		await waitForLastBubble(viewport)
		await expect(newLine(canvasElement)).toBeNull()

		viewport.scrollTop = 0

		await canvas.findByRole("button", { name: "Jump to latest" })
		await expect(newLine(canvasElement)).toBeNull()
	},
})

export const ReaderStopsTheTravel = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the reader who changes their mind mid-landing: they ask for the newest content, then scroll back up before the transcript has settled. Check that their gesture wins — the travel is dropped where they stopped it, the transcript stays released, and the way back is offered again instead of the landing dragging them down.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		const jump = await canvas.findByRole("button", { name: "Jump to latest" })

		await userEvent.click(jump)
		viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))
		viewport.scrollTop = 60
		await settleScroll()
		await settleScroll()

		await expect(viewport.scrollTop).toBe(60)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(false)
		await canvas.findByRole("button", { name: "Jump to latest" })
	},
})

export const LandsWithoutMotion = meta.story({
	args: { smooth: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this under a reader who asked for less motion — the test environment included. The way back is a spring, and a spring is motion: check that it collapses to a single jump, so the newest content is reached within one frame instead of travelled to over dozens. `SmoothFollow` is the same travel left to run.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await userEvent.click(
			await canvas.findByRole("button", { name: "Jump to latest" }),
		)
		await settleScroll()

		await expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1)
	},
})

const NEW_LINE_SLOT = '[data-slot="message-scroller-new-line"]'

const newLine = (canvasElement: HTMLElement) =>
	canvasElement.querySelector<HTMLElement>(NEW_LINE_SLOT)

const ANCHOR_INCOMING: TranscriptEntry[] = [
	{
		id: "anchor-user",
		from: "user",
		text: "Summarise the rollout for the deploy channel.",
	},
	{
		id: "anchor-assistant-1",
		from: "assistant",
		text: "The index build runs first and reports done at around four minutes, then the migration opens a single transaction that copies the legacy role string into role_id.",
	},
	{
		id: "anchor-assistant-2",
		from: "assistant",
		text: "The drop of the legacy column is the last statement in that transaction, so a failure anywhere rolls the whole thing back. The invites backfill is queued behind it and takes another two minutes, touching nothing the accounts table depends on.",
	},
]

const ANCHOR_TOP_BAND = 24

const roomHeight = (canvasElement: HTMLElement) =>
	canvasElement
		.querySelector('[data-slot="message-scroller-room"]')
		?.getBoundingClientRect().height ?? 0

export const AnchorOnSend = meta.story({
	args: { anchorOnSend: true },
	render: (args) => (
		<TranscriptScroller {...args} hasComposer incoming={ANCHOR_INCOMING} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the send of a bot thread: the prompt the reader just wrote goes to the top of the viewport and the room below it is left empty for the answer. Check that the sent message lands on the top band rather than at the bottom, that the room is taken from the bottom of the scrolled content, that it shrinks as the answer grows until nothing empty is left under it, and that the transcript never reports itself as released while it places the message — the system moving is not the reader leaving. `PromptReturnsToLiveEdge` runs the same send with the anchor left off.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const topBand = () =>
			canvas.getByText(ANCHOR_INCOMING[0].text).getBoundingClientRect().top -
			viewport.getBoundingClientRect().top
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitFor(() => expect(roomHeight(canvasElement)).toBeGreaterThan(0))
		await settleScroll()

		await expect(topBand()).toBeLessThanOrEqual(ANCHOR_TOP_BAND)
		const roomForTheAnswer = roomHeight(canvasElement)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await settleScroll()

		await expect(roomHeight(canvasElement)).toBeLessThan(roomForTheAnswer)
		await expect(topBand()).toBeLessThanOrEqual(ANCHOR_TOP_BAND)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() => expect(roomHeight(canvasElement)).toBe(0))

		await expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

const COLLAPSING_ID = "collapsing"

const COLLAPSING_LONG =
	"The plan has three parts. First the index build, which the database reports as done at around four minutes. Then the migration itself, one transaction covering the copy into role_id and the drop of the legacy column. Last the invites backfill, queued behind both."

const COLLAPSING_SHORT = "Collapsed to a line."

const READER_NUDGE = 4

const CollapsingTranscript = ({
	onFollowChange,
	...scrollerProps
}: Omit<MessageScrollerProps, "children" | "rows">) => {
	const [isCollapsed, setIsCollapsed] = useState(false)

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				{...scrollerProps}
				onFollowChange={onFollowChange}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				estimatedRowHeight={ROW_HEIGHT}
				rowGap={ROW_GAP}
				rows={toRows([
					{
						id: COLLAPSING_ID,
						from: "assistant",
						text: isCollapsed ? COLLAPSING_SHORT : COLLAPSING_LONG,
					},
					...TRANSCRIPT,
				])}
			/>
			<div className="border-border border-t p-2">
				<Button size="sm" onClick={() => setIsCollapsed(true)}>
					Collapse the first answer
				</Button>
			</div>
		</div>
	)
}

export const HistoryShrinksAbove = meta.story({
	render: (args) => <CollapsingTranscript {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a row above the fold changes height under a reader who is up in the history — a collapsed answer, a picture that finally measured. Check that the row under their eye keeps the exact same offset on screen while the content above it shrinks: growth above is covered by `LoadOlderPage`, and shrinking must be corrected the same way or the reader is thrown down the transcript.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const anchorTop = () =>
			canvas.getByText(TRANSCRIPT[0].text).getBoundingClientRect().top
		await waitForOverflow(viewport)
		await settleScroll()

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await settleScroll()

		const collapsingRow = () =>
			canvas.getByText(COLLAPSING_LONG).getBoundingClientRect().bottom.valueOf()

		viewport.scrollTop +=
			collapsingRow() - viewport.getBoundingClientRect().top + READER_NUDGE * 2
		await settleScroll()
		viewport.scrollTop -= READER_NUDGE
		await settleScroll()

		await expect(collapsingRow()).toBeLessThanOrEqual(
			viewport.getBoundingClientRect().top,
		)
		const offsetBefore = anchorTop()

		await userEvent.click(
			canvas.getByRole("button", { name: "Collapse the first answer" }),
		)
		await waitFor(() => expect(canvas.queryByText(COLLAPSING_LONG)).toBeNull())
		await settleScroll()

		await expect(Math.abs(anchorTop() - offsetBefore)).toBeLessThanOrEqual(2)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(false)
	},
})

const TAIL_SLOT = '[data-slot="message-scroller-tail"]'

const REST_UNDER_LAST_ROW = 15

const tailRect = (canvasElement: HTMLElement) => {
	const tail = canvasElement.querySelector(TAIL_SLOT)
	if (!tail) throw new Error("the tail slot never mounted")

	return tail.getBoundingClientRect()
}

const seatRects = (canvasElement: HTMLElement) =>
	Array.from(canvasElement.querySelectorAll(`${TAIL_SLOT} > *`)).map((seat) =>
		seat.getBoundingClientRect(),
	)

const firstSeatRect = (canvasElement: HTMLElement) => {
	const [first] = seatRects(canvasElement)
	if (!first) throw new Error("the tail slot never took a seat")

	return first
}

const bandHeight = (canvasElement: HTMLElement) =>
	firstSeatRect(canvasElement).top - tailRect(canvasElement).top

const CONTROL_INSET = 12

const TALL_TAIL_SEATS = 8

const TALL_TAIL_LIFT = 176

const READER_RELEASE = 60

const BOUNDARY_STEP = 8

const BOUNDARY_STEPS = 8

const BAND_REST_MS = 420

const readerScroll = (viewport: HTMLElement, distance: number) => {
	viewport.scrollTop -= distance
	return settleScroll()
}

const resolvedSurface = (scope: HTMLElement) => {
	const probe = document.createElement("span")
	probe.style.backgroundColor = "var(--secondary)"
	scope.append(probe)
	const resolved = getComputedStyle(probe).backgroundColor
	probe.remove()
	return resolved
}

const hidesWhatItCovers = async (control: HTMLElement) => {
	const painted = getComputedStyle(control).backgroundColor

	await expect(painted).toBe(resolvedSurface(control))
	await expect(painted).not.toMatch(/\//)
	await expect(painted).not.toMatch(/^(?:rgba|hsla)\(|^transparent$/)
}

const answersAPointer = async (control: HTMLElement) => {
	const box = control.getBoundingClientRect()
	const hit = document.elementFromPoint(
		box.left + box.width / 2,
		box.top + box.height / 2,
	)

	await expect(hit).not.toBeNull()
	await expect(control.contains(hit)).toBe(true)
}

export const TailHoldsTheLiveEdge = meta.story({
	render: (args) => <TranscriptScroller {...args} tailSeats={2} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the slot under the rows carries something — the waiting seats of a wave, the working indicator. Check that resting on the newest content shows the last row and the whole tail rather than cutting the tail off below the fold, and that the way back, once the reader leaves, is drawn clear of both: the release threshold is deeper than the control's own band, so the control never sits on the content it offers to leave.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		const frame = viewport.getBoundingClientRect()
		await expect(tailRect(canvasElement).top).toBeGreaterThanOrEqual(frame.top)
		await expect(tailRect(canvasElement).bottom).toBeLessThanOrEqual(
			frame.bottom + 1,
		)
		await expect(canvas.getByText(seatLabel(1))).toBeVisible()

		viewport.scrollTop -= 60
		const control = await canvas.findByRole("button", {
			name: "Jump to latest",
		})

		await expect(tailRect(canvasElement).top).toBeLessThan(
			viewport.getBoundingClientRect().bottom,
		)
		await expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			firstSeatRect(canvasElement).top,
		)
	},
})

export const TailReservesTheControlBand = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} tailSeats={TALL_TAIL_SEATS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the wave under the rows is taller than the frame and its first seat is still on screen. Check that the tail opens a band at its own top, sized from the control and not from the tail, that the control comes to rest inside that band, and that the first seat keeps its whole box below it: the way back is chrome over the transcript, and it must never be read at the price of a row it hides.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)
		await readerScroll(viewport, TALL_TAIL_LIFT)

		const control = await canvas.findByRole("button", {
			name: "Jump to latest",
		})
		const frame = viewport.getBoundingClientRect()
		const tail = tailRect(canvasElement)
		const seat = firstSeatRect(canvasElement)
		const box = control.getBoundingClientRect()

		await expect(tail.height).toBeGreaterThan(frame.height)
		await expect(tail.top).toBeGreaterThan(frame.top)
		await expect(bandHeight(canvasElement)).toBeCloseTo(
			box.height + CONTROL_INSET * 2,
			0,
		)
		await expect(box.top).toBeGreaterThanOrEqual(frame.top)
		await expect(box.bottom).toBeLessThanOrEqual(frame.bottom)
		await expect(box.top).toBeGreaterThanOrEqual(tail.top)
		await expect(box.bottom).toBeLessThanOrEqual(seat.top)
		await answersAPointer(control)
	},
})

const tailTopLeavesTheFrame = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	const viewport = canvas.getByRole("region", { name: "Conversation" })
	await waitForLastBubble(viewport)
	await readerScroll(viewport, READER_RELEASE)

	const control = await canvas.findByRole("button", { name: "Jump to latest" })
	const frame = viewport.getBoundingClientRect()
	const tail = tailRect(canvasElement)
	const box = control.getBoundingClientRect()

	await expect(tail.top).toBeLessThan(frame.top)
	await expect(box.top - frame.top).toBeCloseTo(CONTROL_INSET, 0)
	await expect(box.bottom).toBeLessThanOrEqual(frame.bottom)
	await expect(
		seatRects(canvasElement).some(
			(seat) => seat.top < box.bottom && seat.bottom > box.top,
		),
	).toBe(true)
	await answersAPointer(control)
	await hidesWhatItCovers(control)
}

export const TailTopLeavesTheFrame = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} tailSeats={TALL_TAIL_SEATS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the wave is so tall that its own top is off the fold: there is no band left on screen to rest in. Check that the control comes down to one inset below the top of the frame, whole, that it takes the pointer aimed at it, and that the seat it lands on is hidden behind a surface the theme owns rather than showing through it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await tailTopLeavesTheFrame(canvasElement)
	},
})

export const TailTopLeavesTheFrameInDark = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} tailSeats={TALL_TAIL_SEATS} />
	),
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same control over the same tail on the dark surface, where an opacity on the fill would let the seat behind it read straight through. The story reads the painted background against `--secondary` resolved in the control's own scope, so a translucent fill fails here and not only to the eye.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await tailTopLeavesTheFrame(canvasElement)
	},
})

export const ControlCrossesTheBandBoundary = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} tailSeats={TALL_TAIL_SEATS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the crossing itself: the reader walks the tail top back and forth over the top of the frame, which is where resting in the band and resting under the top of the frame meet. Check that the same control travels across it: one box, one surface, one label, and that its resting place changes at most once per direction, never alternating frame to frame.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)
		await readerScroll(viewport, READER_RELEASE)

		const control = await canvas.findByRole("button", {
			name: "Jump to latest",
		})
		const boxes: DOMRect[] = []
		const sides: boolean[] = []
		const restsUnderTheFrameTop = () =>
			Math.round(
				control.getBoundingClientRect().top -
					viewport.getBoundingClientRect().top,
			) === CONTROL_INSET

		const walk = async (direction: number) => {
			const places: boolean[] = []
			for (let step = 0; step < BOUNDARY_STEPS; step += 1) {
				await readerScroll(viewport, direction * BOUNDARY_STEP)
				boxes.push(control.getBoundingClientRect())
				sides.push(
					tailRect(canvasElement).top < viewport.getBoundingClientRect().top,
				)
				places.push(restsUnderTheFrameTop())
			}
			return places.filter(
				(place, index) => index > 0 && place !== places[index - 1],
			).length
		}

		const first = await walk(1)
		await expect(first).toBeLessThanOrEqual(1)
		await expect(await walk(-1)).toBeLessThanOrEqual(1)
		await expect(new Set(sides).size).toBeGreaterThan(1)
		await expect(new Set(boxes.map((box) => box.width)).size).toBe(1)
		await expect(new Set(boxes.map((box) => box.height)).size).toBe(1)
		await expect(control).toHaveTextContent("Jump to latest")
		await hidesWhatItCovers(control)
	},
})

export const LiveEdgeReturnCarriesTheBand = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} tailSeats={TALL_TAIL_SEATS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the band leaving. It opens while the tail is below the fold and nobody sees it; it closes under the reader's eyes, on the way back down. Check that the transcript comes to rest once: the tail's top offset on the frame the return settles is the offset it keeps, so the band is given back inside the movement and not one beat after it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)
		await readerScroll(viewport, READER_RELEASE)

		const control = await canvas.findByRole("button", {
			name: "Jump to latest",
		})
		await expect(bandHeight(canvasElement)).toBeGreaterThan(CONTROL_INSET)

		control.click()
		await waitForLastBubble(viewport)
		await settleScroll()

		const settled = tailRect(canvasElement).top
		await new Promise((resolve) => setTimeout(resolve, BAND_REST_MS))
		await settleScroll()

		await expect(tailRect(canvasElement).top).toBeCloseTo(settled, 0)
		await expect(
			canvas.queryByRole("button", { name: "Jump to latest" }),
		).toBeNull()
	},
})

export const TailGrowsAtLiveEdge = meta.story({
	render: (args) => <TranscriptScroller {...args} tailSeats={2} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the tail grows on its own, with no row arriving: a seat joins the wave under the last bubble. Check that the transcript follows that growth the way it follows a row, that the whole tail stays in view, and that a slot changing height is never reported as the reader leaving. `TailShrinksToNothing` covers the other direction.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)
		const heightBefore = tailRect(canvasElement).height

		await userEvent.click(canvas.getByRole("button", { name: "Add seat" }))

		await waitFor(() =>
			expect(tailRect(canvasElement).height).toBeGreaterThan(heightBefore),
		)
		await waitFor(() =>
			expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1),
		)
		await expect(tailRect(canvasElement).top).toBeGreaterThanOrEqual(
			viewport.getBoundingClientRect().top,
		)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

export const TailShrinksToNothing = meta.story({
	render: (args) => <TranscriptScroller {...args} tailSeats={3} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the wave finishes and its waiting seats unmount at once. Check that the transcript stays on the newest content and that the last row comes to rest against the bottom of the scrolled content: an emptied tail must take back every pixel it held, gap included, instead of leaving a hole under the last bubble.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await waitForLastBubble(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Clear seats" }))
		await waitFor(() => expect(canvas.queryByText(seatLabel(0))).toBeNull())
		await settleScroll()

		await expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1)
		const lastRow = canvas
			.getByText(TRANSCRIPT[TRANSCRIPT.length - 1].text)
			.getBoundingClientRect()
		await expect(
			viewport.getBoundingClientRect().bottom - lastRow.bottom,
		).toBeLessThanOrEqual(REST_UNDER_LAST_ROW)
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

export const TailChangesWhileScrolledBack = meta.story({
	render: (args) => <TranscriptScroller {...args} tailSeats={2} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the tail moving under a reader who is up in the history. Check that the row under their eye keeps the exact same offset while a seat joins the tail below the fold, and that they stay released — the slot growing is not an invitation back down.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const anchorTop = () =>
			canvas.getByText(TRANSCRIPT[0].text).getBoundingClientRect().top
		await waitForLastBubble(viewport)

		viewport.scrollTop = 0
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		const offsetBefore = anchorTop()
		const heightBefore = tailRect(canvasElement).height

		await userEvent.click(canvas.getByRole("button", { name: "Add seat" }))
		await waitFor(() =>
			expect(tailRect(canvasElement).height).toBeGreaterThan(heightBefore),
		)
		await settleScroll()

		await expect(viewport.scrollTop).toBe(0)
		await expect(anchorTop()).toBe(offsetBefore)
		await expect(args.onFollowChange).toHaveBeenLastCalledWith(false)
	},
})

export const TailWithoutRows = meta.story({
	render: (args) => (
		<TranscriptScroller {...args} entries={[]} incoming={[]} tailSeats={0} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the first wave of an empty conversation: the waiting seats are the only thing on screen, and they grow one by one past the frame. Check that the newest seat stays in view — with no rows to change, the tail's own growth is the only thing left to measure, and nothing else would bring the viewport down.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const addSeat = canvas.getByRole("button", { name: "Add seat" })
		for (let seat = 0; seat < 10; seat += 1) {
			await userEvent.click(addSeat)
		}

		await waitForOverflow(viewport)
		await settleScroll()

		await expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1)
		await expect(canvas.getByText(seatLabel(9))).toBeVisible()
		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
	},
})

const MARK_TOKEN = "--transcript-new-mark"

const SHADOW_SOURCE = "var(--foreground)"

const paintedMark = (line: HTMLElement) => {
	const [lead, label, trail] = Array.from(line.children) as HTMLElement[]
	return [
		getComputedStyle(lead).backgroundColor,
		getComputedStyle(label).color,
		getComputedStyle(trail).backgroundColor,
	]
}

const resolvedMark = (scope: HTMLElement) => {
	const probe = document.createElement("span")
	probe.style.backgroundColor = `var(${MARK_TOKEN})`
	scope.append(probe)
	const resolved = getComputedStyle(probe).backgroundColor
	probe.remove()
	return resolved
}

const drawnFrom = async (line: HTMLElement, source: string) => {
	const painted = paintedMark(line)

	await expect(new Set(painted).size).toBe(1)
	await expect(painted).toEqual([source, source, source])
}

const marksReadTheToken = async (line: HTMLElement) => {
	const declared = resolvedMark(line)
	await drawnFrom(line, declared)

	line.style.setProperty(MARK_TOKEN, SHADOW_SOURCE)
	const shadowed = resolvedMark(line)
	await expect(shadowed).not.toBe(declared)
	await drawnFrom(line, shadowed)

	line.style.removeProperty(MARK_TOKEN)
	await drawnFrom(line, declared)
}

interface MarkedTranscriptOptions {
	canvasElement: HTMLElement
	click: (element: Element) => Promise<void>
}

const markedTranscript = async ({
	canvasElement,
	click,
}: MarkedTranscriptOptions) => {
	const canvas = within(canvasElement)
	const viewport = canvas.getByRole("region", { name: "Conversation" })
	await waitForLastBubble(viewport)

	viewport.scrollTop = 0
	await canvas.findByRole("button", { name: "Jump to latest" })

	const send = canvas.getByRole("button", { name: "Send reply" })
	await click(send)
	await click(send)
	await click(canvas.getByRole("button", { name: "Jump to latest" }))
	await waitForLastBubble(viewport)

	const line = newLine(canvasElement)
	if (!line) throw new Error("the new-message line never mounted")

	const markedRow = line.closest<HTMLElement>(
		'[data-slot="message-scroller-row"]',
	)
	await expect(markedRow).toHaveTextContent(INCOMING[0].text)
	await expect(canvas.getByText(INCOMING[1].text)).toBeVisible()
	return line
}

export const NewMessageSeparatorInLight = meta.story({
	args: { marksNewMessages: true },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The separator on the light surface, with the messages the reader had already read above it and the ones that arrived below. The two rules and the label must all three resolve to `--transcript-new-mark`: the story reads that value from the separator's own scope, then shadows the variable there and checks the three follow it, so a rule reaching for the primary fill again fails here even in the theme where the two colours happen to coincide.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const line = await markedTranscript({
			canvasElement,
			click: userEvent.click,
		})

		await expect(line).toBeVisible()
		await marksReadTheToken(line)
	},
})

export const NewMessageSeparatorInDark = meta.story({
	args: { marksNewMessages: true },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same separator on the dark surface, where the token rises to the amber the rest of the dark theme accents with — the exact value `--primary` carries there, which is why the colour alone proves nothing and the story shadows the variable to tell the two apart.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const line = await markedTranscript({
			canvasElement,
			click: userEvent.click,
		})

		await expect(line).toBeVisible()
		await marksReadTheToken(line)
	},
})

const MEASURE_FRAME_CLASS =
	"flex h-[1600px] w-[800px] flex-col overflow-hidden rounded-xl border border-border bg-background"

const TOOL_CARD = { key: "tool-block", length: 140, height: 234 }

const TOOL_DETAIL = "bun run migrate --dry-run"

const markdownRow = (measured: MeasuredRow): MessageScrollerRow => ({
	key: measured.key,
	messageIds: [measured.key],
	render: () => (
		<AssistantTurn>
			<Markdown>{measured.content}</Markdown>
		</AssistantTurn>
	),
})

const MEASURED_SCROLLER_ROWS: MessageScrollerRow[] = [
	markdownRow(ONE_LINE_REPLY),
	{
		key: USER_MESSAGE.key,
		messageIds: [USER_MESSAGE.key],
		render: () => <UserTurn>{USER_MESSAGE.content}</UserTurn>,
	},
	markdownRow(CODE_ANSWER),
	markdownRow(MARKDOWN_ANSWER),
	{
		key: TOOL_CARD.key,
		messageIds: [TOOL_CARD.key],
		render: () => (
			<AssistantTurn fills>
				<ToolApproval
					description="Claude Code is waiting on you before it runs this tool."
					tool="Bash"
					title="Run the migration dry run"
				>
					<ToolApprovalCode code={TOOL_DETAIL} />
				</ToolApproval>
			</AssistantTurn>
		),
	},
]

const RECORDED_SHAPES = Object.fromEntries(
	[...MEASURED_ROWS, TOOL_CARD].map((measured) => [
		measured.key,
		{ height: measured.height, length: measured.length },
	]),
)

const shapesByKey = (canvasElement: HTMLElement) => {
	const rows = canvasElement.querySelectorAll<HTMLElement>(
		'[data-slot="message-scroller-row"]',
	)
	return Object.fromEntries(
		[...rows].map((row) => [
			MEASURED_SCROLLER_ROWS[Number(row.dataset.index)].key,
			{
				height: Math.round(row.getBoundingClientRect().height),
				length: (row.textContent ?? "").length,
			},
		]),
	)
}

const heightsIn = (shapes: Record<string, { height: number }>) =>
	Object.values(shapes)
		.map((shape) => shape.height)
		.sort((left, right) => left - right)

const medianOf = (heights: number[]) =>
	heights[Math.floor((heights.length - 1) / 2)]

const p90Of = (heights: number[]) =>
	heights[Math.ceil(heights.length * 0.9) - 1]

export const RowHeights = meta.story({
	name: "Row Heights",
	render: () => (
		<div className={MEASURE_FRAME_CLASS}>
			<MessageScroller
				className="flex-1"
				contentClassName="flex flex-col p-3"
				label="Conversation"
				rowGap={ROW_GAP}
				rows={MEASURED_SCROLLER_ROWS}
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The ruler behind `ESTIMATED_ROW_HEIGHT` and the perf harness's row heights: one row per content shape a transcript carries, laid out at the 800px width the harness assumes. The play function pins each row's rendered text length and the height it takes at that length, plus the median and the p90 of the set, so a change to a turn's padding, a bubble's radius or the markdown scale shows up here as a failing number instead of silently rotting the estimate the virtualizer starts from. The harness keys its height table on these lengths, and leaves the tool card out of it: its height comes from the card, not from its text.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(shapesByKey(canvasElement)).toEqual(RECORDED_SHAPES),
		)

		const heights = heightsIn(shapesByKey(canvasElement))

		await expect(medianOf(heights)).toBe(185)
		await expect(p90Of(heights)).toBe(252)
	},
})
