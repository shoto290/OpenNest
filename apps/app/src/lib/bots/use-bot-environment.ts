import { useState, useSyncExternalStore } from "react"

import {
	createEnvironmentController,
	type EnvironmentController,
	type EnvironmentState,
} from "./environment-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type BotEnvironment = {
	state: EnvironmentState
	controller: EnvironmentController
}

export const useBotEnvironment = (store: TranscriptStore): BotEnvironment => {
	const [controller] = useState(() => createEnvironmentController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
