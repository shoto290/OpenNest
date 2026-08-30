import { useState, useSyncExternalStore } from "react"

import {
	createEnvironmentController,
	type EnvironmentController,
	type EnvironmentState,
} from "./environment-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type Environment = {
	state: EnvironmentState
	controller: EnvironmentController
}

export const useEnvironment = (store: TranscriptStore): Environment => {
	const [controller] = useState(() => createEnvironmentController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
