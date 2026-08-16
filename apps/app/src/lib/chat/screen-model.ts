import type {
	AgentActivityStatus,
	AgentActivityStep,
	AgentStepStatus,
} from "@workspace/ui/components/agent-activity"
import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import type { ChatEmptyStateStatus } from "@workspace/ui/components/chat-empty-state"

import { type ChatState, isTurnBusy } from "./chat-state"

import type {
	ActivityEvent,
	ActivityStatus,
	ChatMessage,
	ConnectionState,
	MessageCompletion,
	MessageRole,
	TransportError,
	TurnState,
} from "../claude/contract"

/** One bubble in the transcript. An answer is published paragraph by paragraph,
 * so a long reply reads as a run of messages rather than one growing block. */
export type TranscriptRow = {
	id: string
	messageId: string
	role: MessageRole
	text: string
	completion: MessageCompletion
	/** The whole message, set on its closing row so a copy takes the answer
	 * entire rather than the paragraph the reader happened to hover. */
	copyText?: string
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
	noActiveTurn: false,
	unknownPermission: false,
	writeFailed: false,
}

const PARAGRAPH_BREAK = /\n{2,}/

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

/** Paragraphs the bot has finished. A live answer keeps its trailing text
 * private until a blank line closes it, so nothing is published mid-sentence. */
function toParagraphs(text: string, streaming: boolean): string[] {
	const parts = text.split(PARAGRAPH_BREAK)
	const closed = streaming ? parts.slice(0, -1) : parts
	return closed.map((part) => part.trim()).filter((part) => part.length > 0)
}

function toRow(
	message: ChatMessage,
	fields: Pick<TranscriptRow, "text" | "completion" | "copyText"> & {
		index?: number
	},
): TranscriptRow {
	const { index, ...rest } = fields
	return {
		id: index === undefined ? message.id : `${message.id}#${index}`,
		messageId: message.id,
		role: message.role,
		...rest,
	}
}

function assistantRows(message: ChatMessage): TranscriptRow[] {
	const streaming = message.completion === "streaming"
	const paragraphs = toParagraphs(message.text, streaming)

	if (paragraphs.length === 0) {
		// A turn stopped or failed before its first paragraph still has to say so.
		return streaming || message.completion === "complete"
			? []
			: [toRow(message, { index: 0, text: "", completion: message.completion })]
	}

	return paragraphs.map((text, index) => {
		const closes = index === paragraphs.length - 1 && !streaming
		return toRow(message, {
			index,
			text,
			completion: closes ? message.completion : "complete",
			copyText: closes ? message.text.trim() : undefined,
		})
	})
}

/** Rows keyed by the message they came from. The reducer replaces only the
 * message a delta touched, so every other row keeps its identity and the
 * memoised transcript rows stay put through a stream. */
const rowsByMessage = new WeakMap<ChatMessage, TranscriptRow[]>()

export function toTranscriptRows(messages: ChatMessage[]): TranscriptRow[] {
	return messages.flatMap((message) => {
		const cached = rowsByMessage.get(message)
		if (cached) {
			return cached
		}
		const rows =
			message.role === "user"
				? [
						toRow(message, {
							text: message.text,
							completion: message.completion,
						}),
					]
				: assistantRows(message)
		rowsByMessage.set(message, rows)
		return rows
	})
}

/** Consecutive rows from the same speaker, so the screen can tie them into one
 * block and give the whole run a single avatar. */
export function toRuns(rows: TranscriptRow[]): TranscriptRow[][] {
	const runs: TranscriptRow[][] = []
	for (const row of rows) {
		const current = runs.at(-1)
		if (current && current[0].role === row.role) {
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
 * one the reader is waiting on. */
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

	const writing = state.messages.some(
		(message) => message.completion === "streaming" && message.text.length > 0,
	)
	return { kind: writing ? "writing" : "thinking" }
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
		return "Previous conversation not restored"
	}
	if (needsFreshSession(error)) {
		return "Claude Code is unavailable"
	}
	return "That request did not go through"
}
