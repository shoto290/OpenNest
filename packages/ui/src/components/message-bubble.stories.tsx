import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	listExhaustively,
} from "@workspace/storybook/story-utils"
import { MessageTyping } from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleCollapsible,
	MessageBubbleContent,
	MessageBubbleGroup,
	type MessageBubbleVariant,
} from "@workspace/ui/components/message-bubble"

const MESSAGE_BUBBLE_VARIANTS = listExhaustively<MessageBubbleVariant>({
	solid: true,
	soft: true,
	tint: true,
	outline: true,
	ghost: true,
	bare: true,
	danger: true,
})

const THREAD_WIDTH = "w-[34rem] max-w-full"

const USER_PROMPT =
	"Summarise yesterday's onboarding call and pull out the follow-ups."

const AGENT_REPLY =
	"Three follow-ups came out of it: send Ada Martin the revised quote, book the migration window, and confirm who owns the data export."

const USER_LONG_PROMPT =
	"We are migrating two workspaces on the same weekend and the second one still runs the legacy export. Walk me through the order of operations, and tell me where it can go wrong so I can brief the team on Monday."

const AGENT_LONG_REPLY = [
	"Freeze writes on the legacy workspace first. Everything downstream assumes the export is a snapshot, so a single late write is enough to make the two workspaces disagree about the same record.",
	"Then run the export against the frozen copy and check the row counts before you touch the target. The export is cheap to repeat and expensive to undo, which is why it goes before the cutover rather than after it.",
	"Cut the first workspace over, wait for one full sync cycle, and only then start the second. Running them in parallel halves the wall clock and doubles the number of places a failure can hide.",
	"The failure most teams hit is the export finishing while a scheduled job is still writing. Disable the scheduler explicitly instead of trusting the freeze, and keep the legacy workspace readable for a week so you can diff anything that looks wrong on Monday.",
]

const AGENT_STREAMED_PREFIX =
	"Freeze writes on the legacy workspace first, then run the export against the frozen copy and check the row"

const meta = preview.meta({
	title: "AI/MessageBubble",
	component: MessageBubble,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One turn of a chat transcript. `solid` is the OpenNest yellow and is reserved for what the user sent; the agent answers in `soft`. Wrap consecutive turns in `MessageBubbleGroup`, and reach for `MessageBubbleCollapsible` when an answer is long enough to bury the rest of the thread.",
			},
		},
	},
	args: {
		variant: "soft",
		align: "start",
		animateIn: false,
	},
	argTypes: {
		variant: { control: "select", options: MESSAGE_BUBBLE_VARIANTS },
		align: { control: "inline-radio", options: ["start", "end"] },
		animateIn: { control: "boolean" },
	},
	render: (args) => (
		<MessageBubbleGroup className={THREAD_WIDTH}>
			<MessageBubble {...args}>
				<MessageBubbleContent>{AGENT_REPLY}</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
})

export const Playground = meta.story({})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The pairing every transcript is built from: the user in `solid` yellow pinned to the trailing edge, the agent in `soft` on the leading edge. Check that the two surfaces stay distinguishable in both themes and that each bubble hugs its own content, free to span the whole row when the message is long enough. Reach for `Variants` instead when you need to compare a surface in isolation.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>{AGENT_REPLY}</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas }) => {
		const sent = canvas.getByText(USER_PROMPT).closest("[data-slot]")
		const received = canvas.getByText(AGENT_REPLY).closest("[data-slot]")

		await expect(sent?.closest("[data-align]")).toHaveAttribute(
			"data-variant",
			"solid",
		)
		await expect(received?.closest("[data-align]")).toHaveAttribute(
			"data-align",
			"start",
		)
	},
})

export const Variants = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			{MESSAGE_BUBBLE_VARIANTS.map((variant) => (
				<MessageBubble key={variant} variant={variant} align="start">
					<MessageBubbleContent>{variant}</MessageBubbleContent>
				</MessageBubble>
			))}
		</MessageBubbleGroup>
	),
})

export const LongContent = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Reach for this when an answer runs past a screenful: a four-paragraph reply clamped by `MessageBubbleCollapsible`. Check that the fade mask lands on a clamped line rather than mid-glyph, that the trigger reads `Show more` before expanding and `Show less` after, and that the surface re-measures instead of snapping. `Default` covers the length a bubble handles without a collapsible.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_LONG_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent>
					<MessageBubbleCollapsible collapsedLines={4}>
						{AGENT_LONG_REPLY.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</MessageBubbleCollapsible>
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Show more" })
		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(trigger)

		await expect(
			canvas.getByRole("button", { name: "Show less" }),
		).toHaveAttribute("aria-expanded", "true")
	},
})

export const Loading = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The gap between sending and the first token: an empty `soft` bubble holding the typing dots, so the thread reserves the agent's slot instead of jumping when text lands. Check that the bubble keeps its minimum width and that screen readers get the `label` rather than three animated dots. `Streaming` covers the state after the first token arrives.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent aria-live="polite" aria-busy="true">
					<MessageTyping label="Assistant is replying" />
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Assistant is replying")).toBeInTheDocument()
	},
})

export const Streaming = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Tokens are landing: a partial sentence cut mid-word with the dots trailing it inline. Check that the indicator sits on the text baseline and that the growing surface animates its own size rather than popping — this is the state that exercises the bubble's layout spring. Pick `Loading` when nothing has arrived yet.",
			},
		},
	},
	render: () => (
		<MessageBubbleGroup spacing="default" className={THREAD_WIDTH}>
			<MessageBubble variant="solid" align="end">
				<MessageBubbleContent>{USER_LONG_PROMPT}</MessageBubbleContent>
			</MessageBubble>
			<MessageBubble variant="soft" align="start">
				<MessageBubbleContent aria-live="polite" aria-busy="true">
					{AGENT_STREAMED_PREFIX}
					<MessageTyping label="Still writing" className="ml-1.5" />
				</MessageBubbleContent>
			</MessageBubble>
		</MessageBubbleGroup>
	),
})
