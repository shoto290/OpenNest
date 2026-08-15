import { useEffect, useState, useSyncExternalStore } from "react"

import { type ChatController, createChatController } from "./chat-controller"
import type { ChatState } from "./chat-state"
import type { ChatDriver } from "./driver"

export type Chat = {
	state: ChatState
	controller: ChatController
}

export function useChat(driver: ChatDriver): Chat {
	const [controller] = useState(() => createChatController(driver))
	const state = useSyncExternalStore(controller.subscribe, controller.getState)

	useEffect(() => controller.attach(), [controller])

	return { state, controller }
}
