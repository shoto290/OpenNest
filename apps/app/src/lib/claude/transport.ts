import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ChatDriver } from "../chat/driver"
import type {
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
	SessionSnapshot,
} from "./contract"

const EVENT_CHANNEL = "claude://event"

export const claudeTransport: ChatDriver = {
	check: () => invoke<CheckReport>("claude_check"),

	startOrResumeSession: (resume?: string, cwd?: string) =>
		invoke<SessionHandle>("claude_start_or_resume_session", {
			resume: resume ?? null,
			cwd: cwd ?? null,
		}),

	loadSession: () => invoke<SessionSnapshot>("claude_load_session"),

	saveSession: (snapshot: SessionSnapshot) =>
		invoke<void>("claude_save_session", { snapshot }),

	submitPrompt: (text: string) => invoke<void>("claude_submit_prompt", { text }),

	cancelTurn: () => invoke<void>("claude_cancel_turn"),

	respondToPermission: (id: string, decision: PermissionDecision) =>
		invoke<void>("claude_respond_to_permission", { id, decision }),

	shutdown: () => invoke<void>("claude_shutdown"),

	subscribe: (onEvent: (event: ClaudeEvent) => void) =>
		listen<ClaudeEvent>(EVENT_CHANNEL, ({ payload }) => onEvent(payload)),
}
