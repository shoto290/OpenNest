import { useState, useSyncExternalStore } from "react"

import {
	createRosterController,
	type RosterController,
	type RosterState,
} from "./roster-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type Roster = {
	state: RosterState
	controller: RosterController
}

export const useRoster = (store: TranscriptStore): Roster => {
	const [controller] = useState(() => createRosterController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
