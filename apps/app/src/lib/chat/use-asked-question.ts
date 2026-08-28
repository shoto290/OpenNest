import type { QuotedMessage } from "@workspace/ui/components/message-quote"

import { questionMessageIdOf } from "./question-message"
import type { ReplyTarget } from "./screen-model"
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
	const isInView = useBubbleVisibility(asking?.id ?? null)

	if (!question || !asking) {
		return NOTHING_ASKED
	}

	return {
		asked: { messageId: asking.id, request: question },
		recall: isInView
			? undefined
			: toQuote({
					messageId: asking.id,
					role: "assistant",
					excerpt: question.questions[0]?.question ?? "",
					authorBotId: asking.authorBotId,
				}),
	}
}
