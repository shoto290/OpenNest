import { memo } from "react"

import {
	AssistantTurn,
	CHAT_AVATAR_SIZE,
	ChatTurnGroup,
	type ChatTurnRun,
	type ChatTurnState,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"

import { FaceAvatar } from "@/components/face-avatar"
import { TurnBody } from "@/components/turn-body"
import type { ChatController } from "@/lib/chat/chat-controller"
import type { OutboxEntry } from "@/lib/chat/chat-state"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import type { ReplyTarget, TranscriptRow } from "@/lib/chat/screen-model"
import type { ThreadFace } from "@/lib/chat/thread-contract"
import type { RefusedMessage } from "@/lib/conversations/conversation-controller"

type ThreadTurnProps = {
	row: TranscriptRow
	anchor: string
	state: ChatTurnState
	run?: ChatTurnRun
	bare?: boolean
	botId?: string
	author?: MessageAuthor
	avatarFace?: ThreadFace
	quoted?: ReplyTarget
	pinned: boolean
	toQuote: (target: ReplyTarget) => QuotedMessage
	onPin: (messageId: string, blockIndex: number) => void
	onReply: (target: ReplyTarget) => void
	onRetry?: (messageId: string) => void
}

export const ThreadTurn = memo(function ThreadTurn({
	row,
	anchor,
	state,
	run,
	bare,
	botId,
	author,
	avatarFace,
	quoted,
	pinned,
	toQuote,
	onPin,
	onReply,
	onRetry,
}: ThreadTurnProps) {
	const { text, attachments } = messageWithAttachments(row.text)
	const content = <TurnBody attachments={attachments} text={text} />
	const repliedTo = quoted ? toQuote(quoted) : undefined
	const pin = () => {
		onPin(row.messageId, row.blockIndex)
	}
	const reply = () => {
		onReply({
			messageId: row.messageId,
			role: row.role,
			excerpt: text.trim(),
			authorBotId: row.authorBotId,
		})
	}

	if (row.role === "user") {
		return (
			<UserTurn
				copyText={text}
				messageId={anchor}
				onPin={pin}
				onReply={reply}
				onRetry={onRetry ? () => onRetry(row.messageId) : undefined}
				pinned={pinned}
				repliedTo={repliedTo}
				run={run}
				state={state}
			>
				{content}
			</UserTurn>
		)
	}

	return (
		<AssistantTurn
			author={author}
			avatar={
				avatarFace ? (
					<FaceAvatar face={avatarFace} size={CHAT_AVATAR_SIZE} />
				) : undefined
			}
			bare={bare}
			botId={botId}
			copyText={text}
			messageId={anchor}
			onPin={pin}
			onReply={reply}
			pinned={pinned}
			repliedTo={repliedTo}
			run={run}
			state={state}
		>
			{content}
		</AssistantTurn>
	)
})

type QueuedTurnProps = {
	entry: OutboxEntry
	controller: ChatController
	run?: ChatTurnRun
}

export const QueuedTurn = memo(function QueuedTurn({
	entry,
	controller,
	run,
}: QueuedTurnProps) {
	const { text, attachments } = messageWithAttachments(entry.text)

	return (
		<UserTurn
			copyText={text}
			onCancel={() => {
				controller.discard(entry.id)
			}}
			run={run}
			state="queued"
		>
			<TurnBody attachments={attachments} text={text} />
		</UserTurn>
	)
})

type RefusedTurnProps = {
	message: RefusedMessage
	repliedTo?: QuotedMessage
	onSendAgain: (messageId: string) => void
}

export const RefusedTurn = ({
	message,
	repliedTo,
	onSendAgain,
}: RefusedTurnProps) => (
	<ChatTurnGroup>
		<UserTurn
			copyText={message.text}
			onRetry={() => onSendAgain(message.id)}
			repliedTo={repliedTo}
			state="failed"
		>
			<TurnBody {...messageWithAttachments(message.text)} />
		</UserTurn>
	</ChatTurnGroup>
)
