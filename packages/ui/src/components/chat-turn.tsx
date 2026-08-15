"use client"

import {
	Children,
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageContent,
	MessageFooter,
} from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

/** Side of the transcript the bot's mark occupies. Whatever fills the gutter —
 * a resting avatar here, the working one under the last row — is this wide, so
 * every bot mark on the screen lines up. */
const CHAT_AVATAR_SIZE = 40

/** How the turn ended, mirroring the transport's message completion. */
type ChatTurnState = "streaming" | "complete" | "cancelled" | "failed"

/** Where the row sits in a run of messages from the same speaker. */
type ChatTurnRun = "single" | "first" | "middle" | "last"

interface ChatTurnGroupProps {
	children: ReactNode
	className?: string
}

interface UserTurnProps {
	children: ReactNode
	state?: ChatTurnState
	/** Set by the surrounding `ChatTurnGroup`; only override it to render a row
	 * out of its group. */
	run?: ChatTurnRun
	/** Offered only on a `failed` turn, whose prompt never reached Claude. */
	onRetry?: () => void
	className?: string
}

interface AssistantTurnProps {
	children: ReactNode
	state?: ChatTurnState
	/** Set by the surrounding `ChatTurnGroup`; only override it to render a row
	 * out of its group. */
	run?: ChatTurnRun
	/** Plain text behind the copy action, so it copies the whole answer rather
	 * than the one paragraph this row carries. */
	copyText?: string
	/** The bot's mark, in the left gutter. Pass it on the row that closes a run
	 * so one avatar stands for every message the bot sent in a row. */
	avatar?: ReactNode
	className?: string
}

const TURN_FOOTER = {
	cancelled: "Stopped",
	failed: "This response failed",
} satisfies Partial<Record<ChatTurnState, string>>

/** Corners facing a neighbour in the same run tighten, so a run reads as one
 * column of speech rather than four unrelated bubbles. */
const RUN_RADIUS = {
	user: {
		single: "",
		first: "rounded-br-md",
		middle: "rounded-tr-md rounded-br-md",
		last: "rounded-tr-md",
	},
	assistant: {
		single: "",
		first: "rounded-bl-md",
		middle: "rounded-tl-md rounded-bl-md",
		last: "rounded-tl-md",
	},
} satisfies Record<"user" | "assistant", Record<ChatTurnRun, string>>

function runPositionFor(index: number, length: number): ChatTurnRun {
	if (length === 1) return "single"
	if (index === 0) return "first"
	return index === length - 1 ? "last" : "middle"
}

function CopyAction({ text }: { text: string }) {
	const { copied, copy } = useCopyText(text)

	return (
		<Button
			size="xs"
			variant="ghost"
			onClick={() => {
				void copy()
			}}
		>
			{copied ? (
				<Icons.Check data-icon="inline-start" />
			) : (
				<Icons.Copy data-icon="inline-start" />
			)}
			{copied ? "Copied" : "Copy"}
		</Button>
	)
}

/** Holds one run of messages from the same speaker tight enough to read as a
 * block, while the transcript keeps its own spacing between speakers. It tells
 * each turn where it sits, so no caller counts rows itself. */
function ChatTurnGroup({ children, className }: ChatTurnGroupProps) {
	const turns = Children.toArray(children).filter(isValidElement)

	return (
		<MessageBubbleGroup
			data-slot="chat-turn-group"
			className={cn("gap-1", className)}
		>
			{turns.map((turn, index) => {
				const row = turn as ReactElement<{ run?: ChatTurnRun }>
				return cloneElement(row, {
					run: row.props.run ?? runPositionFor(index, turns.length),
				})
			})}
		</MessageBubbleGroup>
	)
}

/** The reader's own side. It carries no avatar: only the bots are named here. */
function UserTurn({
	children,
	state = "complete",
	run = "single",
	onRetry,
	className,
}: UserTurnProps) {
	return (
		<Message from="user" animateIn className={className}>
			<MessageContent>
				<MessageBubble variant="solid">
					<MessageBubbleContent
						className={cn("whitespace-pre-wrap", RUN_RADIUS.user[run])}
					>
						{children}
					</MessageBubbleContent>
				</MessageBubble>
				{state === "failed" && onRetry ? (
					<MessageFooter>
						<Button size="xs" variant="ghost" onClick={onRetry}>
							<Icons.Retry data-icon="inline-start" />
							Retry
						</Button>
					</MessageFooter>
				) : null}
			</MessageContent>
		</Message>
	)
}

function AssistantTurn({
	children,
	state = "complete",
	run = "single",
	copyText,
	avatar,
	className,
}: AssistantTurnProps) {
	const footer = state === "cancelled" || state === "failed"

	return (
		<Message from="assistant" animateIn className={className}>
			{/* The gutter is a grid column so the avatar settles against the bubble
			 * it belongs to rather than under the footer below it. */}
			<MessageContent
				className="grid gap-x-2"
				style={{ gridTemplateColumns: `${CHAT_AVATAR_SIZE}px 1fr` }}
			>
				<span
					data-slot="message-gutter"
					aria-hidden="true"
					className="col-start-1 row-start-1 self-end"
				>
					{avatar}
				</span>
				<MessageBubble className="col-start-2 row-start-1">
					<MessageBubbleContent
						className={cn("whitespace-pre-wrap", RUN_RADIUS.assistant[run])}
					>
						{children}
					</MessageBubbleContent>
				</MessageBubble>
				{footer || copyText ? (
					<MessageFooter className="col-start-2 row-start-2">
						{footer ? TURN_FOOTER[state] : null}
						{copyText && state !== "failed" ? (
							<CopyAction text={copyText} />
						) : null}
					</MessageFooter>
				) : null}
			</MessageContent>
		</Message>
	)
}

export {
	AssistantTurn,
	type AssistantTurnProps,
	CHAT_AVATAR_SIZE,
	ChatTurnGroup,
	type ChatTurnGroupProps,
	type ChatTurnRun,
	type ChatTurnState,
	UserTurn,
	type UserTurnProps,
}
