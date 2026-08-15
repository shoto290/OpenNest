import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageContent,
	MessageFooter,
	MessageTyping,
} from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	StreamingResponse,
	type StreamingResponseStatus,
} from "@workspace/ui/components/streaming-response"

/** How the turn ended, mirroring the transport's message completion. */
type ChatTurnState = "streaming" | "complete" | "cancelled" | "failed"

interface UserTurnProps {
	children: ReactNode
	state?: ChatTurnState
	/** Offered only on a `failed` turn, whose prompt never reached Claude. */
	onRetry?: () => void
	className?: string
}

interface AssistantTurnProps {
	children: ReactNode
	state?: ChatTurnState
	/** Plain text behind the copy action. */
	copyText?: string
	className?: string
}

const RESPONSE_STATUS = {
	streaming: "streaming",
	complete: "complete",
	cancelled: "complete",
	failed: "error",
} satisfies Record<ChatTurnState, StreamingResponseStatus>

const TURN_FOOTER = {
	cancelled: "Stopped",
	failed: "This response failed",
} satisfies Partial<Record<ChatTurnState, string>>

function UserTurn({
	children,
	state = "complete",
	onRetry,
	className,
}: UserTurnProps) {
	return (
		<Message from="user" animateIn className={className}>
			<MessageContent>
				<MessageBubble>
					<MessageBubbleContent className="whitespace-pre-wrap">
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
	copyText,
	className,
}: AssistantTurnProps) {
	const footer = state === "cancelled" || state === "failed"

	return (
		<Message from="assistant" className={className}>
			<MessageContent>
				<StreamingResponse
					status={RESPONSE_STATUS[state]}
					announce={false}
					copyText={copyText}
					contentClassName="whitespace-pre-wrap"
				>
					{children || (state === "streaming" ? <MessageTyping /> : null)}
				</StreamingResponse>
				{footer ? <MessageFooter>{TURN_FOOTER[state]}</MessageFooter> : null}
			</MessageContent>
		</Message>
	)
}

export {
	AssistantTurn,
	type AssistantTurnProps,
	type ChatTurnState,
	UserTurn,
	type UserTurnProps,
}
