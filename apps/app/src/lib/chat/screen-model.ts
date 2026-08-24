import type { BotWorkingKind } from "@workspace/ui/components/bot-working"
import type { ChatEmptyStateStatus } from "@workspace/ui/components/chat-empty-state"
import type { ChatTurnState } from "@workspace/ui/components/chat-turn"
import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { type ChatState, isTurnBusy } from "./chat-state"
import { toPublishedBlocks } from "./markdown-blocks"
import { messageWithAttachments } from "./message-attachments"

import type { ConnectionState, TransportError } from "../agent/contract"
import type { MessageReference } from "../conversations/store-contract"
import type {
	TranscriptCompletion,
	TranscriptMessage,
	TranscriptRole,
} from "../conversations/transcript-contract"
import { isTerminalCompletion } from "../conversations/transcript-state"

export type TranscriptRow = {
	id: string
	messageId: string
	quotedMessageId: string | null
	role: TranscriptRole
	text: string
	timestamp: number
	completion: ChatTurnState
}

const TURN_STATE: Record<TranscriptCompletion, ChatTurnState> = {
	pending: "streaming",
	streaming: "streaming",
	complete: "complete",
	cancelled: "cancelled",
	failed: "failed",
	interrupted: "cancelled",
}

export type WorkingState = {
	kind: BotWorkingKind
	label?: string
}

const SESSION_ENDING: Record<TransportError["kind"], boolean> = {
	binaryNotFound: true,
	notAuthenticated: true,
	authCheckFailed: true,
	spawnFailed: true,
	startupTimeout: true,
	crashed: true,
	notStarted: true,
	resumeFailed: false,
	workingDirectoryRefused: false,
	invalidFrame: false,
	turnAlreadyRunning: false,
	transitionInProgress: false,
	noActiveTurn: false,
	staleRuntimeSession: false,
	unknownPermission: false,
	writeFailed: false,
}

const RUN_GAP_MS = 5 * 60_000

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
		quotedMessageId:
			message.role === "user" ? message.repliedToMessageId : null,
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

export type ReplyTarget = {
	messageId: string
	role: TranscriptRole
	excerpt: string
}

const targetsByMessage = new WeakMap<TranscriptMessage, ReplyTarget>()

export function replyTargetOf(message: TranscriptMessage): ReplyTarget {
	const held = targetsByMessage.get(message)
	if (held) {
		return held
	}
	const target: ReplyTarget = {
		messageId: message.id,
		role: message.role,
		excerpt: messageWithAttachments(message.content).text.trim(),
	}
	targetsByMessage.set(message, target)
	return target
}

export function replyTargetOfReference(
	reference: MessageReference,
): ReplyTarget {
	return {
		messageId: reference.messageId,
		role: reference.role,
		excerpt: reference.excerpt,
	}
}

export function quotedMessageIdsIn(messages: TranscriptMessage[]): string[] {
	const ids = new Set<string>()
	for (const message of messages) {
		if (message.role === "user" && message.repliedToMessageId) {
			ids.add(message.repliedToMessageId)
		}
	}
	return [...ids]
}

export function quotedTargetsIn(
	messages: TranscriptMessage[],
	wanted: string[],
): Map<string, ReplyTarget> {
	const asked = new Set(wanted)
	const found = new Map<string, ReplyTarget>()
	for (const message of messages) {
		if (asked.has(message.id)) {
			found.set(message.id, replyTargetOf(message))
		}
	}
	return found
}

export type MessageAnchors = {
	group?: string
	rows: ReadonlySet<string>
}

const NO_ANCHORED_ROWS: ReadonlySet<string> = new Set()

export function messageAnchorsIn(run: TranscriptRow[]): MessageAnchors {
	const [first] = run
	if (run.every((row) => row.messageId === first.messageId)) {
		return { group: first.messageId, rows: NO_ANCHORED_ROWS }
	}
	const rows = new Set<string>()
	run.forEach((row, index) => {
		if (run[index - 1]?.messageId !== row.messageId) {
			rows.add(row.id)
		}
	})
	return { rows }
}

function kindForTool(title: string): BotWorkingKind {
	const tool = title.split(/[\s·:(]/, 1)[0].toLowerCase()
	if (SEARCH_TOOLS.has(tool)) return "searching"
	if (WRITE_TOOLS.has(tool)) return "writing"
	return "working"
}

export function workingStateFor(state: ChatState): WorkingState | null {
	if (!isTurnBusy(state.turn)) {
		return null
	}
	if (state.question) {
		return { kind: "waiting", label: state.question.questions[0]?.header }
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

export function noticeTitleFor(t: ChatCopy, error: TransportError): string {
	if (error.kind === "crashed") {
		return t("screen.notice.crashed")
	}
	if (error.kind === "resumeFailed") {
		return t("screen.notice.resumeFailed")
	}
	if (error.kind === "workingDirectoryRefused") {
		return t("screen.notice.workingDirectoryRefused")
	}
	if (needsFreshSession(error)) {
		return t("screen.notice.unavailable")
	}
	return t("screen.notice.failed")
}
