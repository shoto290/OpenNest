import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { MissionRowModel } from "@workspace/ui/components/mission-row"
import type { RoutinesPanelMissions } from "@workspace/ui/components/routines-panel"

import { toMissionRows } from "./missions-model"
import { missionsTransport } from "./missions-transport"

const NO_MISSIONS: MissionRowModel[] = []

export type ConversationMissionsRead = {
	missions: RoutinesPanelMissions
	hasFailed: boolean
	reload: () => void
}

export const useMissions = (
	conversationId: string | null,
): ConversationMissionsRead => {
	const [running, setRunning] = useState<MissionRowModel[]>(NO_MISSIONS)
	const [closed, setClosed] = useState<MissionRowModel[]>(NO_MISSIONS)
	const [readAt, setReadAt] = useState(0)
	const [hasFailed, setFailed] = useState(false)
	const reads = useRef(0)

	const reload = useCallback(() => {
		if (!conversationId) {
			return
		}

		reads.current += 1
		const ticket = reads.current

		missionsTransport.list(conversationId).then(
			(listed) => {
				if (ticket !== reads.current) {
					return
				}

				setRunning(toMissionRows(listed.open))
				setClosed(toMissionRows(listed.done))
				setReadAt(Date.now())
				setFailed(false)
			},
			() => {
				if (ticket === reads.current) {
					setFailed(true)
				}
			},
		)
	}, [conversationId])

	useEffect(reload, [reload])

	useEffect(() => {
		const listening = missionsTransport.onChanged(reload).catch((reason) => {
			console.error(
				"activity panel: mission changes could not be listened to",
				reason,
			)
			return () => undefined
		})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [reload])

	return useMemo(
		() => ({
			missions: { running, closed, now: readAt },
			hasFailed,
			reload,
		}),
		[running, closed, readAt, hasFailed, reload],
	)
}
