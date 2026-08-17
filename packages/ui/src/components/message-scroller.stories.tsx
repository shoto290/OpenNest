import { useRef, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import {
	MessageScroller,
	type MessageScrollerHandle,
	type MessageScrollerProps,
} from "@workspace/ui/components/message-scroller"
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

	await waitFor(() => expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(1))
	viewport.scrollTop = 0
	await waitFor(() => expect(onFollowChange).toHaveBeenCalledWith(false))

	return { viewport, anchorOffset }
}

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
}

const TranscriptScroller = ({
	entries = TRANSCRIPT,
	incoming = INCOMING,
	olderPages,
	onFollowChange,
	...scrollerProps
}: TranscriptScrollerProps) => {
	const [visible, setVisible] = useState(entries)
	const [sent, setSent] = useState(0)
	const [pending, setPending] = useState(olderPages ?? [])
	const [isLoadingOlder, setIsLoadingOlder] = useState(false)
	const [following, setFollowing] = useState(true)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const nextIncoming = incoming[sent]

	const requestOlder = () => {
		scrollerProps.older?.onLoad()
		if (pending.length > 0) setIsLoadingOlder(true)
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
		<div className="flex h-80 w-96 flex-col overflow-hidden rounded-xl border border-border bg-background">
			<MessageScroller
				{...scrollerProps}
				older={older}
				scrollerRef={scrollerRef}
				onFollowChange={(next) => {
					setFollowing(next)
					onFollowChange?.(next)
				}}
				className="flex-1"
				contentClassName="flex flex-col gap-2 p-3"
			>
				{visible.map((entry) => (
					<TranscriptRow key={entry.id} entry={entry} />
				))}
			</MessageScroller>
			<div className="flex items-center justify-between gap-2 border-border border-t p-2">
				<Button
					size="sm"
					disabled={!nextIncoming}
					onClick={() => {
						if (!nextIncoming) return
						setVisible((current) => [...current, nextIncoming])
						setSent((current) => current + 1)
					}}
				>
					Send reply
				</Button>
				{isLoadingOlder ? (
					<Button size="sm" variant="outline" onClick={deliverOlder}>
						Deliver older page
					</Button>
				) : null}
				{following ? null : (
					<Button
						size="sm"
						onClick={() => scrollerRef.current?.scrollToEnd("auto")}
					>
						Jump to latest
					</Button>
				)}
			</div>
		</div>
	)
}

const meta = preview.meta({
	title: "AI/MessageScroller",
	component: MessageScroller,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Scroll container for a streamed transcript. It pins the viewport to the newest content while the reader sits at the live edge, and hands scroll control back the moment they move up into the history. `onFollowChange` reports that switch and `scrollerRef.scrollToEnd()` returns to the live edge, so the host owns its own jump-to-latest control. Pass `older` to add the load-older control at the top of the viewport: the reader's anchor is held to the pixel while the page is prepended above it. Without that prop the affordance is not rendered at all.",
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
					"Reach for this to exercise the way back: from up in the history, the host's jump control calls `scrollerRef.scrollToEnd()`. Check that the viewport lands on the newest message, that the control disappears because follow is re-armed, and that the next reply is followed again — returning to the live edge must restore the pinning `ScrolledBack` suspended.",
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
