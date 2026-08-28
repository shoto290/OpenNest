import type { QuotedMessage } from "@workspace/ui/components/message-quote"

import { questionMessageIdOf } from "./question-message"
import { bubbleIdOf, bubbleOf, type ReplyTarget } from "./screen-model"
import { useBubbleVisibility } from "./use-bubble-visibility"

import type { QuestionRequest } from "../agent/contract"
import type { TranscriptMessage } from "../conversations/transcript-contract"

export type AskedBubble = {
	messageId: string
	request: QuestionRequest
}

export type AskedQuestion = {
	asked: AskedBubble | null
	recall?: QuotedMessage
}

type AskedQuestionInput = {
	question: QuestionRequest | null
	messages: TranscriptMessage[]
	toQuote: (target: ReplyTarget) => QuotedMessage
}

const NOTHING_ASKED: AskedQuestion = { asked: null }

const anchorOf = (message: TranscriptMessage): string | null => {
	const bubble = bubbleOf(message, 0)
	return bubble ? bubbleIdOf(bubble.messageId, bubble.blockIndex) : null
}

export function useAskedQuestion({
	question,
	messages,
	toQuote,
}: AskedQuestionInput): AskedQuestion {
	const asking = question
		? messages.findLast(
				(message) => message.id === questionMessageIdOf(question.id),
			)
		: undefined
	const anchor = asking ? anchorOf(asking) : null
	const isInView = useBubbleVisibility(anchor)

	if (!question || !asking || !anchor) {
		return NOTHING_ASKED
	}

	return {
		asked: { messageId: asking.id, request: question },
		recall: isInView
			? undefined
			: toQuote({
					messageId: anchor,
					role: "assistant",
					excerpt: question.questions[0]?.question ?? "",
					authorBotId: asking.authorBotId,
				}),
	}
}
