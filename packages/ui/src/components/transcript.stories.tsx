import { useRef, useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button } from "@workspace/ui/components/button"
import {
	Transcript,
	type TranscriptItem,
	type TranscriptProps,
} from "@workspace/ui/components/transcript"
import { cn } from "@workspace/ui/lib/utils"

interface Entry {
	id: string
	from: "user" | "assistant"
	text: string
}

const FRAME_CLASS =
	"flex h-80 w-96 flex-col overflow-hidden rounded-xl border border-border bg-background"

const FRAME_HEIGHTS = [320, 220]

const entryOf = (index: number): Entry => ({
	id: `turn-${index}`,
	from: index % 2 === 0 ? "user" : "assistant",
	text: `Run ${index + 1} of the conversation, long enough to take a line or two of the frame.`,
})

const HISTORY = Array.from({ length: 12 }, (_, index) => entryOf(index))

const SHORT_HISTORY = HISTORY.slice(0, 2)

const OLDER_PAGE = Array.from({ length: 6 }, (_, index) => ({
	id: `older-${index}`,
	from: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
	text: `Older run ${index + 1}, prepended above the reading position.`,
}))

const REPLIES = Array.from({ length: 4 }, (_, index) => ({
	id: `reply-${index}`,
	from: "assistant" as const,
	text: `Reply ${index + 1} arriving while the reader watches the live edge.`,
}))

const PROMPT: Entry = {
	id: "prompt",
	from: "user",
	text: "Walk me through the rollout, one step at a time.",
}

const ANSWER_WORDS = (
	"The index build goes first and reports done at around four minutes. " +
	"The migration starts right after it, inside a single transaction, so the " +
	"copy into role_id and the drop of the legacy column either both land or " +
	"neither does."
).split(" ")

const SHORT_ANSWER_WORDS = ANSWER_WORDS.slice(0, 1)

const STREAM_TICK_MS = 16

const ONE_LINE = 24

const Bubble = ({ entry }: { entry: Entry }) => (
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

const toItems = (entries: Entry[]): TranscriptItem[] =>
	entries.map((entry) => ({
		key: entry.id,
		messageIds: [entry.id],
		isAnchor: entry.from === "user",
		render: () => <Bubble entry={entry} />,
	}))

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

const atLiveEdge = (viewport: HTMLElement) =>
	waitFor(() => expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(2))

const RESTING_PADDING = 12

const spaceUnder = (viewport: HTMLElement, bubble: HTMLElement) => {
	const bottom =
		bubble.getBoundingClientRect().bottom -
		viewport.getBoundingClientRect().top +
		viewport.scrollTop
	return viewport.scrollHeight - bottom
}

const expectRestingPadding = (viewport: HTMLElement, bubble: HTMLElement) =>
	expect(spaceUnder(viewport, bubble)).toBeLessThanOrEqual(RESTING_PADDING)

const RETURN_CONTROL = { name: /Jump to latest|new messages?/ }

const scrollUp = async (viewport: HTMLElement) => {
	viewport.dispatchEvent(
		new WheelEvent("wheel", { bubbles: true, deltaY: -200 }),
	)
	viewport.scrollTop = 0
	await settleScroll()
}

type DemoProps = Omit<TranscriptProps, "children" | "rows" | "older"> & {
	entries?: Entry[]
	incoming?: Entry[]
	olderPages?: Entry[][]
}

const TranscriptDemo = ({
	entries = HISTORY,
	incoming = REPLIES,
	olderPages,
	...transcriptProps
}: DemoProps) => {
	const [shown, setShown] = useState(entries)
	const [sent, setSent] = useState(0)
	const [pending, setPending] = useState(olderPages ?? [])
	const next = incoming[sent]

	const deliverIncoming = () => {
		if (!next) return
		setShown((current) => [...current, next])
		setSent((current) => current + 1)
	}

	const deliverOlder = () => {
		const page = pending[0]
		if (!page) return
		setShown((current) => [...page, ...current])
		setPending((current) => current.slice(1))
	}

	return (
		<div className={FRAME_CLASS}>
			<Transcript
				{...transcriptProps}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				older={
					olderPages
						? { has: pending.length > 0, onLoad: deliverOlder }
						: undefined
				}
				rows={toItems(shown)}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button disabled={!next} onClick={deliverIncoming} size="sm">
					Send reply
				</Button>
			</div>
		</div>
	)
}

type StreamingDemoProps = Omit<TranscriptProps, "children" | "rows"> & {
	answerWords?: string[]
}

const StreamingDemo = ({
	answerWords = ANSWER_WORDS,
	...transcriptProps
}: StreamingDemoProps) => {
	const [shown, setShown] = useState(HISTORY)
	const [words, setWords] = useState(0)
	const [isStreaming, setIsStreaming] = useState(false)
	const [frameHeight, setFrameHeight] = useState(FRAME_HEIGHTS[0])
	const timerRef = useRef<number | undefined>(undefined)

	const sendPrompt = () => {
		setShown([...HISTORY, PROMPT])
		setWords(0)
		setIsStreaming(true)

		let delivered = 0
		timerRef.current = window.setInterval(() => {
			delivered += 1
			setWords(delivered)
			if (delivered < answerWords.length) return
			window.clearInterval(timerRef.current)
			setIsStreaming(false)
		}, STREAM_TICK_MS)
	}

	const streamed =
		words > 0
			? [
					{
						id: "answer",
						from: "assistant" as const,
						text: answerWords.slice(0, words).join(" "),
					},
				]
			: []

	return (
		<div className={FRAME_CLASS} style={{ blockSize: frameHeight }}>
			<Transcript
				{...transcriptProps}
				busy={isStreaming}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				rows={toItems([...shown, ...streamed])}
			>
				{isStreaming ? (
					<div className="flex h-10 items-center text-muted-foreground text-xs">
						Working
					</div>
				) : null}
			</Transcript>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button disabled={isStreaming} onClick={sendPrompt} size="sm">
					Send prompt
				</Button>
				<Button
					onClick={() =>
						setFrameHeight((current) =>
							current === FRAME_HEIGHTS[0]
								? FRAME_HEIGHTS[1]
								: FRAME_HEIGHTS[0],
						)
					}
					size="sm"
					variant="outline"
				>
					Resize frame
				</Button>
				<span className="text-muted-foreground text-xs">
					{isStreaming ? "Streaming" : "Idle"}
				</span>
			</div>
		</div>
	)
}

const meta = preview.meta({
	title: "Conversation/Message/Transcript",
	component: Transcript,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Scroll container for a streamed transcript, composed on the shadcn MessageScroller primitive. Every row is mounted: nothing is windowed and no row height is guessed. It holds the live edge while the reader sits there, hands scroll control back the moment they move up, and shows a return control that takes them back and resumes following. `older` adds the load-older affordance at the top and the reading position survives the page being prepended above it. `rows` is one entry per run, with the `messageIds` it anchors, and a row marked `isAnchor` is a message the reader sent: with `anchorOnSend` the newest one is parked near the top of the viewport with a peek of the previous turn while the answer fills the room below. `marksNewMessages` draws a session-local separator where the reader was released, `countsNewMessages` names on the return control how many arrived since. A new `transcriptKey` forgets both and lands at the end again.",
			},
		},
	},
	args: {
		label: "Conversation",
		onFollowChange: fn(),
	},
	argTypes: {
		busy: { control: "boolean" },
		label: { control: "text" },
		anchorOnSend: { control: "boolean" },
		marksNewMessages: { control: "boolean" },
		countsNewMessages: { control: "boolean" },
	},
	render: (args) => <TranscriptDemo {...args} />,
})

export const Default = meta.story({
	render: (args) => <TranscriptDemo {...args} entries={SHORT_HISTORY} />,
	parameters: {
		docs: {
			description: {
				story:
					"A transcript short enough to fit the frame. Nothing scrolls, the reader is following, the return control stays out of the way, the viewport carries no scroll fade over its edges, and it reserves no gutter for a scrollbar in its layout width.",
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeLessThanOrEqual(
			viewport.clientHeight + 1,
		)
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
		await expect(getComputedStyle(viewport).maskImage).toBe("none")
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
	},
})

export const LandsAtEnd = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A resumed conversation, longer than the frame on first paint. The reader lands on the newest message instead of on history they have already read.",
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
		await atLiveEdge(viewport)
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
	},
})

export const Follows = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Replies arriving while the reader sits at the live edge. Each one pulls the viewport down so the last rendered line stays inside the frame.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)

		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
	},
})

export const StreamHoldsTheLastLine = meta.story({
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"An answer streamed word by word while the reader watches. The viewport never falls more than a line behind the growing answer, and it sits exactly on the last line once the final token lands.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))

		let samples = 0
		let widest = 0
		while (canvas.queryByText("Streaming")) {
			await settleScroll()
			widest = Math.max(widest, distanceFromEnd(viewport))
			samples += 1
		}

		await expect(samples).toBeGreaterThan(2)
		await expect(widest).toBeLessThanOrEqual(ONE_LINE)
		await atLiveEdge(viewport)
	},
})

export const Disengages = meta.story({
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reader scrolls up into the history mid-stream. Following stops, the answer keeps growing off screen, and the return control comes out.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await scrollUp(viewport)

		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await waitFor(() =>
			expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
				"data-active",
				"true",
			),
		)
		await expect(viewport.scrollTop).toBeLessThan(40)
	},
})

export const Returns = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The reader takes the return control back to the newest message. The viewport lands at the end and following resumes, so the next reply pulls it down again.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(canvas.getByRole("button", RETURN_CONTROL))
		await atLiveEdge(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(true))

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)
	},
})

export const PrependsOlderMessages = meta.story({
	render: (args) => (
		<TranscriptDemo {...args} entries={HISTORY} olderPages={[OLDER_PAGE]} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A page of older messages loaded from the top of the history. The row the reader was looking at keeps its exact screen position while the page is inserted above it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)

		const anchor = canvas.getByText(HISTORY[0].text)
		const before = anchor.getBoundingClientRect().top

		await userEvent.click(
			canvas.getByRole("button", { name: "Load older messages" }),
		)
		await waitFor(() =>
			expect(canvas.getByText(OLDER_PAGE[0].text)).toBeInTheDocument(),
		)
		await settleScroll()

		await expect(
			Math.abs(anchor.getBoundingClientRect().top - before),
		).toBeLessThanOrEqual(2)
	},
})

export const AnchorsTheSentMessage = meta.story({
	args: { anchorOnSend: true },
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A solo thread: the message the reader just sent is parked near the top of the viewport with a peek of the previous turn above it, and the answer fills the room below. The reader is still reported as following.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))

		const sent = canvas.getByText(PROMPT.text)
		await waitFor(() => {
			const offset =
				sent.getBoundingClientRect().top - viewport.getBoundingClientRect().top
			expect(offset).toBeGreaterThan(0)
			expect(offset).toBeLessThan(viewport.clientHeight / 2)
		})
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
	},
})

export const MarksAndCountsNewMessages = meta.story({
	args: { countsNewMessages: true, marksNewMessages: true },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation: once the reader is released, a separator marks where they stopped reading and the return control names how many messages arrived since.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() =>
			expect(canvas.getByText("New messages")).toBeInTheDocument(),
		)
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: "1 new message" }),
			).toBeInTheDocument(),
		)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: "2 new messages" }),
			).toBeInTheDocument(),
		)
	},
})

export const RestsWithoutABand = meta.story({
	args: { anchorOnSend: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same solo thread once the answer has landed and the working row has left the tail. The send anchor is released, so the room it held under the last bubble collapses and only the resting padding is left between that bubble and the composer.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitFor(() => expect(canvas.getByText("Working")).toBeInTheDocument())
		await waitFor(() => expect(canvas.queryByText("Working")).toBeNull(), {
			timeout: 5000,
		})

		await expectRestingPadding(
			viewport,
			canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
		)
	},
})

export const ConversationRestsWithoutABand = meta.story({
	args: { countsNewMessages: true, marksNewMessages: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same rest in a conversation, where nothing is anchored on send. Once the answer has landed and the working row has left the tail, the space under the last bubble is the resting padding, not a band left by a row the browser never sized.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitFor(() => expect(canvas.getByText("Working")).toBeInTheDocument())
		await waitFor(() => expect(canvas.queryByText("Working")).toBeNull(), {
			timeout: 5000,
		})

		await expectRestingPadding(
			viewport,
			canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
		)
	},
})

export const RestsAfterAResize = meta.story({
	args: { anchorOnSend: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The window changes size once the answer has settled. The transcript follows the new frame down to its last bubble and leaves the resting padding under it, with no band opening up as rows are skipped and un-skipped.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send prompt" }))
		await waitFor(() => expect(canvas.getByText("Working")).toBeInTheDocument())
		await waitFor(() => expect(canvas.queryByText("Working")).toBeNull(), {
			timeout: 5000,
		})

		const answer = canvas.getByText(SHORT_ANSWER_WORDS.join(" "))
		await expectRestingPadding(viewport, answer)

		await userEvent.click(canvas.getByRole("button", { name: "Resize frame" }))
		await settleScroll()
		await expectRestingPadding(viewport, answer)

		await userEvent.click(canvas.getByRole("button", { name: "Resize frame" }))
		await settleScroll()
		await expectRestingPadding(viewport, answer)
	},
})
