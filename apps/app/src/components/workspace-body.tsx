import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { AppHeader } from "@workspace/ui/components/app-header"

import { ChatScreen } from "@/components/chat-screen"
import { ConversationScreen } from "@/components/conversation-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatDriver } from "@/lib/chat/driver"
import type { Chat } from "@/lib/chat/use-chat"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { hasOverlayWindowControls } from "@/lib/host"

type WorkspaceBodyProps = {
	hasLoaded: boolean
	bot?: Bot
	conversation?: Conversation
	driver: ChatDriver
	store: TranscriptStore
	chat: Chat
	attachments: AttachmentsController
	readerName: string
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
	isConversationSettingsOpen: boolean
	onOpenConversationSettings: () => void
}

export function WorkspaceBody({
	hasLoaded,
	bot,
	conversation,
	driver,
	store,
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
				driver={driver}
				isSettingsOpen={isConversationSettingsOpen}
				onOpenSettings={onOpenConversationSettings}
				store={store}
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
