import {
	type ConversationController,
	createConversationController,
} from "./conversation-controller"
import type { TranscriptStore } from "./store-port"

import type { ChatDriver } from "../chat/driver"

export type ConversationRuntimes = {
	runtimeFor: (conversationId: string) => ConversationController
	release: (conversationId: string) => Promise<void>
	shutdown: () => Promise<void>
}

export const createConversationRuntimes = (
	driver: ChatDriver,
	store: TranscriptStore,
): ConversationRuntimes => {
	const runtimes = new Map<string, ConversationController>()

	const runtimeFor = (conversationId: string) => {
		const held = runtimes.get(conversationId)
		if (held) {
			return held
		}
		const opened = createConversationController(driver, store)
		opened.attach()
		runtimes.set(conversationId, opened)
		return opened
	}

	const release = async (conversationId: string) => {
		const held = runtimes.get(conversationId)
		if (!held) {
			return
		}
		runtimes.delete(conversationId)
		await held.shutdown().catch(() => undefined)
	}

	const shutdown = async () => {
		const open = [...runtimes.values()]
		runtimes.clear()
		await Promise.all(open.map((runtime) => runtime.shutdown()))
	}

	return { runtimeFor, release, shutdown }
}
