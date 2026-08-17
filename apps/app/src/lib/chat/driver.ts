import type {
	CheckReport,
	PermissionDecision,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
} from "../claude/contract"

export type ChatDriverUnsubscribe = () => void

/** Claude runtime control and nothing else. The transcript is not on it: what was
 * said is read from and written to the durable store, while `session.json` stays
 * the legacy import's business alone.
 *
 * Every call names the run it is about, and every event says which run it came
 * from. The host holds one process, so a command that does not name it is a
 * command aimed at whatever happens to be running — which after a restart is
 * somebody else's session. The check is the one exception and takes the run the
 * caller holds, `null` before there is one: it asks about the install, and only
 * echoes the scope so its answer can be compared like any other. */
export type ChatDriver = {
	check: (scope: RuntimeScope | null) => Promise<CheckReport>
	startOrResumeSession: (
		scope: RuntimeScope,
		resume?: string,
		cwd?: string,
	) => Promise<SessionHandle>
	submitPrompt: (scope: RuntimeScope, text: string) => Promise<void>
	cancelTurn: (scope: RuntimeScope) => Promise<void>
	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => Promise<void>
	shutdown: (scope: RuntimeScope) => Promise<void>
	subscribe: (onEvent: (event: ScopedEvent) => void) => Promise<ChatDriverUnsubscribe>
}
