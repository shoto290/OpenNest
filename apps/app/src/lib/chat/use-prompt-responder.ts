import { type RefObject, useMemo } from "react"

import type { MessageScrollerHandle } from "@workspace/ui/components/message-scroller"

import type { PermissionDecision, QuestionAnswers } from "@/lib/agent/contract"

export type PromptResponder = {
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
}

type LiveEdgeResponderInput = {
	responder: PromptResponder
	scrollToLiveEdge: () => void
}

export const liveEdgeResponder = ({
	responder,
	scrollToLiveEdge,
}: LiveEdgeResponderInput): PromptResponder => ({
	answer: (id, answers) => {
		scrollToLiveEdge()
		return responder.answer(id, answers)
	},
	respond: (id, decision) => {
		scrollToLiveEdge()
		return responder.respond(id, decision)
	},
})

export function usePromptResponder(
	responder: PromptResponder,
	scrollerRef: RefObject<MessageScrollerHandle | null>,
): PromptResponder {
	return useMemo(
		() =>
			liveEdgeResponder({
				responder,
				scrollToLiveEdge: () => scrollerRef.current?.scrollToEnd("auto"),
			}),
		[responder, scrollerRef],
	)
}
