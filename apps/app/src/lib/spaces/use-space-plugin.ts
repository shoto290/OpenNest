import { useState, useSyncExternalStore } from "react"

import {
	createSpacePluginController,
	type SpacePluginController,
	type SpacePluginState,
} from "./space-plugin-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type SpacePlugin = {
	state: SpacePluginState
	controller: SpacePluginController
}

export const useSpacePlugin = (store: TranscriptStore): SpacePlugin => {
	const [controller] = useState(() => createSpacePluginController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
