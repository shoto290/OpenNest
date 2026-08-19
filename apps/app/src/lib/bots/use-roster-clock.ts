import { useState, useSyncExternalStore } from "react"

import { createRosterClock } from "./roster-clock"

/** The reading every row of this render is aged against. */
export const useRosterClock = (): number => {
	const [clock] = useState(createRosterClock)

	return useSyncExternalStore(clock.subscribe, clock.read)
}
