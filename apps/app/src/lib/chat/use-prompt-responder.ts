import { type RefObject, useMemo } from "react"

import type { TranscriptHandle } from "@workspace/ui/components/transcript"

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
	scrollerRef: RefObject<TranscriptHandle | null>,
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
