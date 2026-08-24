import { bubbleIdOf, bubbleOf, type TranscriptRow } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

export type PinnedBubble = {
	id: string
	anchor: string
	bubble: TranscriptRow
	pin: MessagePin
}

const shownAs = (pin: MessagePin): PinnedBubble[] => {
	const bubble = bubbleOf(pin.message, pin.blockIndex)
	return bubble
		? [
				{
					id: bubbleIdOf(pin.message.id, pin.blockIndex),
					anchor: bubbleIdOf(bubble.messageId, bubble.blockIndex),
					bubble,
					pin,
				},
			]
		: []
}

export const pinnedBubblesOf = (pins: MessagePin[]): PinnedBubble[] =>
	pins.flatMap(shownAs)
