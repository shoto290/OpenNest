import type { MessageAuthor } from "@workspace/ui/components/message"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import {
	ToolQuestion,
	type ToolQuestionItem,
} from "@workspace/ui/components/tool-question"
import { AssistantTurn } from "@workspace/ui/components/turn"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type {
	AskedQuestion,
	PermissionDecision,
	PermissionRequest,
	QuestionAnswers,
	QuestionRequest,
} from "@/lib/agent/contract"
import type { PendingPrompt } from "@/lib/conversations/conversation-controller"

export type PromptResponder = {
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
}

type ApprovalPromptProps = {
	request: PermissionRequest
	responder: PromptResponder
}

export const ApprovalPrompt = ({ request, responder }: ApprovalPromptProps) => {
	const t = useChatCopy()
	const isShell = request.toolName === "Bash"

	return (
		<ToolApproval
			description={t("screen.permission.description")}
			onAllowOnce={() => {
				void responder.respond(request.id, "allowOnce")
			}}
			onDeny={() => {
				void responder.respond(request.id, "deny")
			}}
			parameters={
				request.detail && !isShell
					? [
							{
								id: "path",
								label: t("screen.permission.path"),
								value: request.detail,
							},
						]
					: []
			}
			title={request.title}
			tool={request.toolName}
		>
			{request.detail && isShell ? (
				<ToolApprovalCode code={request.detail} />
			) : null}
		</ToolApproval>
	)
}

const toQuestionItem = (asked: AskedQuestion): ToolQuestionItem => ({
	question: asked.question,
	header: asked.header,
	multiSelect: asked.multiSelect,
	options: asked.options.map((option) => ({
		label: option.label,
		description: option.description ?? "",
		preview: option.preview ?? undefined,
	})),
})

type QuestionPromptProps = {
	request: QuestionRequest
	responder: PromptResponder
}

export const QuestionPrompt = ({ request, responder }: QuestionPromptProps) => (
	<ToolQuestion
		onAnswer={(answers) => {
			void responder.answer(request.id, answers)
		}}
		onDeny={() => {
			void responder.respond(request.id, "deny")
		}}
		questions={request.questions.map(toQuestionItem)}
	/>
)

type SpokenPromptProps = {
	prompt: PendingPrompt
	author?: MessageAuthor
	responder: PromptResponder
}

export const SpokenPrompt = ({
	prompt,
	author,
	responder,
}: SpokenPromptProps) => (
	<AssistantTurn author={author} bare>
		{prompt.kind === "question" ? (
			<QuestionPrompt request={prompt.request} responder={responder} />
		) : (
			<ApprovalPrompt request={prompt.request} responder={responder} />
		)}
	</AssistantTurn>
)
