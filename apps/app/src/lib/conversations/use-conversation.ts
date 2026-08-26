import { useEffect, useState, useSyncExternalStore } from "react"

import {
	type ConversationController,
	type ConversationState,
	createConversationController,
} from "./conversation-controller"
import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"

import type { ChatDriver } from "../chat/driver"

export type ConversationChat = {
	state: ConversationState
	controller: ConversationController
}

export const useConversation = (
	driver: ChatDriver,
	store: TranscriptStore,
	conversation: Conversation,
): ConversationChat => {
	const [controller] = useState(() =>
		createConversationController(driver, store),
	)
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => controller.attach(), [controller])

	useEffect(() => {
		void controller.open(conversation)
	}, [controller, conversation])

	return { state, controller }
}
