import { AppHeader } from "@workspace/ui/components/app-header"
import { Notice } from "@workspace/ui/components/notice"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { ThreadScreen } from "@/components/thread-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { hasOverlayWindowControls } from "@/lib/host"

type WorkspaceBodyProps = {
	haveSpacesFailed: boolean
	onRetrySpaces: () => void
	bot?: Bot
	bots: Bot[]
	conversation?: Conversation
	conversationRuntimes: ConversationRuntimes
	chat: Chat
	attachments: AttachmentsController
	drafts: DraftsController
	readerName: string
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
	isConversationSettingsOpen: boolean
	onOpenConversationSettings: (conversationId: string) => void
}

const threadOf = ({
	bot,
	conversation,
	conversationRuntimes,
	chat,
	isSettingsOpen,
	isOverlayOpen,
	onToggleSettings,
	isConversationSettingsOpen,
	onOpenConversationSettings,
}: WorkspaceBodyProps): Thread | null => {
	if (conversation) {
		return {
			kind: "conversation",
			conversation,
			runtimes: conversationRuntimes,
			isSettingsOpen: isConversationSettingsOpen,
			onOpenSettings: onOpenConversationSettings,
		}
	}
	if (bot) {
		return {
			kind: "bot",
			bot,
			chat,
			isSettingsOpen,
			isOverlayOpen,
			onToggleSettings,
		}
	}
	return null
}

export function WorkspaceBody(props: WorkspaceBodyProps) {
	const t = useCommonCopy()

	if (props.haveSpacesFailed) {
		return (
			<Notice
				description={t("spaces.unavailable.description")}
				retry={{ onRetry: props.onRetrySpaces }}
				title={t("spaces.unavailable.title")}
			/>
		)
	}

	const thread = threadOf(props)

	if (!thread) {
		return (
			<AppHeader
				data-tauri-drag-region="deep"
				insetWindowControls={hasOverlayWindowControls()}
			/>
		)
	}

	return (
		<ThreadScreen
			attachments={props.attachments}
			bots={props.bots}
			drafts={props.drafts}
			readerName={props.readerName}
			thread={thread}
		/>
	)
}
