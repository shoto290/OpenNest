import { questionMessageIdOf, questionMessageText } from "./question-message"

import type { QuestionAnswers, QuestionRequest } from "../agent/contract"
import type {
	TranscriptDraft,
	TranscriptMessage,
} from "../conversations/transcript-contract"

export type PostedAnswerHandler = (
	answers: QuestionAnswers,
) => Promise<void> | void

export type PostedQuestion = {
	request: QuestionRequest
	onAnswers: PostedAnswerHandler
	conversationId: string
	rows: TranscriptDraft[]
}

type PostedRowInput = {
	request: QuestionRequest
	conversationId: string
	authorBotId: string
	createdAt: number
}

type PostedAnswerInput = {
	id: string
	question: TranscriptDraft
	content: string
	createdAt: number
}

export const postedQuestionRow = ({
	request,
	conversationId,
	authorBotId,
	createdAt,
}: PostedRowInput): TranscriptDraft => ({
	id: questionMessageIdOf(request.id),
	conversationId,
	turnId: questionMessageIdOf(request.id),
	role: "assistant",
	content: questionMessageText(request),
	completion: "complete",
	createdAt,
	authorBotId,
	repliedToMessageId: null,
	runtimeSessionId: null,
})

export const postedAnswerRow = ({
	id,
	question,
	content,
	createdAt,
}: PostedAnswerInput): TranscriptDraft => ({
	id,
	conversationId: question.conversationId,
	turnId: question.turnId,
	role: "user",
	content,
	completion: "complete",
	createdAt,
	authorBotId: null,
	repliedToMessageId: question.id,
	runtimeSessionId: null,
})

export const withPostedRows = (
	messages: TranscriptMessage[],
	rows: TranscriptDraft[],
): TranscriptMessage[] => {
	if (rows.length === 0) {
		return messages
	}
	const lastSeq = messages.at(-1)?.seq ?? 0
	return [
		...messages,
		...rows.map((row, index) => ({ ...row, seq: lastSeq + index + 1 })),
	]
}
