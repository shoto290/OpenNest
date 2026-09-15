import { useState, useSyncExternalStore } from "react"

import type { ApplicationPort } from "./application-port"
import {
	type ApplicationsController,
	type ApplicationsState,
	createApplicationsController,
} from "./applications-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type Applications = {
	state: ApplicationsState
	controller: ApplicationsController
}

export const useApplications = (
	port: ApplicationPort,
	store: TranscriptStore,
): Applications => {
	const [controller] = useState(() => createApplicationsController(port, store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
