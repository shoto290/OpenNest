import { useCallback, useEffect, useMemo, useState } from "react"

import { type PinnedBubble, pinnedBubblesOf } from "./pinned-bubbles"
import { bubbleIdOf } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

const NO_PINS: MessagePin[] = []

export type PinnedMessagesController = {
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
}

export type PinnedBubbles = {
	bubbles: PinnedBubble[]
	hasFailed: boolean
	isPinned: (bubbleId: string) => boolean
	anchorOf: (bubbleId: string) => string
	toggle: (messageId: string, blockIndex: number) => void
	unpin: (bubbleId: string) => void
	dismissFailure: () => void
}

export function usePinnedMessages(
	controller: PinnedMessagesController,
	conversationId: string | null,
): PinnedBubbles {
	const [pins, setPins] = useState<MessagePin[]>(NO_PINS)
	const [hasFailed, setHasFailed] = useState(false)

	const noteFailure = useCallback(() => setHasFailed(true), [])
	const dismissFailure = useCallback(() => setHasFailed(false), [])

	const recall = useCallback(() => {
		if (!conversationId) {
			setPins(NO_PINS)
			return
		}
		void controller.pins().then((held) => {
			setPins(held)
			setHasFailed(false)
		}, noteFailure)
	}, [controller, conversationId, noteFailure])

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
			void act.then(recall, noteFailure)
		},
		[controller, isPinned, recall, noteFailure],
	)

	const unpin = useCallback(
		(bubbleId: string) => {
			const shown = held.get(bubbleId)
			if (!shown) {
				return
			}
			void controller
				.unpin(shown.pin.message.id, shown.pin.blockIndex)
				.then(recall, noteFailure)
		},
		[controller, held, recall, noteFailure],
	)

	return useMemo(
		() => ({
			bubbles,
			hasFailed,
			isPinned,
			anchorOf,
			toggle,
			unpin,
			dismissFailure,
		}),
		[bubbles, hasFailed, isPinned, anchorOf, toggle, unpin, dismissFailure],
	)
}
