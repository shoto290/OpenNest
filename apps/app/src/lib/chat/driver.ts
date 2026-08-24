import type { SubmittedAttachment } from "./attachments-contract"

import type {
	CheckReport,
	PermissionDecision,
	QuestionAnswers,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
} from "../agent/contract"

export type ChatDriverUnsubscribe = () => void

export type ChatDriver = {
	check: (scope: RuntimeScope | null) => Promise<CheckReport>
	startOrResumeSession: (
		scope: RuntimeScope,
		resume?: string,
		cwd?: string,
	) => Promise<SessionHandle>
	submitPrompt: (scope: RuntimeScope, text: string) => Promise<void>
	storeAttachments: (
		conversationId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	cancelTurn: (scope: RuntimeScope) => Promise<void>
	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => Promise<void>
	answerQuestion: (
		scope: RuntimeScope,
		id: string,
		answers: QuestionAnswers,
		annotations?: Record<string, unknown>,
	) => Promise<void>
	shutdown: (scope: RuntimeScope) => Promise<void>
	subscribe: (
		onEvent: (event: ScopedEvent) => void,
	) => Promise<ChatDriverUnsubscribe>
}
