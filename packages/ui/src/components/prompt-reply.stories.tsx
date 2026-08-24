import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptReply } from "@workspace/ui/components/prompt-reply"

const AUTHOR = "Skippy"

const EXCERPT =
	"The whole migration runs inside one transaction, so a failure rolls back every statement including the drop."

const PROMPT = "Then what happens to the invites table?"

const jump = fn()

const ReplyingComposer = () => {
	const [isReplying, setIsReplying] = useState(true)
	const composer = <PromptInput aria-label="Prompt" defaultValue={PROMPT} />

	return isReplying ? (
		<PromptReply
			author={AUTHOR}
			excerpt={EXCERPT}
			from="assistant"
			onJump={jump}
			onDismiss={() => setIsReplying(false)}
		>
			{composer}
		</PromptReply>
	) : (
		composer
	)
}

const meta = preview.meta({
	title: "AI/PromptReply",
	component: PromptReply,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The frame the composer wears while the next prompt answers one message: it wraps the composer rather than sitting inside it, so the quoted message reads above the pill and the two are one block. It holds the reply glyph, the quoted author with the first line of what they wrote, and the one control that takes the reply back. Its corner is the composer's own plus the padding around it, so the two curves stay concentric whether the composer is a pill or has grown into its expanded shape. It draws only — the host holds which message is being answered, writes the excerpt, moves the transcript when the quote is pressed and drops the frame when the cross is. `AI/MessageQuote` is the frame underneath it, `AI/ChatTurn → Quoted` is the same frame around a bubble.",
			},
		},
	},
	args: {
		author: AUTHOR,
		excerpt: EXCERPT,
		from: "assistant" as const,
		onJump: fn(),
		onDismiss: fn(),
		children: <PromptInput aria-label="Prompt" defaultValue={PROMPT} />,
	},
	decorators: [
		(Story) => (
			<div className="w-[34rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal frame. Check that the quote sits above the composer and that the frame encloses it on its secondary fill instead of the strip living inside the pill, that the excerpt keeps to one line however long the quoted message is, and that the two controls report different things: pressing the quote asks for a jump, pressing the cross asks for the reply to be dropped. Neither does anything to the composer on its own — the group reads `Replying to Skippy` for a screen reader.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const frame = canvas.getByRole("group", { name: `Replying to ${AUTHOR}` })
		const composer = canvas.getByRole("textbox", { name: "Prompt" })

		await expect(frame).toContainElement(composer)
		await expect(
			canvas.getByText(EXCERPT).getBoundingClientRect().bottom,
		).toBeLessThanOrEqual(composer.getBoundingClientRect().top)

		await userEvent.click(canvas.getByRole("button", { name: /Skippy/ }))
		await expect(args.onJump).toHaveBeenCalledTimes(1)

		await userEvent.click(canvas.getByRole("button", { name: "Cancel reply" }))
		await expect(args.onDismiss).toHaveBeenCalledTimes(1)
	},
})

export const Dismissed = meta.story({
	render: () => <ReplyingComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Taking the reply back, live: the host stops rendering the frame and the composer is left alone. Check that the prompt already typed survives the frame going away and that the composer keeps its own shape once unwrapped — the frame owns no state of the composer.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole("group")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Cancel reply" }))
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()
		await expect(canvas.getByRole("textbox", { name: "Prompt" })).toHaveValue(
			PROMPT,
		)
	},
})
