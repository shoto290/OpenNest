import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type {
	CheckReport,
	PermissionDecision,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
} from "./contract"

import type { SubmittedAttachment } from "../chat/attachments-contract"
import type { ChatDriver } from "../chat/driver"

const EVENT_CHANNEL = "agent://event"

export const agentTransport: ChatDriver = {
	check: (scope: RuntimeScope | null) =>
		invoke<CheckReport>("agent_check", { scope }),

	startOrResumeSession: (scope: RuntimeScope, resume?: string, cwd?: string) =>
		invoke<SessionHandle>("agent_start_or_resume_session", {
			scope,
			resume: resume ?? null,
			cwd: cwd ?? null,
		}),

	submitPrompt: (scope: RuntimeScope, text: string) =>
		invoke<void>("agent_submit_prompt", { scope, text }),

	storeAttachments: (
		conversationId: string,
		attachments: SubmittedAttachment[],
	) =>
		invoke<string[]>("chat_store_attachments", {
			conversationId,
			attachments,
		}),

	cancelTurn: (scope: RuntimeScope) =>
		invoke<void>("agent_cancel_turn", { scope }),

	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => invoke<void>("agent_respond_to_permission", { scope, id, decision }),

	shutdown: (scope: RuntimeScope) => invoke<void>("agent_shutdown", { scope }),

	subscribe: (onEvent: (event: ScopedEvent) => void) =>
		listen<ScopedEvent>(EVENT_CHANNEL, ({ payload }) => onEvent(payload)),
}
