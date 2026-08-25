import { useState, useSyncExternalStore } from "react"

import {
	createSpacesController,
	type SpacesController,
	type SpacesState,
} from "./spaces-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type Spaces = {
	state: SpacesState
	controller: SpacesController
}

export const useSpaces = (store: TranscriptStore): Spaces => {
	const [controller] = useState(() => createSpacesController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
