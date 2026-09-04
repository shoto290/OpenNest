import { useCallback, useEffect, useState } from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type DrivingMissions,
	drivingMissions,
	NO_MISSIONS,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"

const raiseBoardFailure = () =>
	raiseFailureNotice({
		title: i18n.t("bots:roster.mission.unavailable.title"),
		description: i18n.t("bots:roster.mission.unavailable.description"),
	})

export const useMissionBoard = (): DrivingMissions => {
	const [driving, setDriving] = useState<DrivingMissions>(NO_MISSIONS)

	const read = useCallback(() => {
		void missionsTransport.board().then(
			(board) => setDriving(drivingMissions(board)),
			() => {
				setDriving(NO_MISSIONS)
				raiseBoardFailure()
			},
		)
	}, [])

	useEffect(() => {
		read()
		const listening = missionsTransport.onChanged(read).catch((reason) => {
			console.error("roster: mission changes could not be listened to", reason)
			return () => undefined
		})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [read])

	return driving
}
