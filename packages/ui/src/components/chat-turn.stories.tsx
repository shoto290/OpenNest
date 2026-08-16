import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import { BotWorking } from "@workspace/ui/components/bot-working"
import { Button } from "@workspace/ui/components/button"
import { ChatMarkProvider } from "@workspace/ui/components/chat-mark-context"
import {
	AssistantTurn,
	CHAT_AVATAR_SIZE,
	ChatTurnGroup,
	type ChatTurnState,
	UserTurn,
} from "@workspace/ui/components/chat-turn"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line in the other direction."

const RUN = [
	"Two packages, and the line between them only runs one way.",
	"`@workspace/ui` holds the design system: primitives, tokens and the stories that document them.",
	"`app` holds the Tauri shell and consumes that system. Nothing goes back the other way.",
]

const TURN_STATES: ChatTurnState[] = [
	"streaming",
	"complete",
	"cancelled",
	"failed",
]

const Avatar = () => <BotAvatar animated={false} size={CHAT_AVATAR_SIZE} />

/** The handoff the app performs: a run withholds its closing paragraph until
 * the turn lands, so that row mounts in the very commit that hands it the mark. */
const MarkHandoff = () => {
	const [delivered, setDelivered] = useState(false)

	return (
		<ChatMarkProvider>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => setDelivered(!delivered)}
				>
					{delivered ? "Rewind to working" : "Land the turn"}
				</Button>
				<UserTurn>How is this workspace laid out?</UserTurn>
				{delivered ? (
					<AssistantTurn carriesMark copyText={ANSWER} avatar={<Avatar />}>
						{ANSWER}
					</AssistantTurn>
				) : (
					<BotWorking kind="thinking" />
				)}
			</div>
		</ChatMarkProvider>
	)
}

const TESTS =
	"Beside what they test: Vitest drives the stories in `@workspace/ui`, and `cargo test` covers the Tauri host."

/** A transcript that already holds an answered run, so a second avatar is on
 * screen while the mark moves. */
const MarkedHistory = () => {
	const [working, setWorking] = useState(false)

	return (
		<ChatMarkProvider>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => setWorking(!working)}
				>
					{working ? "Land the turn" : "Start a new turn"}
				</Button>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<ChatTurnGroup>
					<AssistantTurn copyText={ANSWER} avatar={<Avatar />}>
						{ANSWER}
					</AssistantTurn>
				</ChatTurnGroup>
				<UserTurn>And where do the tests live?</UserTurn>
				<ChatTurnGroup carriesMark>
					<AssistantTurn copyText={TESTS} avatar={working ? null : <Avatar />}>
						{TESTS}
					</AssistantTurn>
				</ChatTurnGroup>
				{working ? <BotWorking kind="thinking" /> : null}
			</div>
		</ChatMarkProvider>
	)
}

const meta = preview.meta({
	title: "AI/ChatTurn",
	component: AssistantTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The two transcript rows, one per side. `UserTurn` is a bubble that can offer a retry when the prompt never reached Claude; `AssistantTurn` is a bubble on the other side with a gutter for the bot's avatar. Only the bots are named here — the reader's side carries no avatar at all. A long answer arrives as a run of rows, one per paragraph: wrap those in `ChatTurnGroup` and it tells each row where it sits, so nothing counts rows by hand; pass the avatar and `copyText` on the row that closes the run. Both take the transport's completion verbatim as `state`, so a screen maps nothing. Neither scrolls or animates the list — that belongs to the scroller around them.",
			},
		},
	},
	args: { children: ANSWER, state: "complete", copyText: ANSWER },
})

export const Default = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn>How is this workspace laid out?</UserTurn>
			<AssistantTurn copyText={ANSWER} avatar={<Avatar />}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal exchange: a prompt that landed and an answer that finished. Check that the prompt sits right with no avatar beside it while the answer sits left behind one, and that only the finished answer exposes a copy action. Pick `Run` for an answer that arrived in several parts.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByLabelText("user message")).toBeVisible()
		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
	},
})

export const Run = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<ChatTurnGroup>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<UserTurn>Keep it short.</UserTurn>
			</ChatTurnGroup>
			<ChatTurnGroup>
				{RUN.map((paragraph, index) => (
					<AssistantTurn
						key={paragraph}
						avatar={index === RUN.length - 1 ? <Avatar /> : undefined}
						copyText={index === RUN.length - 1 ? RUN.join("\n\n") : undefined}
					>
						{paragraph}
					</AssistantTurn>
				))}
			</ChatTurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the shape a real answer takes: one paragraph per row, published as each one closes. Check that the run reads as one block — tight spacing and the corners facing a neighbour pulled in — that a single avatar marks it from the last row while the rows above keep the gutter empty, and that one copy action covers the run rather than one per paragraph.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByLabelText("assistant message")).toHaveLength(3)
		await expect(canvas.getAllByRole("button", { name: "Copy" })).toHaveLength(
			1,
		)
	},
})

export const Mark = meta.story({
	render: () => <MarkHandoff />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to watch the bot's mark change homes. While the turn runs the mark belongs to the working row; when the turn lands that row goes and the closing `AssistantTurn` claims it in the gutter. Neither is told an id: the transcript names its own mark — `ChatLayout` does this for a real screen — and whichever of the two is on screen claims it, so it travels instead of blinking. Check that the avatar never disappears mid-move, that the bubble unfolds beside it while the row itself holds still, and that with reduced motion the mark simply arrives. Pick `AI/BotWorking → Mark` for a mark leaving an activity header instead.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const marks = () =>
			canvasElement.querySelectorAll('[data-slot="shared-mark"]')

		await expect(marks()).toHaveLength(1)

		await userEvent.click(canvas.getByRole("button", { name: "Land the turn" }))
		// The answer arrives on a fade, so nothing may be read off it until the
		// reveal has landed.
		await waitFor(() =>
			expect(getComputedStyle(canvas.getByText(ANSWER)).opacity).toBe("1"),
		)

		// One identity throughout: the mark is never absent and never doubled.
		await expect(marks()).toHaveLength(1)

		const gutter = canvasElement.querySelector<HTMLElement>(
			'[data-slot="message-gutter"]',
		)
		const landed = gutter?.firstElementChild

		await expect(landed).toBeInTheDocument()
		// The gutter measures the mark and nothing else, so the spring lands the
		// avatar on the bubble rather than a descender above it.
		await expect(gutter?.getBoundingClientRect().height).toBe(
			landed?.getBoundingClientRect().height,
		)
	},
})

export const MarkAcrossRuns = meta.story({
	render: () => <MarkedHistory />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the transcript has history: every answered run keeps its own avatar, but only the newest group is told `carriesMark`, so only its closing row answers to the transcript's mark. Start a new turn and check that the mark leaves the newest gutter for the working row while the avatar above it does not budge. Pick `Mark` for the handoff itself, and `Primitives/SharedMark` for the invariant underneath it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const gutterAvatars = () =>
			canvasElement.querySelectorAll('[data-slot="message-gutter"] > *')
		const marked = () => canvasElement.querySelectorAll('[data-state="marked"]')

		await expect(gutterAvatars()).toHaveLength(2)
		await expect(marked()).toHaveLength(1)

		const settled = gutterAvatars()[0].getBoundingClientRect()

		await userEvent.click(
			canvas.getByRole("button", { name: "Start a new turn" }),
		)
		await waitFor(() => expect(gutterAvatars()).toHaveLength(1))

		// The mark left for the working row; the run above it never held it, so it
		// stays exactly where it was drawn.
		await expect(marked()).toHaveLength(1)
		await expect(gutterAvatars()[0].getBoundingClientRect().top).toBe(
			settled.top,
		)
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{TURN_STATES.map((state) => (
				<AssistantTurn
					key={state}
					state={state}
					copyText={ANSWER}
					avatar={<Avatar />}
				>
					{state === "streaming" ? ANSWER.slice(0, 48) : ANSWER}
				</AssistantTurn>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every completion the transport can report, in order. Check that `cancelled` keeps the partial text it had when Stop was pressed and marks it `Stopped` rather than treating it as an error, and that `failed` drops the copy action since there is nothing worth taking. Pick `Error` for the user side of a prompt that never reached Claude at all.",
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
			<AssistantTurn copyText={ANSWER} avatar={<Avatar />}>
				{`${ANSWER}\n\n${ANSWER}`}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check the two multi-line paths: a pasted prompt keeps its blank lines in one bubble, and a bot row that was handed more than one paragraph still renders them verbatim. Check that both bubbles stop widening at their cap. Pick `Run` for the split the screen normally performs before it gets here.",
			},
		},
	},
})
