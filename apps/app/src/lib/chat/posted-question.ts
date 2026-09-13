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
	afterSeq: number
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

const rowsOf = ({ asking, answered }: PostedQuestion): TranscriptDraft[] =>
	answered ? [asking, answered] : [asking]

const rowsByAnchor = (
	posted: PostedQuestion[],
): Map<number, TranscriptDraft[]> => {
	const anchored = new Map<number, TranscriptDraft[]>()
	for (const question of posted) {
		const earlier = anchored.get(question.afterSeq) ?? []
		anchored.set(question.afterSeq, [...earlier, ...rowsOf(question)])
	}
	return anchored
}

const placedAfter = (
	afterSeq: number,
	rows: TranscriptDraft[],
): TranscriptMessage[] =>
	rows.map((row, index) => ({
		...row,
		seq: afterSeq + (index + 1) / (rows.length + 1),
	}))

export const withPostedRows = (
	messages: TranscriptMessage[],
	posted: PostedQuestion[],
): TranscriptMessage[] => {
	if (posted.length === 0) {
		return messages
	}
	const placed = [...rowsByAnchor(posted)].flatMap(([afterSeq, rows]) =>
		placedAfter(afterSeq, rows),
	)
	return [...messages, ...placed].sort((one, other) => one.seq - other.seq)
}
