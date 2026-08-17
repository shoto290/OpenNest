import type {
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
} from "../claude/contract"

export type ChatDriverUnsubscribe = () => void

/** Claude runtime control and nothing else. The transcript is not on it: what was
 * said is read from and written to the durable store, while `session.json` stays
 * the legacy import's business alone. */
export type ChatDriver = {
	check: () => Promise<CheckReport>
	startOrResumeSession: (resume?: string, cwd?: string) => Promise<SessionHandle>
	submitPrompt: (text: string) => Promise<void>
	cancelTurn: () => Promise<void>
	respondToPermission: (id: string, decision: PermissionDecision) => Promise<void>
	shutdown: () => Promise<void>
	subscribe: (onEvent: (event: ClaudeEvent) => void) => Promise<ChatDriverUnsubscribe>
}
