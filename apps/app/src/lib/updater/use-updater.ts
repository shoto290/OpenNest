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

/** What this launch knows about a newer release. Mounted once, at the top of the
 * window: the polling belongs to the app being open, not to whatever happens to be
 * on the screen. */
export const useUpdater = (): Updater => {
	const [controller] = useState(() => createUpdaterController(createUpdater()))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => controller.start(), [controller])

	return { state, controller }
}
