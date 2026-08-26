import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import type { TranscriptStore } from "./store-port"
import type { TranscriptMessage } from "./transcript-contract"
import { createTranscriptController } from "./transcript-controller"
import { selectHasMore, selectMessages } from "./transcript-state"

export type Transcript = {
	messages: TranscriptMessage[]
	hasOlder: boolean
	loadOlder: () => void
}

export const useTranscript = (
	store: TranscriptStore,
	conversationId: string,
): Transcript => {
	const [controller] = useState(() => createTranscriptController(store))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => {
		void controller.load(conversationId).catch(() => undefined)
	}, [controller, conversationId])

	const loadOlder = useCallback(() => {
		void controller.loadOlder(conversationId).catch(() => undefined)
	}, [controller, conversationId])

	return {
		messages: selectMessages(state, conversationId),
		hasOlder: selectHasMore(state, conversationId),
		loadOlder,
	}
}
