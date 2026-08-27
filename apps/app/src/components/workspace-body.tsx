import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { AppHeader } from "@workspace/ui/components/app-header"

import { ChatScreen } from "@/components/chat-screen"
import { ConversationScreen } from "@/components/conversation-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
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

export function WorkspaceBody({
	hasLoaded,
	bot,
	conversation,
	conversationRuntimes,
	chat,
	attachments,
	readerName,
	isSettingsOpen,
	isOverlayOpen,
	onToggleSettings,
	isConversationSettingsOpen,
	onOpenConversationSettings,
}: WorkspaceBodyProps) {
	if (!hasLoaded) {
		return <AppBootScreen data-tauri-drag-region="deep" />
	}

	if (conversation) {
		return (
			<ConversationScreen
				conversation={conversation}
				isSettingsOpen={isConversationSettingsOpen}
				onOpenSettings={onOpenConversationSettings}
				readerName={readerName}
				runtimes={conversationRuntimes}
			/>
		)
	}

	if (bot) {
		return (
			<ChatScreen
				attachments={attachments}
				bot={bot}
				chat={chat}
				isOverlayOpen={isOverlayOpen}
				isSettingsOpen={isSettingsOpen}
				onToggleSettings={onToggleSettings}
				readerName={readerName}
			/>
		)
	}

	return (
		<AppHeader
			data-tauri-drag-region="deep"
			insetWindowControls={hasOverlayWindowControls()}
		/>
	)
}
