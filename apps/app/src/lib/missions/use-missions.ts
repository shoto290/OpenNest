import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { RoutinesPanelMissions } from "@workspace/ui/components/routines-panel"

import type { Mission } from "./mission-contract"
import { toMissionRows } from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { useRosterClock } from "@/lib/bots/use-roster-clock"

const NO_MISSIONS: Mission[] = []

export type ConversationMissionsRead = {
	panel: RoutinesPanelMissions
	missions: Mission[]
	hasFailed: boolean
	reload: () => void
}

export const useMissions = (
	conversationId: string | null,
): ConversationMissionsRead => {
	const [running, setRunning] = useState<Mission[]>(NO_MISSIONS)
	const [closed, setClosed] = useState<Mission[]>(NO_MISSIONS)
	const [hasFailed, setFailed] = useState(false)
	const reads = useRef(0)
	const now = useRosterClock()

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

				setRunning(listed.open)
				setClosed(listed.done)
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

	const panel = useMemo<RoutinesPanelMissions>(
		() => ({
			running: toMissionRows(running),
			closed: toMissionRows(closed),
			now,
		}),
		[running, closed, now],
	)
	const missions = useMemo(() => [...running, ...closed], [running, closed])

	return useMemo(
		() => ({ panel, missions, hasFailed, reload }),
		[panel, missions, hasFailed, reload],
	)
}
