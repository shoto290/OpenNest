import type {
	CheckReport,
	ClaudeEvent,
	PermissionDecision,
	SessionHandle,
	SessionSnapshot,
} from "../claude/contract"

export type ChatDriverUnsubscribe = () => void

export type ChatDriver = {
	check: () => Promise<CheckReport>
	startOrResumeSession: (resume?: string, cwd?: string) => Promise<SessionHandle>
	loadSession: () => Promise<SessionSnapshot>
	saveSession: (snapshot: SessionSnapshot) => Promise<void>
	submitPrompt: (text: string) => Promise<void>
	cancelTurn: () => Promise<void>
	respondToPermission: (id: string, decision: PermissionDecision) => Promise<void>
	shutdown: () => Promise<void>
	subscribe: (onEvent: (event: ClaudeEvent) => void) => Promise<ChatDriverUnsubscribe>
}
