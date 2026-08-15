import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AssistantTurn,
	type ChatTurnState,
	UserTurn,
} from "@workspace/ui/components/chat-turn"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line in the other direction."

const TURN_STATES: ChatTurnState[] = [
	"streaming",
	"complete",
	"cancelled",
	"failed",
]

const meta = preview.meta({
	title: "AI/ChatTurn",
	component: AssistantTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The two transcript rows, one per side. `UserTurn` is a bubble that can offer a retry when the prompt never reached Claude; `AssistantTurn` is plain streamed text with a marker for a turn that was stopped or failed. Both take the transport's completion verbatim as `state`, so a screen maps nothing. Neither scrolls or animates the list — that belongs to the scroller around them.",
			},
		},
	},
	args: { children: ANSWER, state: "complete", copyText: ANSWER },
})

export const Default = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn>How is this workspace laid out?</UserTurn>
			<AssistantTurn copyText={ANSWER}>{ANSWER}</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal exchange: a prompt that landed and an answer that finished. Check that the user side sits right in a bubble while the assistant side runs full width as plain text, and that only the finished answer exposes copy and feedback actions. Pick `Variants` to see the three ways a turn can end badly.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("user message")).toBeVisible()
		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
	},
})

export const Loading = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn>How is this workspace laid out?</UserTurn>
			<AssistantTurn state="streaming">{""}</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the gap between a submitted prompt and the first token: the turn is live but no text exists yet. Check that the typing dots stand in for the answer and that no copy action appears while streaming. Pick `Variants` once the first delta has landed and text is accumulating.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Responding")).toBeInTheDocument()
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{TURN_STATES.map((state) => (
				<AssistantTurn key={state} state={state} copyText={ANSWER}>
					{state === "streaming" ? ANSWER.slice(0, 48) : ANSWER}
				</AssistantTurn>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every completion the transport can report, in order. Check that `cancelled` keeps the partial text it had when Stop was pressed and marks it `Stopped` rather than treating it as an error, and that only `failed` renders the error surface. Pick `Error` for the user side of a prompt that never reached Claude at all.",
			},
		},
	},
})

export const Error = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn state="failed" onRetry={fn()}>
				How is this workspace laid out?
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the write to the CLI was rejected, so the prompt exists in the transcript but Claude never saw it. Check that the retry sits under the bubble on the user side and that the text is preserved verbatim for the resend. Pick `Variants` when Claude did answer and it was the turn that failed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const retry = canvas.getByRole("button", { name: "Retry" })

		await userEvent.click(retry)
		await expect(retry).toBeVisible()
	},
})

export const LongContent = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn>
				{`Walk me through every package.\n\nStart with the design system, then the Tauri shell, and call out anything that crosses between them.`}
			</UserTurn>
			<AssistantTurn copyText={ANSWER}>
				{`${ANSWER}\n\n${ANSWER}\n\n${ANSWER}`}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the two multi-line paths: a pasted prompt with blank lines and an answer several paragraphs long. Check that both preserve newlines instead of collapsing them, and that the user bubble stops widening at its cap while the assistant text runs to the column edge. Pick `Default` for one-line turns.",
			},
		},
	},
})
