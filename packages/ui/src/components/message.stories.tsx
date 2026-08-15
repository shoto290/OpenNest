import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageFooter,
	type MessageFrom,
	MessageGroup,
	MessageHeader,
	MessageMarker,
	MessageTyping,
} from "@workspace/ui/components/message"

const MESSAGE_FROM = listExhaustively<MessageFrom>({
	assistant: true,
	user: true,
})

const AUTHORS: Record<MessageFrom, string> = {
	assistant: "OpenNest",
	user: "Ada Martin",
}

const INITIALS: Record<MessageFrom, string> = {
	assistant: "ON",
	user: "AM",
}

const SHORT_MESSAGES: Record<MessageFrom, string> = {
	assistant: "Synced. Your three devices are up to date, the queue is empty.",
	user: "Can you sync the Da Lat nest before the standup?",
}

const SENT_AT = new Date("2026-03-04T09:30:00Z")

const SENT_AT_LABEL = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "UTC",
}).format(SENT_AT)

const LONG_REPLY = [
	"The sync finished, but two devices needed a full pass instead of the usual delta: the Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself.",
	"Nothing was lost. I replayed the eleven pending edits in their original order, kept the newest version of every note that existed on both sides, and left a copy of the two conflicting notes under Archive so you can compare them before the standup.",
]

const Transcript = ({ children }: { children: ReactNode }) => (
	<div className="mx-auto w-full max-w-xl">{children}</div>
)

const meta = preview.meta({
	title: "AI/Message",
	component: Message,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One row of a conversation: the assistant reads from the start edge, the user from the end edge, with slots for an avatar, metadata above the text and a status line under it. Reach for it whenever a transcript needs a speaker, never to lay out a single standalone block of copy.",
			},
		},
	},
	args: {
		from: "assistant",
		children: SHORT_MESSAGES.assistant,
	},
	argTypes: {
		from: { control: "inline-radio", options: MESSAGE_FROM },
		animateIn: { control: "boolean" },
		children: { control: "text" },
	},
	render: ({ children, ...args }) => (
		<Transcript>
			<Message {...args}>
				<MessageAvatar>{INITIALS[args.from]}</MessageAvatar>
				<MessageContent>
					<MessageHeader>{AUTHORS[args.from]}</MessageHeader>
					<p className="max-w-md">{children}</p>
				</MessageContent>
			</Message>
		</Transcript>
	),
})

export const Playground = meta.story({
	args: { from: "assistant", children: SHORT_MESSAGES.assistant },
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The only visual axis of the component: `from`. Check that the assistant row hugs the start edge and the user row mirrors to the end edge — avatar, metadata and text all flip together, so a transcript stays readable without any per-message alignment prop.",
			},
		},
	},
	render: () => (
		<Transcript>
			<MessageGroup spacing="default">
				{MESSAGE_FROM.map((from) => (
					<Message key={from} from={from}>
						<MessageAvatar>{INITIALS[from]}</MessageAvatar>
						<MessageContent>
							<MessageHeader>{AUTHORS[from]}</MessageHeader>
							<p className="max-w-md">{SHORT_MESSAGES[from]}</p>
						</MessageContent>
					</Message>
				))}
			</MessageGroup>
		</Transcript>
	),
	play: async ({ canvas }) => {
		const rows = canvas.getAllByRole("article")

		await expect(rows).toHaveLength(MESSAGE_FROM.length)
		await expect(rows[0]).toHaveAccessibleName("assistant message")
		await expect(rows[1]).toHaveAccessibleName("user message")
	},
})

export const WithMetadata = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Author and time above the text, delivery status under it. Pick this one when a row must carry provenance — check that the metadata stays on the same edge as its message and never pushes the text out of its column.",
			},
		},
	},
	render: () => (
		<Transcript>
			<MessageGroup spacing="default">
				<Message from="user">
					<MessageAvatar>{INITIALS.user}</MessageAvatar>
					<MessageContent>
						<MessageHeader>
							<span>{AUTHORS.user}</span>
							<time dateTime={SENT_AT.toISOString()}>{SENT_AT_LABEL}</time>
						</MessageHeader>
						<p className="max-w-md">{SHORT_MESSAGES.user}</p>
						<MessageFooter>Sent</MessageFooter>
					</MessageContent>
				</Message>
				<Message from="assistant">
					<MessageAvatar>{INITIALS.assistant}</MessageAvatar>
					<MessageContent>
						<MessageHeader>
							<span>{AUTHORS.assistant}</span>
							<time dateTime={SENT_AT.toISOString()}>{SENT_AT_LABEL}</time>
						</MessageHeader>
						<p className="max-w-md">{SHORT_MESSAGES.assistant}</p>
						<MessageFooter>Local model</MessageFooter>
					</MessageContent>
				</Message>
			</MessageGroup>
		</Transcript>
	),
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A multi-paragraph answer with an inline link, next to the one-line question that triggered it. Check that the long row wraps inside its own column instead of stretching the transcript, and that the link is the first tab stop — `Variants` covers short copy where wrapping never happens.",
			},
		},
	},
	render: () => (
		<Transcript>
			<MessageGroup spacing="default">
				<Message from="user">
					<MessageAvatar>{INITIALS.user}</MessageAvatar>
					<MessageContent>
						<MessageHeader>{AUTHORS.user}</MessageHeader>
						<p className="max-w-md">{SHORT_MESSAGES.user}</p>
					</MessageContent>
				</Message>
				<Message from="assistant">
					<MessageAvatar>{INITIALS.assistant}</MessageAvatar>
					<MessageContent>
						<MessageHeader>{AUTHORS.assistant}</MessageHeader>
						{LONG_REPLY.map((paragraph) => (
							<p key={paragraph.slice(0, 16)} className="max-w-md">
								{paragraph}
							</p>
						))}
						<MessageFooter>
							<a
								href="#message-sync-log"
								className="underline underline-offset-4"
							>
								Open the sync log
							</a>
						</MessageFooter>
					</MessageContent>
				</Message>
			</MessageGroup>
		</Transcript>
	),
	play: async ({ canvas, userEvent }) => {
		const link = canvas.getByRole("link", { name: "Open the sync log" })

		await userEvent.tab()
		await expect(link).toHaveFocus()
	},
})

export const Loading = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The row is already mounted, the answer is not written yet. Check that the placeholder occupies the same column as real copy so nothing jumps when the text arrives, and that screen readers hear the `Responding` label instead of three silent dots.",
			},
		},
	},
	render: () => (
		<Transcript>
			<Message from="assistant">
				<MessageAvatar>{INITIALS.assistant}</MessageAvatar>
				<MessageContent>
					<MessageHeader>{AUTHORS.assistant}</MessageHeader>
					<MessageTyping />
				</MessageContent>
			</Message>
		</Transcript>
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Responding")).toBeInTheDocument()
	},
})

export const InConversation = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A full exchange: a day marker, consecutive assistant rows sharing one avatar slot, and a pending answer at the live edge. Check that the placeholder avatar keeps the grouped rows aligned, and that the whole transcript is exposed as a single named log rather than a pile of unrelated articles.",
			},
		},
	},
	render: () => (
		<Transcript>
			<MessageGroup label="Da Lat sync">
				<MessageMarker>{SENT_AT_LABEL}</MessageMarker>
				<Message from="user">
					<MessageAvatar>{INITIALS.user}</MessageAvatar>
					<MessageContent>
						<p className="max-w-md">{SHORT_MESSAGES.user}</p>
					</MessageContent>
				</Message>
				<Message from="assistant">
					<MessageAvatar>{INITIALS.assistant}</MessageAvatar>
					<MessageContent>
						<p className="max-w-md">{SHORT_MESSAGES.assistant}</p>
					</MessageContent>
				</Message>
				<Message from="assistant">
					<MessageAvatar placeholder />
					<MessageContent>
						<p className="max-w-md">One note needs your arbitration.</p>
					</MessageContent>
				</Message>
				<Message from="assistant">
					<MessageAvatar placeholder />
					<MessageContent>
						<MessageTyping />
					</MessageContent>
				</Message>
			</MessageGroup>
		</Transcript>
	),
	play: async ({ canvas }) => {
		const log = canvas.getByRole("log", { name: "Da Lat sync" })

		await expect(log).toBeInTheDocument()
		await expect(canvas.getAllByRole("article")).toHaveLength(4)
	},
})
