import type {
	AskedQuestion,
	QuestionAnswers,
	QuestionOption,
	QuestionRequest,
} from "../agent/contract"

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

const optionLine = ({ label, description }: QuestionOption): string =>
	description
		? `- ${oneLine(label)} — ${oneLine(description)}`
		: `- ${oneLine(label)}`

const askedLines = (asked: AskedQuestion): string[] => [
	`### ${oneLine(asked.question)}`,
	...asked.options.map(optionLine),
]

export const questionMessageIdOf = (requestId: string): string =>
	`question-${requestId}`

export const questionMessageText = (request: QuestionRequest): string =>
	request.questions.flatMap(askedLines).join("\n")

export const answersFromText = (
	request: QuestionRequest,
	text: string,
): QuestionAnswers => {
	const asked = request.questions[0]
	return asked ? { [asked.question]: text } : {}
}

export const answeredText = (
	request: QuestionRequest,
	answers: QuestionAnswers,
): string =>
	request.questions
		.flatMap(({ question }) => answers[question] || [])
		.join("\n\n")
