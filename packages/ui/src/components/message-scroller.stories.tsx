import { useRef, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import {
	MessageScroller,
	type MessageScrollerHandle,
	type MessageScrollerProps,
} from "@workspace/ui/components/message-scroller"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
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

interface TranscriptScrollerProps
	extends Omit<MessageScrollerProps, "children" | "scrollerRef"> {
	entries?: TranscriptEntry[]
	incoming?: TranscriptEntry[]
	olderPages?: TranscriptEntry[][]
	hasComposer?: boolean
}

const TranscriptScroller = ({
	entries = TRANSCRIPT,
	incoming = INCOMING,
	olderPages,
	hasComposer,
	onFollowChange,
	...scrollerProps
}: TranscriptScrollerProps) => {
	const [visible, setVisible] = useState(entries)
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
				contentClassName="flex flex-col gap-2 p-3"
			>
				{visible.map((entry) => (
					<TranscriptRow key={entry.id} entry={entry} />
				))}
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
							scrollerRef.current?.scrollToEnd("auto")
							deliverIncoming()
						}}
					>
						Send prompt
					</Button>
				) : null}
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
				contentClassName="flex flex-col gap-2 p-3"
			>
				{TRANSCRIPT.map((entry) => (
					<TranscriptRow key={entry.id} entry={entry} />
				))}
				{hasPrompt ? <TranscriptRow entry={STREAM_PROMPT} /> : null}
				{deliveredWords > 0 ? (
					<TranscriptRow entry={streamedAnswer(deliveredWords)} />
				) : null}
			</MessageScroller>
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

	return (
		<div className={FRAME_CLASS}>
			<MessageScroller
				{...props}
				transcriptKey={isSecond ? "second" : "first"}
				className="flex-1"
				contentClassName="flex flex-col gap-2 p-3"
			>
				{(isSecond ? OTHER_TRANSCRIPT : TRANSCRIPT).map((entry) => (
					<TranscriptRow key={entry.id} entry={entry} />
				))}
			</MessageScroller>
			<div className="border-border border-t p-2">
				<Button size="sm" onClick={() => setIsSecond((current) => !current)}>
					Open other conversation
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
				contentClassName="flex flex-col gap-3 p-3"
			>
				{TRANSCRIPT.map((entry) =>
					entry.from === "user" ? (
						<UserTurn key={entry.id} messageId={entry.id}>
							{entry.text}
						</UserTurn>
					) : (
						<AssistantTurn key={entry.id} messageId={entry.id}>
							{entry.text}
						</AssistantTurn>
					),
				)}
			</MessageScroller>
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
					"Scroll container for a streamed transcript. It pins the viewport to the newest content while the reader sits at the live edge, and hands scroll control back the moment they move up into the history. It renders its own jump-to-latest control while the reader sits away from the live edge, reports the switch through `onFollowChange`, and exposes `scrollerRef.scrollToEnd()` so a host can return to the live edge when it accepts a prompt. Pass `older` to add the load-older control at the top of the viewport: the reader's anchor is held to the pixel while the page is prepended above it. Without that prop the affordance is not rendered at all. `scrollerRef.scrollToMessage(id)` brings a message anchored under `data-message-id` back into the middle of the viewport and answers whether it found one, and `highlightedMessageId` marks that message while the host names it.",
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
