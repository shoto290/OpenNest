import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type {
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
} from "./contract"

const EVENT_CHANNEL = "claude://event"

export const claudeTransport = {
	check: () => invoke<CheckReport>("claude_check"),

	startOrResumeSession: (resume?: string, cwd?: string) =>
		invoke<SessionHandle>("claude_start_or_resume_session", {
			resume: resume ?? null,
			cwd: cwd ?? null,
		}),

	submitPrompt: (text: string) => invoke<void>("claude_submit_prompt", { text }),

	cancelTurn: () => invoke<void>("claude_cancel_turn"),

	respondToPermission: (id: string, decision: PermissionDecision) =>
		invoke<void>("claude_respond_to_permission", { id, decision }),

	sessionId: () => invoke<string | null>("claude_session_id"),

	shutdown: () => invoke<void>("claude_shutdown"),

	subscribe: (onEvent: (event: ClaudeEvent) => void) =>
		listen<ClaudeEvent>(EVENT_CHANNEL, ({ payload }) => onEvent(payload)),
}
