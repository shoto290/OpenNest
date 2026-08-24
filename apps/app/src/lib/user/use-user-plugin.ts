import { useState, useSyncExternalStore } from "react"

import {
	createUserPluginController,
	type UserPluginController,
	type UserPluginState,
} from "./user-plugin-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type UserPlugin = {
	state: UserPluginState
	controller: UserPluginController
}

export const useUserPlugin = (store: TranscriptStore): UserPlugin => {
	const [controller] = useState(() => createUserPluginController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
