import { useState, useSyncExternalStore } from "react"

import {
	type BotSections,
	createSectionsController,
	type SectionsController,
	type SectionsState,
} from "./sections-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type Sections = {
	state: SectionsState
	controller: SectionsController
}

export const useSections = (
	store: TranscriptStore,
	bots: BotSections,
): Sections => {
	const [controller] = useState(() => createSectionsController(store, bots))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
