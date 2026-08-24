"use client"

import {
	Children,
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

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

const CHAT_AVATAR_SIZE = 40

type ChatTurnState = "streaming" | "complete" | "cancelled" | "failed"

type UserTurnState = ChatTurnState | "queued"

type ChatTurnRun = "single" | "first" | "middle" | "last"

type InjectedTurnProps = { run?: ChatTurnRun; carriesMark?: boolean }

interface ChatTurnGroupProps {
	carriesMark?: boolean
	children: ReactNode
	className?: string
}

interface UserTurnProps {
	children: ReactNode
	state?: UserTurnState
	run?: ChatTurnRun
	copyText?: string
	onRetry?: () => void
	onCancel?: () => void
	className?: string
}

interface AssistantTurnProps {
	children: ReactNode
	state?: ChatTurnState
	run?: ChatTurnRun
	copyText?: string
	bare?: boolean
	avatar?: ReactNode
	carriesMark?: boolean
	className?: string
}

const TURN_FOOTER_KEY: Partial<
	Record<UserTurnState, `turn.footer.${"cancelled" | "failed" | "queued"}`>
> = {
	cancelled: "turn.footer.cancelled",
	failed: "turn.footer.failed",
	queued: "turn.footer.queued",
}

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
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(text)

	return (
		<MessageAction
			label={copied ? t("turn.copied") : t("turn.copy")}
			onClick={() => {
				void copy()
			}}
		>
			{copied ? <Icons.Check /> : <Icons.Copy />}
		</MessageAction>
	)
}

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

function PendingSpinner() {
	return (
		<Icons.Loading
			aria-hidden="true"
			data-slot="turn-pending-spinner"
			className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
		/>
	)
}

function UserTurn({
	children,
	state = "complete",
	run = "single",
	copyText,
	onRetry,
	onCancel,
	className,
}: UserTurnProps) {
	const { t } = useTranslation("chat")
	const queued = state === "queued"
	const footerKey = queued ? TURN_FOOTER_KEY.queued : undefined

	return (
		<Message from="user" animateIn className={className}>
			<MessageContent>
				<MessageBubble variant={queued ? "tint" : "solid"}>
					<MessageActions
						actions={
							<>
								{queued ? <PendingSpinner /> : null}
								{copyText ? <CopyAction text={copyText} /> : null}
								{queued && onCancel ? (
									<MessageAction
										alwaysVisible
										label={t("turn.cancel")}
										onClick={onCancel}
									>
										<Icons.Close />
									</MessageAction>
								) : null}
								{state === "failed" && onRetry ? (
									<MessageAction
										alwaysVisible
										label={t("turn.retry")}
										onClick={onRetry}
									>
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
				{footerKey ? <MessageFooter>{t(footerKey)}</MessageFooter> : null}
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
	const { t } = useTranslation("chat")
	const transcriptMarkId = useChatMarkId()
	const markId = carriesMark ? transcriptMarkId : undefined
	const footerKey = TURN_FOOTER_KEY[state]
	const footer = footerKey ? t(footerKey) : undefined
	const [receivesMark] = useState(Boolean(avatar && markId))

	return (
		<Message from="assistant" animateIn={!receivesMark} className={className}>
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
	type UserTurnState,
}
