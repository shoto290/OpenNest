import { useCallback, useEffect, useMemo, useState } from "react"

import type { ChatController } from "./chat-controller"

import type { TranscriptMessage } from "../conversations/transcript-contract"

const NO_PINS: TranscriptMessage[] = []

export type PinnedMessages = {
	messages: TranscriptMessage[]
	ids: ReadonlySet<string>
	toggle: (messageId: string) => void
	unpin: (messageId: string) => void
}

export function usePinnedMessages(
	controller: ChatController,
	conversationId: string | null,
): PinnedMessages {
	const [messages, setMessages] = useState<TranscriptMessage[]>(NO_PINS)

	const recall = useCallback(() => {
		if (!conversationId) {
			setMessages(NO_PINS)
			return
		}
		void controller.pins().then(setMessages, () => undefined)
	}, [controller, conversationId])

	useEffect(recall, [recall])

	const ids = useMemo(
		() => new Set(messages.map((message) => message.id)),
		[messages],
	)

	const unpin = useCallback(
		(messageId: string) => {
			void controller.unpin(messageId).then(recall, () => undefined)
		},
		[controller, recall],
	)

	const toggle = useCallback(
		(messageId: string) => {
			if (ids.has(messageId)) {
				unpin(messageId)
				return
			}
			void controller.pin(messageId).then(recall, () => undefined)
		},
		[controller, ids, recall, unpin],
	)

	return useMemo(
		() => ({ messages, ids, toggle, unpin }),
		[messages, ids, toggle, unpin],
	)
}
