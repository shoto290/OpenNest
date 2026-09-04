import { type ReactNode, useState } from "react"

import {
	type RoutinesFailure,
	RoutinesPanel,
} from "@workspace/ui/components/routines-panel"

import { useRosterClock } from "@/lib/bots/use-roster-clock"
import type { ConversationMissionsRead } from "@/lib/missions/use-missions"
import { useRoutines } from "@/lib/routines/use-routines"

type ThreadRoutinesProps = {
	conversationId: string | null
	leadBotId?: string
	missions: ConversationMissionsRead
	onOpenMission: (missionId: string) => void
	children: ReactNode
}

const activityFailure = (
	routines: RoutinesFailure | null,
	hasMissionsFailed: boolean,
): RoutinesFailure | null => {
	if (!hasMissionsFailed) {
		return routines
	}

	return routines === "routines" ? "activity" : "missions"
}

const ThreadRoutines = ({
	conversationId,
	leadBotId,
	missions,
	onOpenMission,
	children,
}: ThreadRoutinesProps) => {
	const [isOpen, setOpen] = useState(false)
	const now = useRosterClock()
	const { routines, failure, reload, setEnabled, remove, form, detail } =
		useRoutines(conversationId, leadBotId)

	const reloadActivity = () => {
		reload()
		missions.reload()
	}

	return (
		<RoutinesPanel
			detail={detail}
			failure={activityFailure(failure, missions.hasFailed)}
			form={form}
			isOpen={isOpen}
			missions={{ ...missions.rows, now, onOpen: onOpenMission }}
			onDelete={remove}
			onEnabledChange={setEnabled}
			onOpenChange={setOpen}
			onRetry={reloadActivity}
			routines={routines}
		>
			{children}
		</RoutinesPanel>
	)
}

export { ThreadRoutines, type ThreadRoutinesProps }
