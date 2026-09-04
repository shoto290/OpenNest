import { useEffect } from "react"

import { createRunPort } from "./create-run-port"
import { startRunDriver } from "./run-driver"

import type { ChatController } from "../chat/chat-controller"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type RunDriverMount = {
	driver: ChatDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
	chat: ChatController
}

export const useRunDriver = ({
	driver,
	store,
	runtimes,
	chat,
}: RunDriverMount) => {
	useEffect(
		() =>
			startRunDriver({
				driver,
				store,
				runtimes,
				chat,
				runs: createRunPort(),
			}),
		[driver, store, runtimes, chat],
	)
}
