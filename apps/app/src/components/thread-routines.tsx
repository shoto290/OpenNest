import { type ReactNode, useState } from "react"

import { RoutinesPanel } from "@workspace/ui/components/routines-panel"

import { useMissions } from "@/lib/missions/use-missions"
import { useRoutines } from "@/lib/routines/use-routines"

type ThreadRoutinesProps = {
	conversationId: string | null
	leadBotId?: string
	children: ReactNode
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
			failure={failure ?? (missions.hasFailed ? "read" : null)}
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
