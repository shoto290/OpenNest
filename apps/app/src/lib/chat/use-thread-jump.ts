import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

import type { MessageScrollerHandle } from "@workspace/ui/components/message-scroller"

import type { TranscriptMessage } from "../conversations/transcript-contract"

const HIGHLIGHT_MS = 2_000

const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})

export type ThreadPager = {
	getState: () => { messages: TranscriptMessage[]; hasOlder: boolean }
	loadOlder: () => Promise<void>
}

export type ThreadJump = {
	highlightedMessageId?: string
	jumpToMessage: (messageId: string) => void
}

export function useThreadJump(
	controller: ThreadPager,
	scrollerRef: RefObject<MessageScrollerHandle | null>,
): ThreadJump {
	const [highlightedMessageId, setHighlightedMessageId] = useState<string>()
	const heldHighlight = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => () => clearTimeout(heldHighlight.current), [])

	const reachMessage = useCallback(
		async (messageId: string) => {
			while (scrollerRef.current?.scrollToMessage(messageId) === false) {
				const shown = controller.getState()
				if (!shown.hasOlder) {
					return
				}
				await controller.loadOlder()
				await nextFrame()
				if (controller.getState().messages.length === shown.messages.length) {
					return
				}
			}
		},
		[controller, scrollerRef],
	)

	return {
		highlightedMessageId,
		jumpToMessage: useCallback(
			(messageId: string) => {
				clearTimeout(heldHighlight.current)
				setHighlightedMessageId(messageId)
				heldHighlight.current = setTimeout(
					() => setHighlightedMessageId(undefined),
					HIGHLIGHT_MS,
				)
				void reachMessage(messageId)
			},
			[reachMessage],
		),
	}
}
