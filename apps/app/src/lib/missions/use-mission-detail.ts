import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { MissionEventModel } from "@workspace/ui/components/mission"

import type { Mission } from "./mission-contract"
import { toMissionEventModels } from "./missions-model"
import { missionsTransport } from "./missions-transport"

type MissionRead = {
	mission: Mission
	events: MissionEventModel[]
	readAt: number
}

export type MissionDetailRead = {
	read: MissionRead | null
	isReading: boolean
	hasFailedToRead: boolean
	onRetry: () => void
}

export const useMissionDetail = (missionId: string): MissionDetailRead => {
	const [read, setRead] = useState<MissionRead | null>(null)
	const [isReading, setReading] = useState(true)
	const [hasFailedToRead, setFailedToRead] = useState(false)
	const reads = useRef(0)

	const readMission = useCallback(() => {
		reads.current += 1
		const ticket = reads.current
		const isCurrent = () => ticket === reads.current

		setReading(true)

		void missionsTransport.detail(missionId).then(
			(detail) => {
				if (!isCurrent()) return
				setRead({
					mission: detail.mission,
					events: toMissionEventModels(detail.events),
					readAt: Date.now(),
				})
				setReading(false)
				setFailedToRead(false)
			},
			() => {
				if (!isCurrent()) return
				setReading(false)
				setFailedToRead(true)
			},
		)
	}, [missionId])

	useEffect(() => {
		setRead(null)
		readMission()
	}, [readMission])

	useEffect(() => {
		const listening = missionsTransport
			.onChanged((changed) => {
				if (changed.missionId === missionId) {
					readMission()
				}
			})
			.catch((reason) => {
				console.error(
					"mission thread: mission changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [missionId, readMission])

	return useMemo(
		() => ({ read, isReading, hasFailedToRead, onRetry: readMission }),
		[read, isReading, hasFailedToRead, readMission],
	)
}
