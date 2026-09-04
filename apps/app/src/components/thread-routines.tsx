import { type ReactNode, useState } from "react"

import {
	type RoutinesFailure,
	RoutinesPanel,
} from "@workspace/ui/components/routines-panel"

import { useMissions } from "@/lib/missions/use-missions"
import { useRoutines } from "@/lib/routines/use-routines"

type ThreadRoutinesProps = {
	conversationId: string | null
	leadBotId?: string
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
	children,
}: ThreadRoutinesProps) => {
	const [isOpen, setOpen] = useState(false)
	const { routines, failure, reload, setEnabled, remove, form, detail } =
		useRoutines(conversationId, leadBotId)
	const missions = useMissions(conversationId)

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
			missions={missions.missions}
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
