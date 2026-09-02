import { useEffect } from "react"

import { createRunPort } from "./create-run-port"
import { startRunDriver } from "./run-driver"

import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type RunDriverMount = {
	driver: ChatDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
}

export const useRunDriver = ({ driver, store, runtimes }: RunDriverMount) => {
	useEffect(
		() => startRunDriver({ driver, store, runtimes, runs: createRunPort() }),
		[driver, store, runtimes],
	)
}
