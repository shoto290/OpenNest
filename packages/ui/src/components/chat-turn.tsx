"use client"

import {
	Children,
	cloneElement,
	Fragment,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { useChatMarkId } from "@workspace/ui/components/chat-mark-context"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageAuthor,
	MessageContent,
	MessageFooter,
} from "@workspace/ui/components/message"
import {
	MessageAction,
	MessageActions,
} from "@workspace/ui/components/message-actions"
import {
	MESSAGE_BUBBLE_INLINE_PADDING,
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import { useMessageAnchor } from "@workspace/ui/components/message-highlight-context"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@workspace/ui/components/motion/context-menu"
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
	messageId?: string
	children: ReactNode
	className?: string
}

interface UserTurnProps {
	children: ReactNode
	state?: UserTurnState
	run?: ChatTurnRun
	copyText?: string
	messageId?: string
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
	pinned?: boolean
	onRetry?: () => void
	onCancel?: () => void
	className?: string
}

interface AssistantTurnProps {
	children: ReactNode
	state?: ChatTurnState
	run?: ChatTurnRun
	copyText?: string
	messageId?: string
	repliedTo?: QuotedMessage
	onReply?: () => void
	onPin?: () => void
	pinned?: boolean
	bare?: boolean
	author?: MessageAuthor
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

const HIGHLIGHT =
	"rounded-xl transition-colors duration-200 data-[highlighted]:bg-accent/40 motion-reduce:transition-none"

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

const opensRun = (run: ChatTurnRun) => run === "single" || run === "first"

const closesRun = (run: ChatTurnRun) => run === "single" || run === "last"

function runPositionFor(index: number, length: number): ChatTurnRun {
	if (length === 1) return "single"
	if (index === 0) return "first"
	return index === length - 1 ? "last" : "middle"
}

interface TurnAction {
	key: "pin" | "reply" | "copy"
	label: string
	icon: Icon
	onSelect: () => void
	alwaysVisible?: boolean
}

interface TurnActionsInput {
	copyText?: string
	onReply?: () => void
	onPin?: () => void
	pinned: boolean
}

interface TurnActionListProps {
	actions: TurnAction[]
}

interface TurnBodyProps {
	repliedTo?: QuotedMessage
	className?: string
	children: ReactNode
}

function useTurnActions({
	copyText,
	onReply,
	onPin,
	pinned,
}: TurnActionsInput) {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(copyText ?? "")
	const actions: TurnAction[] = []

	if (onPin) {
		actions.push({
			key: "pin",
			label: t(pinned ? "turn.unpin" : "turn.pin"),
			icon: pinned ? Icons.Unpin : Icons.Pin,
			onSelect: onPin,
			alwaysVisible: pinned,
		})
	}

	if (onReply) {
		actions.push({
			key: "reply",
			label: t("turn.reply"),
			icon: Icons.Reply,
			onSelect: onReply,
		})
	}

	if (copyText) {
		actions.push({
			key: "copy",
			label: copied ? t("turn.copied") : t("turn.copy"),
			icon: copied ? Icons.Check : Icons.Copy,
			onSelect: () => {
				void copy()
			},
		})
	}

	return actions
}

function TurnActionButtons({ actions }: TurnActionListProps) {
	return (
		<>
			{actions.map(
				({ key, label, icon: ActionIcon, onSelect, alwaysVisible }) => (
					<MessageAction
						key={key}
						label={label}
						onClick={onSelect}
						alwaysVisible={alwaysVisible}
					>
						<ActionIcon />
					</MessageAction>
				),
			)}
		</>
	)
}

function TurnActionMenu({ actions }: TurnActionListProps) {
	return (
		<>
			{actions.map(({ key, label, icon: ActionIcon, onSelect }, index) => (
				<Fragment key={key}>
					{actions[index - 1]?.key === "pin" ? <ContextMenuSeparator /> : null}
					<ContextMenuItem onSelect={onSelect} textValue={label}>
						<ActionIcon aria-hidden="true" className="size-3.5" />
						{label}
					</ContextMenuItem>
				</Fragment>
			))}
		</>
	)
}

function turnMenuOf(actions: TurnAction[]) {
	return actions.length > 0 ? <TurnActionMenu actions={actions} /> : undefined
}

function TurnBody({ repliedTo, className, children }: TurnBodyProps) {
	const body = (
		<MessageBubbleContent className={cn("whitespace-pre-wrap", className)}>
			{children}
		</MessageBubbleContent>
	)

	return repliedTo ? <MessageQuote {...repliedTo}>{body}</MessageQuote> : body
}

function ChatTurnGroup({
	carriesMark = false,
	messageId,
	children,
	className,
}: ChatTurnGroupProps) {
	const turns = Children.toArray(children).filter(isValidElement)
	const anchor = useMessageAnchor(messageId)

	return (
		<MessageBubbleGroup
			data-slot="chat-turn-group"
			{...anchor}
			className={cn("gap-1", messageId && HIGHLIGHT, className)}
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
	messageId,
	repliedTo,
	onReply,
	onPin,
	pinned = false,
	onRetry,
	onCancel,
	className,
}: UserTurnProps) {
	const { t } = useTranslation("chat")
	const queued = state === "queued"
	const footerKey = queued ? TURN_FOOTER_KEY.queued : undefined
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })

	return (
		<Message
			from="user"
			{...anchor}
			className={cn(messageId && HIGHLIGHT, className)}
		>
			<MessageContent>
				<MessageBubble variant={queued ? "tint" : "solid"}>
					<MessageActions
						actions={
							<>
								{queued ? <PendingSpinner /> : null}
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
								<TurnActionButtons actions={actions} />
							</>
						}
						menu={turnMenuOf(actions)}
					>
						<TurnBody repliedTo={repliedTo} className={RUN_RADIUS.user[run]}>
							{children}
						</TurnBody>
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
	messageId,
	repliedTo,
	onReply,
	onPin,
	pinned = false,
	bare = false,
	author,
	avatar,
	carriesMark = false,
	className,
}: AssistantTurnProps) {
	const { t } = useTranslation("chat")
	const transcriptMarkId = useChatMarkId()
	const markId = carriesMark ? transcriptMarkId : undefined
	const footerKey = TURN_FOOTER_KEY[state]
	const footer = footerKey ? t(footerKey) : undefined
	const anchor = useMessageAnchor(messageId)
	const actions = useTurnActions({ copyText, onReply, onPin, pinned })
	const mark =
		avatar ??
		(author && closesRun(run) ? (
			<BotIdentityAvatar
				animal={author.animal}
				blot={author.blot}
				image={author.image}
				name={author.name}
				seed={author.id}
				size={CHAT_AVATAR_SIZE}
			/>
		) : null)

	return (
		<Message
			from="assistant"
			{...anchor}
			className={cn(messageId && HIGHLIGHT, className)}
		>
			<MessageContent
				className="grid gap-x-2 gap-y-0"
				style={{ gridTemplateColumns: `${CHAT_AVATAR_SIZE}px 1fr` }}
			>
				{author && opensRun(run) ? (
					<MessageAuthor
						author={author}
						className={cn(
							"col-start-2 row-start-1 pb-1",
							bare ? undefined : MESSAGE_BUBBLE_INLINE_PADDING,
						)}
					/>
				) : null}
				<span
					data-slot="message-gutter"
					aria-hidden="true"
					className="col-start-1 row-start-2 self-end"
				>
					{mark ? <SharedMark markId={markId}>{mark}</SharedMark> : null}
				</span>
				<MessageBubble
					variant={bare ? "bare" : "soft"}
					className="col-start-2 row-start-2 min-w-0"
				>
					<MessageActions
						actions={<TurnActionButtons actions={actions} />}
						menu={turnMenuOf(actions)}
					>
						<TurnBody
							repliedTo={repliedTo}
							className={bare ? undefined : RUN_RADIUS.assistant[run]}
						>
							{children}
						</TurnBody>
					</MessageActions>
				</MessageBubble>
				{footer ? (
					<MessageFooter className="col-start-2 row-start-3 pt-1.5">
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
