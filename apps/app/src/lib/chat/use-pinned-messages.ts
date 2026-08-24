import { useCallback, useEffect, useMemo, useState } from "react"

import type { ChatController } from "./chat-controller"
import { type PinnedBubble, pinnedBubblesOf } from "./pinned-bubbles"
import { bubbleIdOf } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

const NO_PINS: MessagePin[] = []

export type PinnedBubbles = {
	bubbles: PinnedBubble[]
	isPinned: (bubbleId: string) => boolean
	anchorOf: (bubbleId: string) => string
	toggle: (messageId: string, blockIndex: number) => void
	unpin: (bubbleId: string) => void
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

	const bubbles = useMemo(() => pinnedBubblesOf(pins), [pins])
	const held = useMemo(
		() => new Map(bubbles.map((shown) => [shown.id, shown])),
		[bubbles],
	)

	const isPinned = useCallback((bubbleId: string) => held.has(bubbleId), [held])

	const anchorOf = useCallback(
		(bubbleId: string) => held.get(bubbleId)?.anchor ?? bubbleId,
		[held],
	)

	const toggle = useCallback(
		(messageId: string, blockIndex: number) => {
			const act = isPinned(bubbleIdOf(messageId, blockIndex))
				? controller.unpin(messageId, blockIndex)
				: controller.pin(messageId, blockIndex)
			void act.then(recall, () => undefined)
		},
		[controller, isPinned, recall],
	)

	const unpin = useCallback(
		(bubbleId: string) => {
			const shown = held.get(bubbleId)
			if (!shown) {
				return
			}
			void controller
				.unpin(shown.pin.message.id, shown.pin.blockIndex)
				.then(recall, () => undefined)
		},
		[controller, held, recall],
	)

	return useMemo(
		() => ({ bubbles, isPinned, anchorOf, toggle, unpin }),
		[bubbles, isPinned, anchorOf, toggle, unpin],
	)
}
