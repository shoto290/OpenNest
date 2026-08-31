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
	PermissionRequest,
	QuestionRequest,
} from "@/lib/agent/contract"
import type { PromptResponder } from "@/lib/chat/use-prompt-responder"

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

type SpokenApprovalProps = {
	request: PermissionRequest
	author?: MessageAuthor
	responder: PromptResponder
}

export const SpokenApproval = ({
	request,
	author,
	responder,
}: SpokenApprovalProps) => (
	<AssistantTurn author={author} bare>
		<ApprovalPrompt request={request} responder={responder} />
	</AssistantTurn>
)
