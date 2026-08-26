import { useState } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
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
import {
	type ConversationBot,
	ConversationBotsProvider,
} from "@workspace/ui/components/conversation-bots"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MessageAuthor } from "@workspace/ui/components/message"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell. Nothing crosses that line in the other direction."

const RUN = [
	"Two packages, and the line between them only runs one way.",
	"`@workspace/ui` holds the design system: primitives, tokens and the stories that document them.",
	"`app` holds the Tauri shell and consumes that system. Nothing goes back the other way.",
]

const QUEUED = "And then run the test suite once that lands."

const cancelQueued = fn()

const reply = fn()

const pin = fn()

const jumpToQuoted = fn()

const QUESTION = "Is any of that destructive?"

const QUOTED_BOT = {
	author: "Skippy",
	excerpt: ANSWER,
	from: "assistant",
	onJump: jumpToQuoted,
} as const

const QUOTED_READER = {
	author: "You",
	excerpt: QUESTION,
	from: "user",
	onJump: jumpToQuoted,
} as const

const rightClickOn = async (target: HTMLElement) => {
	const bounds = target.getBoundingClientRect()
	const coords = { clientX: bounds.left + 8, clientY: bounds.top + 8 }

	fireEvent.pointerDown(target, { button: 2, ...coords })
	const defaulted = fireEvent.contextMenu(target, coords)

	return { defaulted }
}

const openTurnMenu = async (target: HTMLElement) => {
	await rightClickOn(target)
	return screen.findByRole("menu")
}

const PASTED = `Walk me through every package.\n\nStart with the design system, then the Tauri shell, and call out anything that crosses between them.`

const TABLE_INTRO = "Here is what each chapter covers."

const TABLE = `| § | Subject |
| --- | --- |
| 1–2 | The right mental model |
| 3 | Context as a scarce resource |
| 4–5 | Framing a request, writing a ticket |`

const LEAD: MessageAuthor = {
	id: "bot-atlas",
	name: "Atlas",
	animal: "owl",
	blot: "blue",
	isLead: true,
}

const SECOND: MessageAuthor = {
	id: "bot-basile",
	name: "Basile",
	animal: "cat",
	blot: "purple",
}

const GONE: MessageAuthor = {
	id: "bot-elia",
	name: "Elia",
	animal: "mouse",
	isDeleted: true,
}

const ROOM: ConversationBot[] = [LEAD, SECOND]

const LEAD_RUN = [
	"I have the release notes. The migration is not mine.",
	"<@bot-basile> owns that script, and <@bot-elia> wrote the fixture it reads.",
]

const SECOND_REPLY =
	"Taken. The migration is green on a fresh database, so <@bot-atlas> can publish."

const GONE_REPLY =
	"The fixture still names the old columns. Somebody will have to rewrite it."

const TURN_STATES: ChatTurnState[] = [
	"streaming",
	"complete",
	"cancelled",
	"failed",
]

const Avatar = () => <BotAvatar animated={false} size={CHAT_AVATAR_SIZE} />

const bubblePaddingOf = (node: Element) => {
	const bubble = node.closest<HTMLElement>(
		'[data-slot="message-bubble-content"]',
	)
	if (!bubble) throw new globalThis.Error("This node sits in no bubble")
	return getComputedStyle(bubble).paddingLeft
}

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
					"The two transcript rows, one per side. `UserTurn` is a bubble that can offer a retry when the prompt never reached Claude, and that holds the wait for a prompt written while another turn runs — `queued` draws it a step back from a sent prompt, with its own way out; `AssistantTurn` is a bubble on the other side with a gutter for the bot's avatar. Only the bots are named here — the reader's side carries no avatar at all. A long answer arrives as a run of rows, one per paragraph: wrap those in `ChatTurnGroup` and it tells each row where it sits, so nothing counts rows by hand, and pass the avatar on the row that closes the run. A block that already draws its own frame — a table — takes `bare`, which drops the bubble behind it rather than boxing the same grid twice. `copyText` is per bubble and holds that bubble's own words — a row handed an empty one, as a turn that stopped before writing is, offers no copy at all. Both take the transport's completion verbatim as `state`, so a screen maps nothing. A row given `onReply` reveals a second action ahead of copy, and a row given `repliedTo` is wrapped in the quote of the message it answers — both report to the screen and neither knows what is being quoted. `messageId` anchors the row so the scroller can be asked to bring it back, and it is set once per message: a message split into a run puts it on the group instead of on every paragraph. Neither scrolls or animates the list — that belongs to the scroller around them.",
			},
		},
	},
	args: { children: ANSWER, state: "complete", copyText: ANSWER },
})

export const Default = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText="How is this workspace laid out?">
				How is this workspace laid out?
			</UserTurn>
			<AssistantTurn copyText={ANSWER} avatar={<Avatar />}>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal exchange: a prompt that landed and an answer that finished. Check that the prompt sits right with no avatar beside it while the answer sits left behind one, and that hovering either bubble fades in a copy action on its outer side — the reader's own words are as copyable as the bot's. Pick `Run` for an answer that arrived in several parts.",
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
				<UserTurn copyText="How is this workspace laid out?">
					How is this workspace laid out?
				</UserTurn>
				<UserTurn copyText="Keep it short.">Keep it short.</UserTurn>
			</ChatTurnGroup>
			<ChatTurnGroup>
				{RUN.map((paragraph, index) => (
					<AssistantTurn
						key={paragraph}
						avatar={index === RUN.length - 1 ? <Avatar /> : undefined}
						copyText={paragraph}
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
					"Reach for this for the shape a real answer takes: one paragraph per row, published as each one closes. Check that the run reads as one block — tight spacing and the corners facing a neighbour pulled in — and that a single avatar marks it from the last row while the rows above keep the gutter empty. Every bubble carries its own copy, and copying one takes that paragraph alone: there is no action anywhere for the answer entire, because the reader points at the part they want.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByLabelText("assistant message")).toHaveLength(3)
		await expect(canvas.getAllByRole("button", { name: "Copy" })).toHaveLength(
			5,
		)
	},
})

export const Mark = meta.story({
	render: () => <MarkHandoff />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to watch the bot's mark change homes. While the turn runs the mark belongs to the working row; when the turn lands that row goes and the closing `AssistantTurn` claims it in the gutter. Neither is told an id: the transcript names its own mark — `ChatLayout` does this for a real screen — and whichever of the two is on screen claims it, so it travels instead of blinking. Check that the avatar never disappears mid-move, that the bubble simply appears beside it while the row itself holds still, and that with reduced motion the mark simply arrives. Pick `Feedback/BotWorking → Mark` for a mark leaving an activity header instead.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const marks = () =>
			canvasElement.querySelectorAll('[data-slot="shared-mark"]')

		await expect(marks()).toHaveLength(1)

		await userEvent.click(canvas.getByRole("button", { name: "Land the turn" }))
		await waitFor(() =>
			expect(getComputedStyle(canvas.getByText(ANSWER)).opacity).toBe("1"),
		)

		await expect(marks()).toHaveLength(1)

		const gutter = canvasElement.querySelector<HTMLElement>(
			'[data-slot="message-gutter"]',
		)
		const landed = gutter?.firstElementChild

		await expect(landed).toBeInTheDocument()
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

		await expect(marked()).toHaveLength(1)
		await expect(gutterAvatars()[0].getBoundingClientRect().top).toBe(
			settled.top,
		)
	},
})

export const Variants = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{TURN_STATES.map((state) => {
				const text = state === "streaming" ? ANSWER.slice(0, 48) : ANSWER
				return (
					<AssistantTurn
						key={state}
						state={state}
						copyText={text}
						avatar={<Avatar />}
					>
						{text}
					</AssistantTurn>
				)
			})}
			<AssistantTurn state="cancelled" copyText="" avatar={<Avatar />}>
				{""}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every completion the transport can report, in order, then the row a turn stopped before writing anything leaves behind. Check that `cancelled` keeps the partial text it had when Stop was pressed and marks it `Stopped` rather than treating it as an error, that `failed` still offers its copy since the words it did write are worth taking, and that the empty row is the only one without one — an empty bubble has nothing to hand over. Pick `Error` for the user side of a prompt that never reached Claude at all.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("button", { name: "Copy" })).toHaveLength(
			4,
		)
	},
})

export const Table = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText="What does the guide cover?">
				What does the guide cover?
			</UserTurn>
			<ChatTurnGroup>
				<AssistantTurn copyText={TABLE_INTRO}>{TABLE_INTRO}</AssistantTurn>
				<AssistantTurn bare copyText={TABLE} avatar={<Avatar />}>
					<Markdown>{TABLE}</Markdown>
				</AssistantTurn>
			</ChatTurnGroup>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the row a table lands in. A table frames and fills itself, so the row is `bare`: no bubble behind it, no padding around it, and one box around the grid instead of two. Check that the sentence above it keeps its bubble, that the table sits flush against the gutter and still marks the run with its avatar, and that the row's copy stays beside the frame rather than out at the edge of the transcript.",
			},
		},
	},
	play: async ({ canvas }) => {
		const table = canvas.getByRole("group", { name: "Table" })

		await expect(table).toBeVisible()
		await expect(bubblePaddingOf(canvas.getByText(TABLE_INTRO))).not.toBe("0px")
		await expect(bubblePaddingOf(table)).toBe("0px")
	},
})

export const Error = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn
				state="failed"
				copyText="How is this workspace laid out?"
				onRetry={fn()}
			>
				How is this workspace laid out?
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the write to the CLI was rejected, so the prompt exists in the transcript but Claude never saw it. Both actions live left of the bubble, on the outer side as on every row, but they do not behave alike: the retry is pinned, since a way out nobody can see is not offered at all, while the copy stays behind a hover like every other. Check that the retry is there before the pointer is, that it sits nearest the bubble, and that the text is preserved verbatim for the resend. Pick `Variants` when Claude did answer and it was the turn that failed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(retry).toBeVisible()

		await userEvent.click(retry)
		await waitFor(() => expect(retry).toBeVisible())
	},
})

export const LongContent = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={PASTED}>{PASTED}</UserTurn>
			<AssistantTurn copyText={`${ANSWER}\n\n${ANSWER}`} avatar={<Avatar />}>
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

export const Pending = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={ANSWER}>{ANSWER}</UserTurn>
			<UserTurn state="queued" copyText={QUEUED} onCancel={cancelQueued}>
				{QUEUED}
			</UserTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The composer stays writable while a turn runs, so a prompt that cannot be sent yet waits here instead. A sent prompt tops the stack, then the `queued` one below it: one step back from the reader's own fill, a spinner beside it and its footer naming the wait. Check that the queued row offers no retry, that its cancel is pinned rather than waiting for a hover, and that only the spinner moves. Pick `Error` for a prompt that was sent and never landed.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		cancelQueued.mockClear()

		const cancel = canvas.getByRole("button", { name: "Cancel this prompt" })

		await expect(slotsIn(canvasElement, "turn-pending-spinner")).toHaveLength(1)
		await expect(cancel).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText("Waiting to be sent")).toBeVisible()

		await userEvent.click(cancel)
		await expect(cancelQueued).toHaveBeenCalledTimes(1)
	},
})

export const Reply = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} onReply={reply}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn copyText={ANSWER} avatar={<Avatar />} onReply={reply}>
				{ANSWER}
			</AssistantTurn>
			<AssistantTurn copyText={TESTS} avatar={<Avatar />}>
				{TESTS}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The affordance that starts a reply, on both sides of the transcript: a row given `onReply` reveals it beside copy on hover or on keyboard focus, and the last row here, given none, offers nothing at all — a screen that cannot answer a message must not draw the invitation. Check that pressing it reports the row it belongs to and changes nothing in the transcript: staging the reply is the screen's business, and `AI/PromptReply` is where it lands.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		reply.mockClear()

		const replies = canvas.getAllByRole("button", { name: "Reply" })

		await expect(replies).toHaveLength(2)

		await userEvent.click(replies[0])
		await expect(reply).toHaveBeenCalledTimes(1)
	},
})

export const Pinned = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} onReply={reply} onPin={pin}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn
				copyText={ANSWER}
				avatar={<Avatar />}
				onReply={reply}
				pinned
				onPin={pin}
			>
				{ANSWER}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The bookmark a reader drops on a row, beside the reply it sits next to. A row given `onPin` offers it on hover or on keyboard focus like the rest; a row already pinned keeps the control on screen without hover and names it `Unpin`, so the transcript shows at a glance what is bookmarked. Pressing it reports the row and changes nothing here — holding the list is the screen's business, and `AI/PinnedMessages` is where it reads.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		pin.mockClear()

		const unpin = canvas.getByRole("button", { name: "Unpin" })

		await expect(unpin).toBeVisible()
		await expect(unpin).not.toHaveClass(/opacity-0/)

		await userEvent.click(canvas.getByRole("button", { name: "Pin" }))
		await expect(pin).toHaveBeenCalledTimes(1)
	},
})

export const Menu = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<UserTurn copyText={QUESTION} onReply={reply} onPin={pin}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn
				copyText={ANSWER}
				avatar={<Avatar />}
				onReply={reply}
				pinned
				onPin={pin}
			>
				{ANSWER}
			</AssistantTurn>
			<AssistantTurn avatar={<Avatar />}>{TESTS}</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same actions the hover row offers, reached by right-clicking the bubble instead of hunting for a button: pin, then reply and copy behind a separator, each carrying the icon and the label its button carries — a pinned row says `Unpin` in both places. A row is handed only the actions it was given a handler for, and the last row here, given none at all, keeps the browser's own menu rather than drawing an empty one. Check that the menu grows out of the pointer, that choosing a row reports it and closes, and that right-clicking a second bubble hands the menu over rather than leaving two open.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		reply.mockClear()

		const menu = await openTurnMenu(canvas.getByText(QUESTION))
		const items = within(menu).getAllByRole("menuitem")

		await expect(items.map((item) => item.textContent)).toEqual([
			"Pin",
			"Reply",
			"Copy",
		])
		await expect(menu.querySelector("hr")).toBeInTheDocument()

		const pinned = await openTurnMenu(canvas.getByText(ANSWER))

		await expect(screen.getAllByRole("menu")).toHaveLength(1)
		await expect(
			within(pinned).getByRole("menuitem", { name: "Unpin" }),
		).toBeVisible()

		await userEvent.click(
			within(pinned).getByRole("menuitem", { name: "Reply" }),
		)
		await expect(reply).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		const { defaulted } = await rightClickOn(canvas.getByText(TESTS))

		await expect(defaulted).toBe(true)
		await expect(screen.queryByRole("menu")).toBeNull()
	},
})

export const Quoted = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<AssistantTurn copyText={ANSWER} avatar={<Avatar />}>
				{ANSWER}
			</AssistantTurn>
			<UserTurn copyText={QUESTION} repliedTo={QUOTED_BOT}>
				{QUESTION}
			</UserTurn>
			<AssistantTurn
				copyText={TESTS}
				avatar={<Avatar />}
				repliedTo={QUOTED_READER}
			>
				{TESTS}
			</AssistantTurn>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A message that answers another one is wrapped in a frame that carries the quote above the bubble, both on the same secondary fill. Check that the frame hugs the bubble on both sides of the transcript, that the excerpt stays on one line whatever it quotes, and that pressing it asks the screen to jump rather than moving anything here. Pick `AI/MessageScroller → Jump` for the other end of that request.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		jumpToQuoted.mockClear()

		const quotes = canvas.getAllByRole("button", { name: /Skippy|You/ })

		await expect(quotes).toHaveLength(2)

		await userEvent.click(quotes[0])
		await expect(jumpToQuoted).toHaveBeenCalledTimes(1)
	},
})

export const Authored = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A conversation held by several bots, where every row has to say who wrote it. Hand `AssistantTurn` an `author` and it names the bot above the bubble and draws that bot's avatar in the gutter — the row keeps the gutter it always had, so nothing is passed twice. The bot that leads wears a crown beside its name. In a run the name is written once, on the row that opens it, while the avatar stays on the row that closes it: the block reads as one bot speaking, not as the same name repeated. `<@bot-id>` in the text is drawn as a chip by `Markdown`, resolved against `ConversationBotsProvider`, and an id the conversation does not know still draws as an unknown bot rather than leaking the raw text. Check that Atlas is named once over its two rows, that the crown is on Atlas alone, and that a message from a conversation with a single bot — every other story here — is untouched by all of this.",
			},
		},
	},
	render: () => (
		<ConversationBotsProvider bots={ROOM}>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<UserTurn>Who is taking the migration?</UserTurn>
				<ChatTurnGroup>
					{LEAD_RUN.map((paragraph) => (
						<AssistantTurn key={paragraph} author={LEAD} copyText={paragraph}>
							<Markdown>{paragraph}</Markdown>
						</AssistantTurn>
					))}
				</ChatTurnGroup>
				<AssistantTurn author={SECOND} copyText={SECOND_REPLY}>
					<Markdown>{SECOND_REPLY}</Markdown>
				</AssistantTurn>
			</div>
		</ConversationBotsProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		const named = [
			...canvasElement.querySelectorAll('[data-slot="message-author"]'),
		].map((header) => header.textContent)

		await expect(named).toHaveLength(2)
		await expect(named[0]).toContain("Atlas")
		await expect(named[1]).toContain("Basile")
		await expect(
			canvasElement.querySelectorAll('[data-slot="message-author-lead"]'),
		).toHaveLength(1)
		await expect(canvas.getByText("Unknown bot")).toBeVisible()
	},
})

export const DeletedAuthor = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The bot that wrote this was deleted since. Its message is history and stays legible: the bubble is the ordinary one, only the name is dimmed and marked with a bin so a reader knows nobody is behind it any more. The mark is an icon in the line and *Deleted bot* under it — on hover, and to a screen reader — so the row keeps its length and still says what it means. Check that the icon reads as a state rather than an action nobody can take, and that the row copies and quotes like any other.",
			},
		},
	},
	render: () => (
		<ConversationBotsProvider bots={ROOM}>
			<div className="mx-auto flex max-w-2xl flex-col gap-6">
				<AssistantTurn author={GONE} copyText={GONE_REPLY}>
					{GONE_REPLY}
				</AssistantTurn>
			</div>
		</ConversationBotsProvider>
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="message-author-deleted"]'),
		).toHaveAttribute("title", "Deleted bot")
		await expect(canvas.getByText(GONE_REPLY)).toBeVisible()
	},
})
