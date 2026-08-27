import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { AppHeader } from "@workspace/ui/components/app-header"

import { ThreadScreen } from "@/components/thread-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { hasOverlayWindowControls } from "@/lib/host"

type WorkspaceBodyProps = {
	hasLoaded: boolean
	bot?: Bot
	conversation?: Conversation
	conversationRuntimes: ConversationRuntimes
	chat: Chat
	attachments: AttachmentsController
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
	if (!props.hasLoaded) {
		return <AppBootScreen data-tauri-drag-region="deep" />
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
			readerName={props.readerName}
			thread={thread}
		/>
	)
}
