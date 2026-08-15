import type {
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
} from "../claude/contract"

export type ChatDriverUnsubscribe = () => void

export type ChatDriver = {
	check: () => Promise<CheckReport>
	startOrResumeSession: (resume?: string, cwd?: string) => Promise<SessionHandle>
	submitPrompt: (text: string) => Promise<void>
	cancelTurn: () => Promise<void>
	respondToPermission: (id: string, decision: PermissionDecision) => Promise<void>
	shutdown: () => Promise<void>
	subscribe: (onEvent: (event: ClaudeEvent) => void) => Promise<ChatDriverUnsubscribe>
}
