import { useCallback, useEffect, useState } from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type MissionsByBot,
	missionsByBot,
	NO_MISSIONS,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"

export const useMissionBoard = (): MissionsByBot => {
	const [driving, setDriving] = useState<MissionsByBot>(NO_MISSIONS)

	const read = useCallback(() => {
		void missionsTransport.board().then(
			(board) => setDriving(missionsByBot(board)),
			() => {
				setDriving(NO_MISSIONS)
				raiseFailureNotice({
					title: i18n.t("bots:roster.mission.unavailable.title"),
					description: i18n.t("bots:roster.mission.unavailable.description"),
				})
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
