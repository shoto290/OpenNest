"use client"

import { useTranslation } from "react-i18next"

import { Message, MessageContent } from "@workspace/ui/components/message"
import { MESSAGE_BUBBLE_MAX_INLINE_SIZE } from "@workspace/ui/components/message-bubble"
import {
	MissionCard,
	type MissionCardModel,
} from "@workspace/ui/components/mission-card"
import { TURN_AVATAR_SIZE } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

type MissionTurnProps = {
	mission: MissionCardModel
	onOpen: (missionId: string) => void
}

const MissionTurn = ({ mission, onOpen }: MissionTurnProps) => {
	const { t } = useTranslation("chat")

	return (
		<Message aria-label={t("transcript.message.mission")} from="assistant">
			<MessageContent
				className="grid gap-x-2"
				style={{ gridTemplateColumns: `${TURN_AVATAR_SIZE}px 1fr` }}
			>
				<MissionCard
					{...mission}
					className={cn("col-start-2", MESSAGE_BUBBLE_MAX_INLINE_SIZE)}
					onOpen={onOpen}
				/>
			</MessageContent>
		</Message>
	)
}

export { MissionTurn, type MissionTurnProps }
