import { useEffect, useState, useSyncExternalStore } from "react"

import { createUpdater } from "./create-updater"
import {
	createUpdaterController,
	type UpdaterController,
	type UpdaterState,
} from "./updater-controller"

export type Updater = {
	state: UpdaterState
	controller: UpdaterController
}

export const useUpdater = (): Updater => {
	const [controller] = useState(() => createUpdaterController(createUpdater()))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => controller.start(), [controller])

	return { state, controller }
}
