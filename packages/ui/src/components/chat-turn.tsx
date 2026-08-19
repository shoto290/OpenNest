"use client"

import {
	Children,
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useState,
} from "react"

import { useChatMarkId } from "@workspace/ui/components/chat-mark-context"
import { Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageContent,
	MessageFooter,
} from "@workspace/ui/components/message"
import {
	MessageAction,
	MessageActions,
} from "@workspace/ui/components/message-actions"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
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

/** What `ChatTurnGroup` hands down: facts a row cannot know about itself. */
type InjectedTurnProps = { run?: ChatTurnRun; carriesMark?: boolean }

interface ChatTurnGroupProps {
	/** Lets this group's closing row claim the transcript's travelling mark.
	 * Only the newest group in a transcript may. */
	carriesMark?: boolean
	children: ReactNode
	className?: string
}

interface UserTurnProps {
	children: ReactNode
	state?: ChatTurnState
	/** Set by the surrounding `ChatTurnGroup`; only override it to render a row
	 * out of its group. */
	run?: ChatTurnRun
	/** This bubble's own text, behind its copy action. Leave it out — or hand it
	 * an empty string — and the bubble offers nothing to copy. */
	copyText?: string
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
	/** This bubble's own paragraph, behind its copy action. Every bubble of a run
	 * carries its own, so a copy takes the part the reader pointed at rather than
	 * the whole answer. Leave it out — or hand it an empty string, as a turn that
	 * stopped before writing does — and the bubble offers nothing to copy. */
	copyText?: string
	/** Drops the bubble behind this row, for content that already draws its own
	 * frame — a table. The row keeps its place in the run, its gutter and its
	 * actions; only the fill and the padding go, so a grid is not boxed twice. */
	bare?: boolean
	/** The bot's mark, in the left gutter. Pass it on the row that closes a run
	 * so one avatar stands for every message the bot sent in a row. */
	avatar?: ReactNode
	/** Lets this row's avatar claim the transcript's travelling mark. A
	 * transcript names one mark, and two rows answering to it at once are
	 * projected onto each other and jump — so only the newest run may, and
	 * every older avatar stays plain, exactly where it was drawn. Set by the
	 * surrounding `ChatTurnGroup`; only override it to render a row out of its
	 * group. */
	carriesMark?: boolean
	className?: string
}

const TURN_FOOTER: Partial<Record<ChatTurnState, string>> = {
	cancelled: "Stopped",
	failed: "This response failed",
}

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
		<MessageAction
			label={copied ? "Copied" : "Copy"}
			onClick={() => {
				void copy()
			}}
		>
			{copied ? <Icons.Check /> : <Icons.Copy />}
		</MessageAction>
	)
}

/** Holds one run of messages from the same speaker tight enough to read as a
 * block, while the transcript keeps its own spacing between speakers. It tells
 * each turn where it sits, so no caller counts rows itself. */
function ChatTurnGroup({
	carriesMark = false,
	children,
	className,
}: ChatTurnGroupProps) {
	const turns = Children.toArray(children).filter(isValidElement)

	return (
		<MessageBubbleGroup
			data-slot="chat-turn-group"
			className={cn("gap-1", className)}
		>
			{turns.map((turn, index) => {
				const row = turn as ReactElement<InjectedTurnProps>
				const closes = index === turns.length - 1
				return cloneElement(row, {
					run: row.props.run ?? runPositionFor(index, turns.length),
					carriesMark: row.props.carriesMark ?? (carriesMark && closes),
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
	copyText,
	onRetry,
	className,
}: UserTurnProps) {
	return (
		<Message from="user" animateIn className={className}>
			<MessageContent>
				<MessageBubble variant="solid">
					<MessageActions
						actions={
							<>
								{copyText ? <CopyAction text={copyText} /> : null}
								{state === "failed" && onRetry ? (
									// Pinned: a prompt that never landed has to show its way out
									// without waiting to be pointed at.
									<MessageAction alwaysVisible label="Retry" onClick={onRetry}>
										<Icons.Retry />
									</MessageAction>
								) : null}
							</>
						}
					>
						<MessageBubbleContent
							className={cn("whitespace-pre-wrap", RUN_RADIUS.user[run])}
						>
							{children}
						</MessageBubbleContent>
					</MessageActions>
				</MessageBubble>
			</MessageContent>
		</Message>
	)
}

function AssistantTurn({
	children,
	state = "complete",
	run = "single",
	copyText,
	bare = false,
	avatar,
	carriesMark = false,
	className,
}: AssistantTurnProps) {
	const transcriptMarkId = useChatMarkId()
	const markId = carriesMark ? transcriptMarkId : undefined
	const footer = TURN_FOOTER[state]
	// This row mounts in the commit that hands it the mark, and its own entrance
	// fades from nothing — which would blank the mark mid-flight. The bubble
	// carries the entrance instead, leaving the gutter alone. Frozen at mount:
	// an entrance replays if it is handed back later, and a row that gives the
	// mark up to the working row must not pop under the mark as it leaves.
	const [receivesMark] = useState(Boolean(avatar && markId))

	return (
		<Message from="assistant" animateIn={!receivesMark} className={className}>
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
					{avatar ? <SharedMark markId={markId}>{avatar}</SharedMark> : null}
				</span>
				<MessageBubble
					variant={bare ? "bare" : "soft"}
					animateIn={receivesMark}
					className="col-start-2 row-start-1 min-w-0"
				>
					<MessageActions
						actions={copyText ? <CopyAction text={copyText} /> : null}
					>
						<MessageBubbleContent
							className={cn(
								"whitespace-pre-wrap",
								!bare && RUN_RADIUS.assistant[run],
							)}
						>
							{children}
						</MessageBubbleContent>
					</MessageActions>
				</MessageBubble>
				{footer ? (
					<MessageFooter className="col-start-2 row-start-2">
						{footer}
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
