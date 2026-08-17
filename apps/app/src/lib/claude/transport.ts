import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ChatDriver } from "../chat/driver"
import type {
	CheckReport,
	PermissionDecision,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
} from "./contract"

const EVENT_CHANNEL = "claude://event"

export const claudeTransport: ChatDriver = {
	check: (scope: RuntimeScope | null) =>
		invoke<CheckReport>("claude_check", { scope }),

	startOrResumeSession: (scope: RuntimeScope, resume?: string, cwd?: string) =>
		invoke<SessionHandle>("claude_start_or_resume_session", {
			scope,
			resume: resume ?? null,
			cwd: cwd ?? null,
		}),

	submitPrompt: (scope: RuntimeScope, text: string) =>
		invoke<void>("claude_submit_prompt", { scope, text }),

	cancelTurn: (scope: RuntimeScope) =>
		invoke<void>("claude_cancel_turn", { scope }),

	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => invoke<void>("claude_respond_to_permission", { scope, id, decision }),

	shutdown: (scope: RuntimeScope) => invoke<void>("claude_shutdown", { scope }),

	subscribe: (onEvent: (event: ScopedEvent) => void) =>
		listen<ScopedEvent>(EVENT_CHANNEL, ({ payload }) => onEvent(payload)),
}
