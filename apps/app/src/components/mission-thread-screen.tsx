import { useMemo } from "react"

import type { MissionEventModel } from "@workspace/ui/components/mission"
import { MissionThread } from "@workspace/ui/components/mission-thread"
import { Notice } from "@workspace/ui/components/notice"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { useRosterClock } from "@/lib/bots/use-roster-clock"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type { Bot } from "@/lib/conversations/store-contract"
import { useConversation } from "@/lib/conversations/use-conversation"
import type { Mission } from "@/lib/missions/mission-contract"
import {
	toMissionBot,
	toMissionConversation,
	toMissionThreadEvents,
} from "@/lib/missions/mission-thread-model"
import { useMissionDetail } from "@/lib/missions/use-mission-detail"

type MissionReadFailureProps = {
	onRetry: () => void
}

const MissionReadFailure = ({ onRetry }: MissionReadFailureProps) => {
	const t = useChatCopy()

	return (
		<Notice
			description={t("missions.failure.read.description")}
			retry={{ onRetry }}
			title={t("missions.failure.read.title")}
		/>
	)
}

const reportSendFailure = (t: ChatCopy) =>
	raiseFailureNotice({
		title: t("missions.failure.send.title"),
		description: t("missions.failure.send.description"),
	})

type OpenedMissionProps = {
	mission: Mission
	bot: Bot
	events: MissionEventModel[]
	hasFailedToRead: boolean
	runtimes: ConversationRuntimes
	readerName: string
	onRetry: () => void
	onLeave: () => void
}

const OpenedMission = ({
	mission,
	bot,
	events,
	hasFailedToRead,
	runtimes,
	readerName,
	onRetry,
	onLeave,
}: OpenedMissionProps) => {
	const t = useChatCopy()
	const now = useRosterClock()
	const conversation = useMemo(
		() => toMissionConversation({ mission, bot }),
		[mission, bot],
	)
	const { state, controller } = useConversation(runtimes, conversation)

	const send = (text: string) => {
		void controller.send(text).then(
			() => {
				if (controller.getState().refusedMessage) {
					reportSendFailure(t)
				}
			},
			() => reportSendFailure(t),
		)
	}

	return (
		<MissionThread
			bot={toMissionBot(bot)}
			events={toMissionThreadEvents({
				events,
				messages: state.messages,
				sources: { reader: readerName || t("working.name"), bot: bot.name },
			})}
			hasFailedToRead={hasFailedToRead}
			isClosed={mission.closedAt !== null}
			now={now}
			onBack={onLeave}
			onRetry={onRetry}
			onSend={send}
			state={mission.state}
			ticket={mission.ticket}
			tools={mission.tools}
		/>
	)
}

type MissionThreadScreenProps = {
	missionId: string
	bots: Bot[]
	runtimes: ConversationRuntimes
	readerName: string
	onLeave: () => void
}

export function MissionThreadScreen({
	missionId,
	bots,
	runtimes,
	readerName,
	onLeave,
}: MissionThreadScreenProps) {
	const { read, hasFailedToRead, onRetry } = useMissionDetail(missionId)
	const bot = read
		? bots.find(({ id }) => id === read.mission.botId)
		: undefined

	if (read && bot) {
		return (
			<OpenedMission
				bot={bot}
				events={read.events}
				hasFailedToRead={hasFailedToRead}
				mission={read.mission}
				onLeave={onLeave}
				onRetry={onRetry}
				readerName={readerName}
				runtimes={runtimes}
			/>
		)
	}

	const isReading = read === null && !hasFailedToRead

	return isReading ? null : <MissionReadFailure onRetry={onRetry} />
}
