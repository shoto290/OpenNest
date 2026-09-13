const NOT_RUNNING = "notRunning"

const NO_REASON = "the agent gave no reason"

const SENTENCE_OF: Record<string, string> = {
	alreadyRunning: "a sign-in is already running",
	notRunning: "no sign-in is running",
	cancelled: "the sign-in was cancelled",
	timedOut: "the sign-in timed out",
	refusedUrl: "the sign-in link was refused",
	flowTimedOut: "the sign-in flow timed out",
	notAuthenticated: "no Claude account is signed in",
	binaryNotFound: "the agent binary was not found",
	spawnFailed: "the agent could not be started",
	startupTimeout: "the agent did not start in time",
	crashed: "the agent stopped",
	unknownSpace: "the roster is in no space",
}

const fieldIn = (reason: unknown, field: string): string | null => {
	if (typeof reason !== "object" || reason === null || !(field in reason)) {
		return null
	}
	const value = (reason as Record<string, unknown>)[field]
	return typeof value === "string" ? value : null
}

export const isNotRunning = (reason: unknown): boolean =>
	fieldIn(reason, "kind") === NOT_RUNNING

export const exitDetailOf = (reason: unknown): string => {
	const detail = fieldIn(reason, "detail")
	if (detail) {
		return detail
	}
	const kind = fieldIn(reason, "kind")
	if (kind) {
		return SENTENCE_OF[kind] ?? NO_REASON
	}
	return reason instanceof Error ? reason.message : NO_REASON
}
