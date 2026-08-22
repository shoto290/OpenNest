import { useState, useSyncExternalStore } from "react"

import {
	createHistoryController,
	type HistoryController,
	type HistoryState,
} from "./history-controller"

import type { TranscriptStore } from "../conversations/store-port"

export type BotHistory = {
	state: HistoryState
	controller: HistoryController
}

export const useBotHistory = (store: TranscriptStore): BotHistory => {
	const [controller] = useState(() => createHistoryController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	return { state, controller }
}
