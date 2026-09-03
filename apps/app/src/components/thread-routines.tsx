import { type ReactNode, useState } from "react"

import { RoutinesPanel } from "@workspace/ui/components/routines-panel"

import { useRoutines } from "@/lib/routines/use-routines"

type ThreadRoutinesProps = {
	conversationId: string
	children: ReactNode
}

const ThreadRoutines = ({ conversationId, children }: ThreadRoutinesProps) => {
	const [isOpen, setOpen] = useState(false)
	const { routines, failure, reload, setEnabled, remove } =
		useRoutines(conversationId)

	return (
		<RoutinesPanel
			failure={failure}
			isOpen={isOpen}
			onDelete={remove}
			onEnabledChange={setEnabled}
			onOpenChange={setOpen}
			onRetry={reload}
			routines={routines}
		>
			{children}
		</RoutinesPanel>
	)
}

export { ThreadRoutines, type ThreadRoutinesProps }
