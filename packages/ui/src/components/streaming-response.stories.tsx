import { useEffect, useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import {
	StreamingResponse,
	type StreamingResponseStatus,
} from "@workspace/ui/components/streaming-response"

const RESPONSE_STATUSES = listExhaustively<StreamingResponseStatus>({
	streaming: true,
	complete: true,
	error: true,
})

const STREAMED_CHUNKS = [
	"Reading the three call sites that still pass the legacy sources prop.",
	" Two of them live in the sidebar transcript, ",
	"the third is the inline diff viewer.",
]

const STREAMED_TEXT = STREAMED_CHUNKS.join("")

const COMPLETE_ANSWER =
	"The renderer already batches every token into a single paragraph node, so the transcript never scrolls back to the top mid-answer."

function StreamedText({ chunks }: { chunks: string[] }) {
	const [visibleChunks, setVisibleChunks] = useState(1)

	useEffect(() => {
		if (visibleChunks >= chunks.length) return
		const timer = window.setTimeout(
			() => setVisibleChunks((count) => count + 1),
			160,
		)
		return () => window.clearTimeout(timer)
	}, [visibleChunks, chunks.length])

	return <p>{chunks.slice(0, visibleChunks).join("")}</p>
}

const meta = preview.meta({
	title: "AI/StreamingResponse",
	component: StreamingResponse,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Surface for one Claude Code answer: it renders the response as it arrives, then reveals the end-of-message actions once the stream settles. It never parses Markdown itself — pass already-rendered nodes and let the caller own the token buffer.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
	args: {
		status: "complete",
		onFeedbackChange: fn(),
	},
	argTypes: {
		status: { control: "inline-radio", options: RESPONSE_STATUSES },
		announce: { control: "boolean" },
		showActions: { control: "boolean" },
	},
})

export const Streaming = meta.story({
	args: {
		status: "streaming",
		children: <StreamedText chunks={STREAMED_CHUNKS} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while tokens are still arriving: the paragraph grows chunk by chunk and the surface holds at `aria-busy`. Check that each chunk lands appended, never re-emitted or re-ordered, and that no action row appears yet — `Default` covers the settled answer, this one covers the answer still being written.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await canvas.findByText(STREAMED_TEXT)

		await expect(canvas.getAllByText(STREAMED_TEXT)).toHaveLength(1)
		await expect(
			canvasElement.querySelector('[data-slot="streaming-response"]'),
		).toHaveAttribute("aria-busy", "true")
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const Default = meta.story({
	args: {
		children: <p>{COMPLETE_ANSWER}</p>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The settled answer, one paragraph long. Check that `aria-busy` has dropped, that the feedback pair fades in below the text, and that the answer stays plain selectable DOM text rather than a canvas or a visually-hidden mirror.",
			},
		},
	},
	play: async ({ canvas }) => {
		const answer = canvas.getByText(COMPLETE_ANSWER)

		await expect(getComputedStyle(answer).userSelect).not.toBe("none")
		await expect(canvas.getByRole("button", { name: "Helpful" })).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: {
		children: (
			<>
				<p>
					Splitting the transcript store took three passes, because the reducer
					was also the place where every optimistic message was reconciled
					against the server echo.
				</p>
				<p>What changed, in order:</p>
				<ol>
					<li>
						Moved optimistic reconciliation out of the reducer and into the
						socket adapter.
					</li>
					<li>
						Gave each message a stable client id so the echo can be matched
						without comparing bodies.
					</li>
					<li>
						Left the reducer with a single job: append, replace, or drop one
						message.
					</li>
				</ol>
				<p>Two things are still open and worth a second look:</p>
				<ul>
					<li>
						Reconnects replay the last twenty messages, so the adapter dedupes
						on every socket open.
					</li>
					<li>
						Nothing yet cancels an in-flight answer when the user edits the
						prompt above it.
					</li>
				</ul>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Ordinary formatted prose — paragraphs, an ordered list and a bulleted list — long enough to wrap at every viewport. Check the vertical rhythm between blocks and that list markers stay inside the content column instead of hanging into the gutter.",
			},
		},
	},
})

export const WithLinksAndCode = meta.story({
	args: {
		children: (
			<>
				<p>
					The dedupe now lives in <code>useTranscriptSocket</code>, next to the
					reconnect handler rather than in the reducer.
				</p>
				<pre>
					<code>{`const seen = new Set(cached.map((message) => message.clientId))
const fresh = replayed.filter((message) => !seen.has(message.clientId))`}</code>
				</pre>
				<p>
					The matching rule is written down in{" "}
					<a href="https://docs.example.com/transcript/replay">
						the replay contract
					</a>
					, which is worth reading before changing the window size.
				</p>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the answer carries a snippet or a reference. Check that inline `code` keeps the line height of its paragraph, that the fenced block scrolls sideways instead of stretching the column, and that the link reads as a link without an icon crutch.",
			},
		},
	},
	play: async ({ canvas }) => {
		const link = canvas.getByRole("link", { name: "the replay contract" })

		await expect(link).toHaveAttribute(
			"href",
			"https://docs.example.com/transcript/replay",
		)
	},
})

export const WithActions = meta.story({
	args: {
		children: <p>{COMPLETE_ANSWER}</p>,
		onCopy: fn(),
		onRetry: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The full end-of-message row: copy, retry, then the feedback pair. Check that copy confirms in place and reverts on its own, that retry stays available after a rating, and that the two feedback buttons behave as one toggle — rating down clears an earlier rating up.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Copy response" }))
		await expect(args.onCopy).toHaveBeenCalled()
		await expect(canvas.getByRole("button", { name: "Copied" })).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Retry response" }),
		)
		await expect(args.onRetry).toHaveBeenCalled()

		const helpful = canvas.getByRole("button", { name: "Helpful" })
		const notHelpful = canvas.getByRole("button", { name: "Not helpful" })

		await userEvent.click(helpful)
		await expect(helpful).toHaveAttribute("aria-pressed", "true")
		await expect(args.onFeedbackChange).toHaveBeenCalledWith("up")

		await userEvent.click(notHelpful)
		await expect(helpful).toHaveAttribute("aria-pressed", "false")
		await expect(notHelpful).toHaveAttribute("aria-pressed", "true")

		await userEvent.click(notHelpful)
		await expect(notHelpful).toHaveAttribute("aria-pressed", "false")
		await expect(args.onFeedbackChange).toHaveBeenCalledWith(null)
	},
})
