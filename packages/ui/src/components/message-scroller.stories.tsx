import { useRef, useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

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
}

const TranscriptScroller = ({
	entries = TRANSCRIPT,
	incoming = INCOMING,
	onFollowChange,
	...scrollerProps
}: TranscriptScrollerProps) => {
	const [visible, setVisible] = useState(entries)
	const [following, setFollowing] = useState(true)
	const scrollerRef = useRef<MessageScrollerHandle>(null)
	const nextIncoming = incoming[visible.length - entries.length]

	return (
		<div className="flex h-80 w-96 flex-col overflow-hidden rounded-xl border border-border bg-background">
			<MessageScroller
				{...scrollerProps}
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
					onClick={() =>
						setVisible((current) =>
							nextIncoming ? [...current, nextIncoming] : current,
						)
					}
				>
					Send reply
				</Button>
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
					"Scroll container for a streamed transcript. It pins the viewport to the newest content while the reader sits at the live edge, and hands scroll control back the moment they move up into the history. `onFollowChange` reports that switch and `scrollerRef.scrollToEnd()` returns to the live edge, so the host owns its own jump-to-latest control.",
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
