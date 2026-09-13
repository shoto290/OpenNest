import { questionMessageIdOf, questionMessageText } from "./question-message"

import type { QuestionAnswers, QuestionRequest } from "../agent/contract"
import type {
	TranscriptDraft,
	TranscriptMessage,
} from "../conversations/transcript-contract"

export type PostedAnswerHandler = (answers: QuestionAnswers) => Promise<void>

export type PostedQuestion = {
	request: QuestionRequest
	onAnswers: PostedAnswerHandler
	conversationId: string
	asking: TranscriptDraft
	answered: TranscriptDraft | null
}

type AskingInput = {
	request: QuestionRequest
	conversationId: string
	authorBotId: string
	createdAt: number
}

type AnsweredInput = {
	id: string
	asking: TranscriptDraft
	content: string
	createdAt: number
}

export const askingRow = ({
	request,
	conversationId,
	authorBotId,
	createdAt,
}: AskingInput): TranscriptDraft => ({
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

export const answeredRow = ({
	id,
	asking,
	content,
	createdAt,
}: AnsweredInput): TranscriptDraft => ({
	id,
	conversationId: asking.conversationId,
	turnId: asking.turnId,
	role: "user",
	content,
	completion: "complete",
	createdAt,
	authorBotId: null,
	repliedToMessageId: asking.id,
	runtimeSessionId: null,
})

export const rowsOf = ({
	asking,
	answered,
}: PostedQuestion): TranscriptDraft[] =>
	answered ? [asking, answered] : [asking]

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
