import { useEffect } from "react"

import type { RosterController } from "../bots/roster-controller"
import { lastBotIn, type MirroredPreferences } from "../user/preferences-mirror"

type SpaceMemory = {
	getState: () => { preferences: MirroredPreferences }
	setLastSpace: (spaceId: string) => Promise<void>
}

export type SpaceEntry = {
	roster: RosterController
	user: SpaceMemory
	selectedSpaceId: string | null
}

export const useSpaceEntry = ({
	roster,
	user,
	selectedSpaceId,
}: SpaceEntry) => {
	useEffect(() => {
		if (!selectedSpaceId) {
			return
		}
		void user.setLastSpace(selectedSpaceId)
		roster.enter({
			spaceId: selectedSpaceId,
			lastRowId: lastBotIn(user.getState().preferences, selectedSpaceId),
		})
	}, [roster, user, selectedSpaceId])
}
