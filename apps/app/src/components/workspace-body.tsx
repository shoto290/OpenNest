import { useCallback, useSyncExternalStore } from "react"

import { AppHeader } from "@workspace/ui/components/app-header"
import { Notice } from "@workspace/ui/components/notice"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { MissionThreadScreen } from "@/components/mission-thread-screen"
import type { ActivityPanel } from "@/components/thread-routines"
import { ThreadScreen } from "@/components/thread-screen"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import type { Thread } from "@/lib/chat/thread-contract"
import type { Chat } from "@/lib/chat/use-chat"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { hasOverlayWindowControls } from "@/lib/host"
import type { OpenedMissionController } from "@/lib/missions/opened-mission-controller"
import type { Onboarding } from "@/lib/onboarding/use-onboarding"
import type { SignIn } from "@/lib/onboarding/use-sign-in"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"

type WorkspaceBodyProps = {
	activityPanel: ActivityPanel
	haveSpacesFailed: boolean
	onRetrySpaces: () => void
	bot?: Bot
	bots: Bot[]
	conversation?: Conversation
	conversationRuntimes: ConversationRuntimes
	chat: Chat
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
	isConversationSettingsOpen: boolean
	onOpenConversationSettings: (conversationId: string) => void
	missions: OpenedMissionController
	onboarding?: Onboarding
	signIn: SignIn
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
				activityPanel={props.activityPanel}
				attachments={props.attachments}
				bots={props.bots}
				drafts={props.drafts}
				landings={props.landings}
				missionId={openedMissionId}
				onLeave={leaveMission}
				onOpenMission={openMission}
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
			activityPanel={props.activityPanel}
			attachments={props.attachments}
			bots={props.bots}
			drafts={props.drafts}
			landings={props.landings}
			onboarding={props.onboarding}
			onOpenMission={openMission}
			readerName={props.readerName}
			runtimes={props.conversationRuntimes}
			signIn={props.signIn}
			thread={thread}
		/>
	)
}
