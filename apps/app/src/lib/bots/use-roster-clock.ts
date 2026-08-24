import { useState, useSyncExternalStore } from "react"

import { createRosterClock } from "./roster-clock"

export const useRosterClock = (): number => {
	const [clock] = useState(createRosterClock)

	return useSyncExternalStore(clock.subscribe, clock.read)
}
