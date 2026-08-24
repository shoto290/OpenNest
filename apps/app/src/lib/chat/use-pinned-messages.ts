import { useCallback, useEffect, useMemo, useState } from "react"

import type { ChatController } from "./chat-controller"
import { bubbleIdOf, bubbleOf, type TranscriptRow } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

const NO_PINS: MessagePin[] = []

export type PinnedBubble = {
	id: string
	bubble: TranscriptRow
	pin: MessagePin
}

export type PinnedBubbles = {
	bubbles: PinnedBubble[]
	ids: ReadonlySet<string>
	toggle: (messageId: string, blockIndex: number) => void
	unpin: (bubbleId: string) => void
}

const shownAs = (pin: MessagePin): PinnedBubble[] => {
	const bubble = bubbleOf(pin.message, pin.blockIndex)
	return bubble
		? [{ id: bubbleIdOf(bubble.messageId, bubble.blockIndex), bubble, pin }]
		: []
}

export function usePinnedMessages(
	controller: ChatController,
	conversationId: string | null,
): PinnedBubbles {
	const [pins, setPins] = useState<MessagePin[]>(NO_PINS)

	const recall = useCallback(() => {
		if (!conversationId) {
			setPins(NO_PINS)
			return
		}
		void controller.pins().then(setPins, () => undefined)
	}, [controller, conversationId])

	useEffect(recall, [recall])

	const bubbles = useMemo(() => pins.flatMap(shownAs), [pins])
	const held = useMemo(
		() => new Map(bubbles.map((shown) => [shown.id, shown.pin])),
		[bubbles],
	)

	const toggle = useCallback(
		(messageId: string, blockIndex: number) => {
			const act = held.has(bubbleIdOf(messageId, blockIndex))
				? controller.unpin(messageId, blockIndex)
				: controller.pin(messageId, blockIndex)
			void act.then(recall, () => undefined)
		},
		[controller, held, recall],
	)

	const unpin = useCallback(
		(bubbleId: string) => {
			const pin = held.get(bubbleId)
			if (!pin) {
				return
			}
			void controller
				.unpin(pin.message.id, pin.blockIndex)
				.then(recall, () => undefined)
		},
		[controller, held, recall],
	)

	return useMemo(
		() => ({ bubbles, ids: new Set(held.keys()), toggle, unpin }),
		[bubbles, held, toggle, unpin],
	)
}
