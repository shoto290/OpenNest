import {
	type ChatAction,
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isSameRuntimeScope,
	isTurnBusy,
} from "./chat-state"
import type { ChatDriver } from "./driver"

import type {
	ChatMessage,
	CheckReport,
	ClaudeEvent,
	MessageCompletion,
	PermissionDecision,
	RuntimeScope,
	SessionHandle,
	TransportError,
	TurnOutcome,
} from "../claude/contract"
import type { TranscriptStore } from "../conversations/store-port"
import type { TerminalCompletion } from "../conversations/transcript-contract"
import { createTranscriptController } from "../conversations/transcript-controller"
import {
	selectHasMore,
	selectMessages,
} from "../conversations/transcript-state"

export type ChatController = {
	getState: () => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	/** Checks the binary and opens a session when it answers. Deduplicated while in flight. */
	preflight: (resume?: string) => Promise<SessionHandle | null>
	/** Opens the stored conversation, paints its tail, then starts Claude. Sequential
	 * by construction: nothing may be written before the conversation it belongs to
	 * is on the record. The session itself is not resumed from disk — a provider
	 * session belongs to the launch that opened it. */
	boot: () => Promise<SessionHandle | null>
	/** Reopens the session for the reader after it died. Resumes the id this launch
	 * learned, so the answer carries on rather than starting Claude amnesiac. */
	restart: () => Promise<SessionHandle | null>
	/** Reads the page above the transcript. Deduplicated while in flight, and a
	 * no-op once the beginning has been reached. */
	loadOlder: () => Promise<void>
	send: (text: string) => Promise<void>
	stop: () => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

export type ChatControllerOptions = {
	/** Identity for the rows this launch writes. Ids reach a primary key, so they
	 * are unique per message and never derived from a position in the transcript. */
	newId?: () => string
	now?: () => number
}

/** The ending a message reaches when the process it was streaming from goes away.
 * Nothing observed it fail and nobody cancelled it — the stream simply stopped. */
const INTERRUPTED: TerminalCompletion = "interrupted"

/** What a live message state means once it can no longer change. `streaming` has
 * no ending, so a completion event still carrying it settles nothing. */
const ENDING_FOR: Record<MessageCompletion, TerminalCompletion | null> = {
	streaming: null,
	complete: "complete",
	cancelled: "cancelled",
	failed: "failed",
}

/** How a turn ending settles the reply it was streaming. */
const ENDING_FOR_OUTCOME: Record<TurnOutcome, TerminalCompletion> = {
	completed: "complete",
	cancelled: "cancelled",
	failed: "failed",
}

function toTransportError(reason: unknown): TransportError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as TransportError
	}
	return { kind: "writeFailed", detail: String(reason) }
}

/** A store refusal in the vocabulary the notice speaks. It is reported as a write
 * that did not land, which is what it is, and it carries the store's own word for
 * why — never a row's content. */
function toStoreError(reason: unknown): TransportError {
	const kind =
		typeof reason === "object" && reason !== null && "kind" in reason
			? String((reason as { kind: unknown }).kind)
			: String(reason)
	return {
		kind: "writeFailed",
		detail: `the transcript store refused it (${kind})`,
	}
}

export function createChatController(
	driver: ChatDriver,
	store: TranscriptStore,
	options: ChatControllerOptions = {},
): ChatController {
	const newId = options.newId ?? (() => crypto.randomUUID())
	const now = options.now ?? (() => Date.now())
	const transcript = createTranscriptController(store)

	let state = initialChatState
	let botId: string | null = null
	let activeTurn: { id: string; promptId: string } | null = null
	let detach: Promise<() => void> | null = null
	let pendingPreflight: Promise<SessionHandle | null> | null = null
	/** The replies this controller opened and has not settled, and how far each has
	 * streamed. A message leaves both the moment it ends, which is what makes a
	 * replayed ending, and every delta behind it, a no-op. */
	const openMessages = new Map<string, number>()
	const settledMessages = new Set<string>()
	const listeners = new Set<() => void>()

	/** Every write in the order it was issued. Two deltas racing on the same row
	 * would concatenate in whichever order the host answered, which is the one
	 * thing an append-only column cannot be asked to forgive. */
	let writes: Promise<unknown> = Promise.resolve()

	const dispatch = (action: ChatAction) => {
		const next = chatReducer(state, action)
		if (next === state) {
			return
		}
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	/** The controller speaking for the run it holds, in the vocabulary the host
	 * speaks: what it says about this launch's own session is scoped with it and
	 * meets the same gate as everything the session reports. */
	const announce = (event: ClaudeEvent) =>
		dispatch({ type: "driverEvent", scope: state.runtime, event })

	const report = (reason: unknown) =>
		announce({ type: "failed", error: toTransportError(reason) })

	const reportStore = (reason: unknown) =>
		announce({ type: "failed", error: toStoreError(reason) })

	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const result = writes.then(operation)
		writes = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}

	/** A write and what it lets the reader see, in that order. `shown` runs only
	 * once the store has taken the write, so nothing reaches the screen that a
	 * reload would not bring back; a refusal shows nothing and says so. Callbacks
	 * settle in the order their writes were issued, because each one is attached
	 * to its own link of the chain. */
	const write = (operation: () => Promise<unknown>, shown?: () => void) => {
		void enqueue(operation).then(() => shown?.(), reportStore)
	}

	const syncTranscript = () => {
		const conversationId = state.conversationId
		if (!conversationId) {
			return
		}
		const current = transcript.getState()
		dispatch({
			type: "transcriptChanged",
			messages: selectMessages(current, conversationId),
			hasOlder: selectHasMore(current, conversationId),
		})
	}

	transcript.subscribe(syncTranscript)

	/** Out-of-order and replayed deltas are dropped on the sequence the transport
	 * numbers them with, before either the store or the screen sees them. The
	 * bookkeeping stays here, ahead of the write: a duplicate has to be refused
	 * the moment it arrives, not once the store has answered the one before it. */
	const streamReply = (
		id: string,
		seq: number,
		text: string,
		conversationId: string,
	) => {
		const streamed = openMessages.get(id)
		if (streamed === undefined || seq <= streamed || text.length === 0) {
			return
		}
		openMessages.set(id, seq)
		write(
			() => store.appendText(id, text),
			() => transcript.stream({ conversationId, id, text }),
		)
	}

	const openReply = (message: ChatMessage, conversationId: string) => {
		const turn = activeTurn
		if (
			!turn ||
			openMessages.has(message.id) ||
			settledMessages.has(message.id)
		) {
			return
		}
		openMessages.set(message.id, 0)
		write(
			() =>
				store.openAssistantMessage({
					id: message.id,
					conversationId,
					turnId: turn.id,
					authorBotId: botId,
					repliedToMessageId: turn.promptId,
					createdAt: message.timestamp,
				}),
			() =>
				transcript.append({
					id: message.id,
					conversationId,
					turnId: turn.id,
					role: "assistant",
					content: "",
					completion: "streaming",
					createdAt: message.timestamp,
				}),
		)
		streamReply(message.id, 1, message.text, conversationId)
	}

	/** An ending is claimed here once and only once, so a replayed one and every
	 * delta behind it stop at the guard above. A store that refuses the ending
	 * leaves the message open on disk, and the screen shows it exactly that way:
	 * still unfinished, which is what the next launch will read back. */
	const settleReply = (
		id: string,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		if (!openMessages.has(id)) {
			return
		}
		openMessages.delete(id)
		settledMessages.add(id)
		write(
			() => store.finalizeMessage(id, completion),
			() => transcript.settle({ conversationId, id, completion }),
		)
	}

	/** The text a reply ends with is the text its deltas wrote: the column is
	 * append-only, so what has already landed is the answer, and the completion
	 * frame repeats it rather than adding to it. A reply that ends without ever
	 * having been opened is still a reply — it is opened on what it says, and
	 * closed in the same breath. */
	const settleCompleted = (message: ChatMessage, conversationId: string) => {
		const completion = ENDING_FOR[message.completion]
		if (!completion || settledMessages.has(message.id)) {
			return
		}
		openReply(message, conversationId)
		settleReply(message.id, completion, conversationId)
	}

	/** Copied before it is walked: settling a reply takes it out of the map. */
	const settleOpenReplies = (
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		for (const id of [...openMessages.keys()]) {
			settleReply(id, completion, conversationId)
		}
	}

	const endTurn = (completion: TerminalCompletion, conversationId: string) => {
		settleOpenReplies(completion, conversationId)
		const turn = activeTurn
		activeTurn = null
		if (turn) {
			write(() => store.completeTurn(turn.id, now()))
		}
	}

	/** The durable half of a transport event. Nothing here decides anything the
	 * reducer decides: it writes down what the session reported, in the order it
	 * reported it. */
	const persist = (event: ClaudeEvent) => {
		const conversationId = state.conversationId
		if (!conversationId) {
			return
		}
		switch (event.type) {
			case "messageStarted":
				return openReply(event.message, conversationId)
			case "messageDelta":
				return streamReply(event.id, event.seq, event.text, conversationId)
			case "messageCompleted":
				return settleCompleted(event.message, conversationId)
			case "turnEnded":
				return endTurn(ENDING_FOR_OUTCOME[event.ended.outcome], conversationId)
			default:
				return
		}
	}

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
	}

	/** Resolves once the subscription is live. Tauri registers listeners over IPC,
	 * so a command issued before this settles loses the events it emits.
	 *
	 * The run an event names is what decides, never the subscription it arrived on:
	 * a replaced session keeps streaming until its child is gone, and the host
	 * delivers on one channel. So the durable write is refused here on the same
	 * comparison the reducer makes for the screen — a frame from a run this
	 * controller no longer holds mutates neither. */
	const connect = () => {
		disconnect()
		detach = driver.subscribe(({ scope, event }) => {
			dispatch({ type: "driverEvent", scope, event })
			if (!isSameRuntimeScope(scope, state.runtime)) {
				return
			}
			persist(event)
		})
		return detach
	}

	const attach = () => {
		connect()
		return disconnect
	}

	const check = async () => {
		try {
			const result = await driver.check(state.runtime)
			dispatch({ type: "binaryVersion", version: result.binaryVersion })
			announce({ type: "connectionChanged", state: result.connection })
			if (result.error) {
				report(result.error)
			}
			return result
		} catch (reason) {
			report(reason)
			return null
		}
	}

	/** The run this launch is about to ask for a process, taken from the durable
	 * lineage: the row it opens rotates the one it replaces, and the number it comes
	 * back with is the epoch every command and event of that process is scoped by.
	 * Opened before the child rather than after, so a session that never comes up is
	 * still a run the record can name. */
	const openRun = async (
		conversationId: string,
		bot: string,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(conversationId, bot, now())
		return {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
	}

	/** A reply the session was streaming when it went away is closed as interrupted:
	 * nothing on disk can resume a stream, and it neither failed nor was cancelled.
	 * The turn it belonged to is left open on purpose — it never completed, and
	 * nothing is going to complete it.
	 *
	 * A process is never started unscoped: without a conversation and a bot there is
	 * no run to open, and a session nothing can attribute is one whose every event
	 * would be somebody's guess. So the reader is told the store is not answering
	 * instead of being handed an unattributable session. */
	const start = async (resume?: string) => {
		const conversationId = state.conversationId
		const bot = botId
		if (!conversationId || !bot) {
			reportStore({ kind: "unavailable" })
			return null
		}
		settleOpenReplies(INTERRUPTED, conversationId)
		activeTurn = null

		let runtime: RuntimeScope
		try {
			runtime = await openRun(conversationId, bot)
		} catch (reason) {
			reportStore(reason)
			return null
		}

		dispatch({ type: "sessionReset", runtime, sessionId: resume ?? null })
		try {
			if (detach) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(runtime, resume)
			dispatch({ type: "sessionOpened" })
			return handle
		} catch (reason) {
			report(reason)
			return null
		}
	}

	const runPreflight = async (resume?: string) => {
		const checked = await check()
		if (checked?.connection !== "ready") {
			return null
		}
		return start(resume)
	}

	const preflight = (resume?: string) => {
		pendingPreflight ??= runPreflight(resume).finally(() => {
			pendingPreflight = null
		})
		return pendingPreflight
	}

	const openConversation = async () => {
		try {
			const bot = await store.defaultBot()
			const chat = await store.mainChat(bot.id)
			botId = bot.id
			dispatch({ type: "conversationOpened", conversationId: chat.id })
			await transcript.load(chat.id)
		} catch (reason) {
			reportStore(reason)
		}
	}

	const boot = async () => {
		await openConversation()
		return preflight()
	}

	const restart = () => preflight(state.sessionId ?? undefined)

	const loadOlder = async () => {
		const conversationId = state.conversationId
		if (!conversationId || !state.hasOlder || state.loadingOlder) {
			return
		}
		dispatch({ type: "olderLoading", loading: true })
		try {
			await transcript.loadOlder(conversationId)
		} catch (reason) {
			reportStore(reason)
		} finally {
			dispatch({ type: "olderLoading", loading: false })
		}
	}

	/** Every runtime call names the run this controller holds, so one issued while a
	 * restart is in flight is refused by the host rather than aimed at whatever
	 * process happens to be installed by the time it lands. */
	const submit = async (id: string, text: string) => {
		const runtime = state.runtime
		if (!runtime) {
			dispatch({ type: "promptRejected", id, error: { kind: "notStarted" } })
			return
		}
		try {
			await driver.submitPrompt(runtime, text)
		} catch (reason) {
			dispatch({
				type: "promptRejected",
				id,
				error: toTransportError(reason),
			})
		}
	}

	/** The prompt reaches the transcript before it reaches Claude. A prompt that
	 * could not be written down is not submitted at all: the answer would arrive
	 * against a question no reload could show. */
	const send = async (text: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return
		}
		if (isTurnBusy(state.turn)) {
			report({ kind: "turnAlreadyRunning" })
			return
		}
		const conversationId = state.conversationId
		if (!conversationId) {
			reportStore({ kind: "unavailable" })
			return
		}
		dispatch({ type: "promptSubmitted" })

		const turnId = newId()
		const promptId = newId()
		const createdAt = now()
		try {
			await enqueue(async () => {
				await store.startTurn({
					id: turnId,
					conversationId,
					startedAt: createdAt,
				})
				await store.appendUserMessage({
					id: promptId,
					conversationId,
					turnId,
					authorBotId: null,
					repliedToMessageId: null,
					content: trimmed,
					createdAt,
				})
			})
		} catch (reason) {
			dispatch({
				type: "promptRejected",
				id: null,
				error: toStoreError(reason),
			})
			return
		}

		transcript.append({
			id: promptId,
			conversationId,
			turnId,
			role: "user",
			content: trimmed,
			completion: "complete",
			createdAt,
		})
		activeTurn = { id: turnId, promptId }
		await submit(promptId, trimmed)
	}

	/** Resubmits a prompt the store already holds. Only the one Claude refused: it
	 * is on the record, so nothing is written again. */
	const retry = async (id: string) => {
		if (state.rejectedPromptId !== id) {
			return
		}
		const target = state.messages.find((message) => message.id === id)
		if (target?.role !== "user") {
			return
		}
		dispatch({ type: "promptRetried", id })
		await submit(id, target.content)
	}

	const stop = async () => {
		const runtime = state.runtime
		if (!runtime || !canStopTurn(state.turn)) {
			return
		}
		announce({ type: "turnChanged", state: "stopping" })
		try {
			await driver.cancelTurn(runtime)
		} catch (reason) {
			dispatch({ type: "stopRejected", error: toTransportError(reason) })
		}
	}

	const respond = async (id: string, decision: PermissionDecision) => {
		const runtime = state.runtime
		if (!runtime) {
			return
		}
		await driver.respondToPermission(runtime, id, decision).catch(report)
	}

	/** Names the run this launch holds, and asks for nothing when it holds none.
	 * A second shutdown is as safe as the first: by then the host holds no session
	 * either, and a caller it has no other run to protect from is not refused. */
	const shutdown = async () => {
		const runtime = state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch(report)
	}

	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		attach,
		check,
		start,
		preflight,
		boot,
		restart,
		loadOlder,
		send,
		stop,
		respond,
		retry,
		shutdown,
	}
}
