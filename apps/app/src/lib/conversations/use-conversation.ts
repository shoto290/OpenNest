import { useEffect, useMemo, useSyncExternalStore } from "react"

import type {
	ConversationController,
	ConversationState,
} from "./conversation-controller"
import type { ConversationRuntimes } from "./conversation-runtimes"
import type { Conversation } from "./store-contract"

export type ConversationChat = {
	state: ConversationState
	controller: ConversationController
}

export const useConversation = (
	runtimes: ConversationRuntimes,
	conversation: Conversation,
): ConversationChat => {
	const controller = useMemo(
		() => runtimes.runtimeFor(conversation.id),
		[runtimes, conversation.id],
	)
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => {
		void controller.open(conversation)
	}, [controller, conversation])

	return { state, controller }
}
