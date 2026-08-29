import { useState, useSyncExternalStore } from "react"

import {
	type CollapsedSectionsController,
	type CollapsedSectionsState,
	createCollapsedSectionsController,
} from "./collapsed-sections-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type CollapsedSections = {
	state: CollapsedSectionsState
	controller: CollapsedSectionsController
}

export const useCollapsedSections = (
	store: TranscriptStore,
): CollapsedSections => {
	const [controller] = useState(() => createCollapsedSectionsController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
