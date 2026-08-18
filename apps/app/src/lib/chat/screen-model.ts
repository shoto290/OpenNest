import type {
	AgentActivityStatus,
	AgentActivityStep,
	AgentStepStatus,
} from "@workspace/ui/components/agent-activity"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import type { ChatEmptyStateStatus } from "@workspace/ui/components/chat-empty-state"
import type { ChatTurnState } from "@workspace/ui/components/chat-turn"

import { type ChatState, isTurnBusy } from "./chat-state"
import { toPublishedBlocks } from "./markdown-blocks"

import type {
	ActivityEvent,
	ActivityStatus,
	ConnectionState,
	TransportError,
	TurnState,
} from "../claude/contract"
import type {
	TranscriptCompletion,
	TranscriptMessage,
	TranscriptRole,
} from "../conversations/transcript-contract"
import { isTerminalCompletion } from "../conversations/transcript-state"

/** One bubble in the transcript. An answer is published markdown block by
 * markdown block, so a long reply reads as a run of messages rather than one
 * growing block. */
export type TranscriptRow = {
	id: string
	messageId: string
	role: TranscriptRole
	text: string
	timestamp: number
	completion: ChatTurnState
}

/** How a stored ending reads on screen. `pending` is a message the store has a
 * place for and no words yet, so it reads as one still being written. A stream
 * the process died under has no state of its own here and borrows the stopped
 * one: the turn ended early either way, and the reader is not told it failed. */
const TURN_STATE: Record<TranscriptCompletion, ChatTurnState> = {
	pending: "streaming",
	streaming: "streaming",
	complete: "complete",
	cancelled: "cancelled",
	failed: "failed",
	interrupted: "cancelled",
}

/** What the bot is busy with, and what it is busy on. */
export type WorkingState = {
	kind: BotWorkingKind
	label?: string
}

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
	resumeFailed: false,
	invalidFrame: false,
	turnAlreadyRunning: false,
	transitionInProgress: false,
	noActiveTurn: false,
	// The run the caller named is gone, but the one that replaced it is the
	// session this launch is already on: nothing to recover, and a setup card
	// offered here would be about a process nobody is waiting for.
	staleRuntimeSession: false,
	unknownPermission: false,
	writeFailed: false,
}

const RUN_GAP_MS = 5 * 60_000

/** Tools that read rather than change something, keyed by the leading word of
 * the activity title. Anything else is plain work. */
const SEARCH_TOOLS = new Set([
	"glob",
	"grep",
	"ls",
	"read",
	"webfetch",
	"websearch",
])

const WRITE_TOOLS = new Set(["edit", "multiedit", "notebookedit", "write"])

function toRow(
	message: TranscriptMessage,
	fields: Pick<TranscriptRow, "text" | "completion"> & {
		index?: number
	},
): TranscriptRow {
	const { index, ...rest } = fields
	return {
		id: index === undefined ? message.id : `${message.id}#${index}`,
		messageId: message.id,
		role: message.role,
		timestamp: message.createdAt,
		...rest,
	}
}

function assistantRows(message: TranscriptMessage): TranscriptRow[] {
	const unfinished = !isTerminalCompletion(message.completion)
	const ending = TURN_STATE[message.completion]
	const blocks = toPublishedBlocks(message.content, unfinished)

	if (blocks.length === 0) {
		// A turn stopped or failed before its first block still has to say so.
		return unfinished || ending === "complete"
			? []
			: [toRow(message, { index: 0, text: "", completion: ending })]
	}

	return blocks.map((text, index) => {
		const closes = index === blocks.length - 1 && !unfinished
		return toRow(message, {
			index,
			text,
			completion: closes ? ending : "complete",
		})
	})
}

/** Rows keyed by the message they came from. The reducer replaces only the
 * message a delta touched, so every other row keeps its identity and the
 * memoised transcript rows stay put through a stream. */
const rowsByMessage = new WeakMap<TranscriptMessage, TranscriptRow[]>()

export function toTranscriptRows(
	messages: TranscriptMessage[],
): TranscriptRow[] {
	return messages.flatMap((message) => {
		const cached = rowsByMessage.get(message)
		if (cached) {
			return cached
		}
		const rows =
			message.role === "user"
				? [
						toRow(message, {
							text: message.content,
							completion: TURN_STATE[message.completion],
						}),
					]
				: assistantRows(message)
		rowsByMessage.set(message, rows)
		return rows
	})
}

/** Consecutive rows from the same speaker sent close in time, so the screen can
 * tie them into one block and give the whole run a single avatar. A pause longer
 * than RUN_GAP_MS reads as a new thought, so it opens a new block. */
export function toRuns(rows: TranscriptRow[]): TranscriptRow[][] {
	const runs: TranscriptRow[][] = []
	for (const row of rows) {
		const current = runs.at(-1)
		const previous = current?.at(-1)
		if (
			current &&
			previous &&
			previous.role === row.role &&
			row.timestamp - previous.timestamp <= RUN_GAP_MS
		) {
			current.push(row)
		} else {
			runs.push([row])
		}
	}
	return runs
}

function kindForTool(title: string): BotWorkingKind {
	const tool = title.split(/[\s·:(]/, 1)[0].toLowerCase()
	if (SEARCH_TOOLS.has(tool)) return "searching"
	if (WRITE_TOOLS.has(tool)) return "writing"
	return "working"
}

/** What to show while the turn runs. The newest unfinished step wins: it is the
 * one the reader is waiting on. An answer that has landed holds the writing pose
 * until the turn ends: a settled message with the turn still running is the turn
 * winding down, not fresh thinking, and falling back would flick the sidebar to
 * "thinking" for one frame at the end of every turn. */
export function workingStateFor(state: ChatState): WorkingState | null {
	if (!isTurnBusy(state.turn)) {
		return null
	}
	if (state.permission) {
		return { kind: "waiting", label: state.permission.title }
	}

	const active = state.activities.findLast(
		(activity) =>
			activity.status === "running" || activity.status === "pending",
	)
	if (active) {
		return { kind: kindForTool(active.title), label: active.title || undefined }
	}

	const latest = state.messages.at(-1)
	const isWriting = latest?.role === "assistant" && latest.content.length > 0
	return { kind: isWriting ? "writing" : "thinking" }
}

/** Whether the sidebar shows the bot as busy, and with what. A pending
 * permission counts as busy: the turn is waiting on the reader, not over. */
export type SidebarActivity = {
	isWorking: boolean
	kind?: BotWorkingKind
}

export function sidebarActivityFor(state: ChatState): SidebarActivity {
	const working = workingStateFor(state)
	if (!working) {
		return { isWorking: false }
	}
	return { isWorking: true, kind: working.kind }
}

/** The reply still streaming is skipped: the sidebar hides its row while the
 * turn works, so trimming a growing answer on every delta is dead work that
 * churns a fresh string per token and defeats the row's memo. Holding the last
 * settled reply keeps the value stable for the whole turn. */
export function lastAssistantTextFor(state: ChatState): string | undefined {
	const latest = state.messages.findLast(
		(message) =>
			message.role === "assistant" && isTerminalCompletion(message.completion),
	)
	return latest?.content.trim() || undefined
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
	if (error.kind === "resumeFailed") {
		return "Previous conversation could not be resumed"
	}
	if (needsFreshSession(error)) {
		return "Claude Code is unavailable"
	}
	return "That request did not go through"
}
