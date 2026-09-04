import { useCallback, useSyncExternalStore } from "react"

import { AppHeader } from "@workspace/ui/components/app-header"
import { Notice } from "@workspace/ui/components/notice"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { MissionThreadScreen } from "@/components/mission-thread-screen"
import { ThreadScreen } from "@/components/thread-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { hasOverlayWindowControls } from "@/lib/host"
import type { OpenedMissionController } from "@/lib/missions/opened-mission-controller"

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
	missions: OpenedMissionController
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
	const { missions } = props
	const opened = useSyncExternalStore(missions.subscribe, missions.getState)
	const rowId = props.conversation?.id ?? props.bot?.id ?? null

	const openMission = useCallback(
		(missionId: string) => {
			if (rowId) {
				missions.open({ missionId, rowId })
			}
		},
		[missions, rowId],
	)
	const leaveMission = useCallback(() => missions.leave(), [missions])

	const openedMissionId =
		opened && opened.rowId === rowId ? opened.missionId : null

	if (props.haveSpacesFailed) {
		return (
			<Notice
				description={t("spaces.unavailable.description")}
				retry={{ onRetry: props.onRetrySpaces }}
				title={t("spaces.unavailable.title")}
			/>
		)
	}

	if (openedMissionId) {
		return (
			<MissionThreadScreen
				bots={props.bots}
				missionId={openedMissionId}
				onLeave={leaveMission}
				readerName={props.readerName}
				runtimes={props.conversationRuntimes}
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
			onOpenMission={openMission}
			readerName={props.readerName}
			thread={thread}
		/>
	)
}
