import type {
	AgentActivityStatus,
	AgentActivityStep,
	AgentStepStatus,
} from "@workspace/ui/components/agent-activity"
import type { ChatEmptyStateStatus } from "@workspace/ui/components/chat-empty-state"

import { isTurnBusy } from "./chat-state"

import type {
	ActivityEvent,
	ActivityStatus,
	ConnectionState,
	TransportError,
	TurnState,
} from "../claude/contract"

const STEP_STATUS: Record<ActivityStatus, AgentStepStatus> = {
	pending: "pending",
	running: "active",
	succeeded: "complete",
	failed: "complete",
}

/** Errors that leave no usable session behind, so only a fresh preflight recovers.
 * Keyed by kind so a new transport error cannot silently default to recoverable. */
const SESSION_ENDING: Record<TransportError["kind"], boolean> = {
	binaryNotFound: true,
	notAuthenticated: true,
	authCheckFailed: true,
	spawnFailed: true,
	startupTimeout: true,
	crashed: true,
	notStarted: true,
	invalidFrame: false,
	turnAlreadyRunning: false,
	noActiveTurn: false,
	unknownPermission: false,
	writeFailed: false,
}

export function toActivityItems(
	activities: ActivityEvent[],
): AgentActivityStep[] {
	return activities.map((activity) => ({
		id: activity.id,
		type: "step",
		label: activity.title || activity.kind,
		status: STEP_STATUS[activity.status],
		meta: activity.status === "failed" ? "Failed" : undefined,
	}))
}

/** The log spans the whole session, so only the latest turn decides the header.
 * A tool that failed earlier stays marked on its own row. */
export function activityStatusFor(turn: TurnState): AgentActivityStatus {
	if (isTurnBusy(turn)) {
		return "working"
	}
	return turn === "failed" ? "failed" : "complete"
}

export function emptyStateStatusFor(
	connection: ConnectionState,
): ChatEmptyStateStatus | null {
	if (connection === "checking") {
		return null
	}
	return connection === "ready" ? "ready" : "unavailable"
}

export function needsFreshSession(error: TransportError): boolean {
	return SESSION_ENDING[error.kind]
}

export function noticeTitleFor(error: TransportError): string {
	if (error.kind === "crashed") {
		return "Claude Code stopped"
	}
	if (needsFreshSession(error)) {
		return "Claude Code is unavailable"
	}
	return "That request did not go through"
}
