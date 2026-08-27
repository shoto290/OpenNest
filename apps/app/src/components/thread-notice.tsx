import type { ReactNode } from "react"

import { ChatNotice } from "@workspace/ui/components/chat-notice"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { describeTransportError } from "@/lib/agent/messages"
import { describeAttachmentError } from "@/lib/chat/attachments"
import type { AttachmentStoreError } from "@/lib/chat/attachments-contract"
import type { ChatError } from "@/lib/chat/chat-state"
import { needsFreshSession, noticeTitleFor } from "@/lib/chat/screen-model"

type ThreadNoticeProps = {
	refusal: AttachmentStoreError | null
	onDismissRefusal: () => void
	children?: ReactNode
}

export const ThreadNotice = ({
	refusal,
	onDismissRefusal,
	children,
}: ThreadNoticeProps) => {
	const t = useChatCopy()

	if (!refusal) {
		return <>{children}</>
	}

	return (
		<ChatNotice
			description={describeAttachmentError(t, refusal)}
			onDismiss={onDismissRefusal}
			title={t("screen.attachmentsRefused")}
			tone="warning"
		/>
	)
}

type TransportNoticeProps = {
	error: ChatError
	onDismiss: (id: string) => void
	onRestart: (id: string) => void
}

export const TransportNotice = ({
	error,
	onDismiss,
	onRestart,
}: TransportNoticeProps) => {
	const t = useChatCopy()
	const stale = needsFreshSession(error.error)

	return (
		<ChatNotice
			description={describeTransportError(t, error.error)}
			onDismiss={() => onDismiss(error.id)}
			retry={
				stale
					? { label: t("screen.restart"), onRetry: () => onRestart(error.id) }
					: undefined
			}
			title={noticeTitleFor(t, error.error)}
			tone={stale ? "error" : "warning"}
		/>
	)
}

type HandoverNoticeProps = {
	pair: [ConversationBot, ConversationBot]
	onStop: () => void
}

export const HandoverNotice = ({ pair, onStop }: HandoverNoticeProps) => {
	const t = useChatCopy()
	const named = { first: pair[0].name, second: pair[1].name }

	return (
		<ChatNotice
			action={{ label: t("screen.handover.stop"), onClick: onStop }}
			description={t("screen.handover.description")}
			title={t("screen.handover.title", named)}
			tone="warning"
		/>
	)
}
