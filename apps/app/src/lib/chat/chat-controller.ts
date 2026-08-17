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
import {
	ASKED_FOR,
	type LiveRun,
	openedRun,
	PROMPTS_PER_RUN,
	type RotationReason,
	rotationFor,
	rotationReasonForFailure,
	rotationReasonForStartFailure,
} from "./rotation"

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
	/** Replaces the run by hand: the conversation is folded into a checkpoint, the
	 * run answering in it is closed out with the reason, and a fresh process takes
	 * over. Nothing on the screen moves — the next prompt is what tells the new
	 * process what it is answering. */
	rotate: () => Promise<SessionHandle | null>
	/** Reads the page above the transcript. Deduplicated while in flight, and a
	 * no-op once the beginning has been reached. */
	loadOlder: () => Promise<void>
	/** `repliedToMessageId` is the message this prompt explicitly answers. It travels
	 * with the prompt into every context rebuilt for it, however far back it is. */
	send: (text: string, repliedToMessageId?: string) => Promise<void>
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
	/** The preventive threshold: how many prompts one run carries before it is
	 * replaced while it still answers. */
	promptsPerRun?: number
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
	const promptsPerRun = options.promptsPerRun ?? PROMPTS_PER_RUN
	const transcript = createTranscriptController(store)

	let state = initialChatState
	let botId: string | null = null
	/** What this launch knows about the process it is holding. Replaced whole by
	 * every start, because none of it describes anything but that one process. */
	let run: LiveRun = openedRun(false)
	let activeTurn: { id: string; promptId: string } | null = null
	let detach: Promise<() => void> | null = null
	let pendingPreflight: Promise<SessionHandle | null> | null = null
	/** The handover in flight, if there is one. A second caller joins it instead of
	 * starting another: two would open two rows in one lineage and ask the host for
	 * two processes, and the host takes one transition at a time — so the run this
	 * launch believes it holds would be whichever child lost the seat. */
	let pendingRotation: Promise<SessionHandle | null> | null = null
	/** A prompt on its way. Claimed before anything is awaited, because the turn a
	 * second caller checks only becomes busy once the prompt has been written down,
	 * and the whole handover happens before that. */
	let sending = false
	/** The reply the session has announced and nothing has been written down for
	 * yet. A protocol message that only ever called a tool says nothing, so it is
	 * held here instead of opened: the row is written by the first word it says, or
	 * by an ending that is not a completion, and dropped whole when neither comes.
	 * One at a time — a message the next one starts over has said all it ever will. */
	let heldReply: ChatMessage | null = null
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
	 * the moment it arrives, not once the store has answered the one before it.
	 *
	 * The first word is also what opens the row: until one arrives there is nothing
	 * to write down, and a message that never says any is never written at all. */
	const streamReply = (
		id: string,
		seq: number,
		text: string,
		conversationId: string,
	) => {
		if (text.length === 0) {
			return
		}
		if (heldReply?.id === id) {
			const held = heldReply
			heldReply = null
			openReply(held, conversationId)
		}
		const streamed = openMessages.get(id)
		if (streamed === undefined || seq <= streamed) {
			return
		}
		openMessages.set(id, seq)
		write(
			() => store.appendText(id, text),
			() => transcript.stream({ conversationId, id, text }),
		)
	}

	/** Takes the announced reply for what it is so far: a message with no words yet.
	 * Nothing is written and nothing reaches the screen — a reply is only ever shown
	 * once the store holds it. */
	const holdReply = (message: ChatMessage) => {
		if (
			!activeTurn ||
			openMessages.has(message.id) ||
			settledMessages.has(message.id)
		) {
			return
		}
		heldReply = message
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

	const writeReply = (
		message: ChatMessage,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		openReply(message, conversationId)
		settleReply(message.id, completion, conversationId)
	}

	/** Whether a reply belongs in the transcript at all. It does the moment it has
	 * words, and whatever it has, when it ends any way but well: a reply cut off is
	 * the reader's to see, empty or not. A message that only carried tool calls has
	 * neither — it says nothing and its turn ends fine — so nothing is kept for it. */
	const isWorthKeeping = (
		message: ChatMessage,
		completion: TerminalCompletion,
	) => message.text.length > 0 || completion !== "complete"

	/** The ending of the reply nothing has been written for yet. A held reply the
	 * store never heard of leaves no trace when there is nothing in it to keep. */
	const settleHeldReply = (
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		const held = heldReply
		heldReply = null
		if (held && isWorthKeeping(held, completion)) {
			writeReply(held, completion, conversationId)
		}
	}

	/** The text a reply ends with is the text its deltas wrote: the column is
	 * append-only, so what has already landed is the answer, and the completion
	 * frame repeats it rather than adding to it. A reply that ends without ever
	 * having been opened is still a reply — it is opened on what it says, and
	 * closed in the same breath, unless there is nothing in it worth a row. */
	const settleCompleted = (message: ChatMessage, conversationId: string) => {
		const completion = ENDING_FOR[message.completion]
		if (!completion || settledMessages.has(message.id)) {
			return
		}
		if (heldReply?.id === message.id) {
			heldReply = null
			if (!isWorthKeeping(message, completion)) {
				return
			}
		}
		writeReply(message, completion, conversationId)
	}

	/** Every reply the turn was still carrying, ended the same way — the one nothing
	 * has been written for included. Copied before it is walked: settling a reply
	 * takes it out of the map. */
	const settleOpenReplies = (
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		settleHeldReply(completion, conversationId)
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

	/** The provider's own name for the process, written down against the run it
	 * announced itself in. The run is the one the event named, taken now rather than
	 * when the store answers: a rotation in between would otherwise hand the run that
	 * took over the id of the process it replaced.
	 *
	 * Nothing is decided here. One run answers under one provider session, and which
	 * writes that leaves — the first, a replay of it, or a refusal — is the store's
	 * to settle inside the transaction that writes them. */
	const recordProviderSession = (
		scope: RuntimeScope | null,
		sessionId: string,
	) => {
		if (!scope) {
			return
		}
		write(() =>
			store.recordProviderSession(
				scope.conversationId,
				scope.botId,
				scope.runtimeSessionId,
				sessionId,
			),
		)
	}

	/** The durable half of a transport event. Nothing here decides anything the
	 * reducer decides: it writes down what the session reported, in the order it
	 * reported it. */
	const persist = (scope: RuntimeScope | null, event: ClaudeEvent) => {
		const conversationId = state.conversationId
		if (!conversationId) {
			return
		}
		switch (event.type) {
			case "sessionReady":
				return recordProviderSession(scope, event.sessionId)
			case "messageStarted":
				return holdReply(event.message)
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
			noteFailure(event)
			persist(scope, event)
		})
		return detach
	}

	/** A run whose provider session is gone is marked, not replaced on the spot:
	 * nobody asked for anything, and a rotation nothing is waiting for would spawn a
	 * process no prompt is coming to. The next prompt is what rotates, and the first
	 * reason recorded is the one that stands — what came after it happened to a run
	 * that was already spent.
	 *
	 * Whatever answers under the run from here was told none of this conversation —
	 * a refused resume leaves a fresh child in the same run, and a run that lost its
	 * child has nothing at all. So the run stops claiming to have carried the chat,
	 * and the next prompt is rebuilt in full rather than sent on its own. */
	const noteFailure = (event: ClaudeEvent) => {
		if (event.type !== "failed") {
			return
		}
		const reason = rotationReasonForFailure(event.error)
		if (!reason) {
			return
		}
		run.spent ??= reason
		run.carried = false
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
		reason: RotationReason | null,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(
			conversationId,
			bot,
			now(),
			reason,
		)
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
	const start = async (
		resume?: string,
		rotatedFor: RotationReason | null = null,
	) => {
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
			runtime = await openRun(conversationId, bot, rotatedFor)
		} catch (reason) {
			reportStore(reason)
			return null
		}

		// A resumed session is the same process still holding what it was told; a
		// fresh one has been told nothing, and the first prompt it takes is what
		// carries the conversation to it.
		run = openedRun(Boolean(resume))
		dispatch({ type: "sessionReset", runtime, sessionId: resume ?? null })
		try {
			if (detach) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(runtime, resume)
			dispatch({ type: "sessionOpened" })
			return handle
		} catch (reason) {
			// The row is open and nothing came up behind it. The run is spent from
			// here, so the next prompt replaces it rather than being handed to a run
			// that has a place in the lineage and no child at all.
			const error = toTransportError(reason)
			run.spent = rotationReasonForStartFailure(error)
			announce({ type: "failed", error })
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

	/** The recovery point the next context resumes from. It is taken at the two
	 * moments a conversation is about to depend on one: before the run that produced
	 * it is closed out, and before a run that was told nothing is told everything.
	 * The second is what leaves no stretch out — a context reads the summary and the
	 * tail, and whatever falls between them exists only in the fold.
	 *
	 * A refusal is raised rather than reported, because nothing that calls this may
	 * go on as though the recovery point had moved: a store that will not fold has
	 * left the conversation reachable only through the run that already holds it.
	 * Answering `null` is not a refusal — there was nothing new to fold, so the
	 * previous checkpoint already stands for everything but the tail. */
	const capture = async () => {
		const conversationId = state.conversationId
		const runtime = state.runtime
		if (!conversationId || !botId || !runtime) {
			return
		}
		await store.captureCheckpoint(
			conversationId,
			botId,
			runtime.runtimeSessionId,
			now(),
		)
	}

	/** The handover, in the order it has to happen: what the conversation is worth
	 * keeping is folded and stored first, and only then is the run answering in it
	 * closed out by the one that replaces it. The new run is never resumed — a
	 * rotation exists because the provider session is spent, and what the fresh
	 * process is told arrives with the next prompt instead.
	 *
	 * A fold the store refuses stops the handover where it is. The run holding the
	 * conversation is the only place it is still whole — a successor would be told
	 * the summary that did land and the tail, and the stretch between them would be
	 * gone from the answer while staying on the reader's screen. So nothing is
	 * retired, nothing is opened, and the run stays exactly as it was: still spent if
	 * it was, so the prompt after this one tries the handover again. */
	const runRotation = async (reason: RotationReason) => {
		try {
			await capture()
		} catch (refusal) {
			reportStore(refusal)
			return null
		}
		return start(undefined, reason)
	}

	/** One handover at a time, whoever asked for it: a prompt that found the run
	 * spent and a reader who asked for a fresh one are the same handover when they
	 * overlap, and the second is answered with the first rather than with a run of
	 * its own. */
	const rotateFor = (reason: RotationReason) => {
		pendingRotation ??= runRotation(reason).finally(() => {
			pendingRotation = null
		})
		return pendingRotation
	}

	/** The handover the next prompt needs, if it needs one. A run still answering is
	 * left exactly where it is; one that is spent, or that has carried its share, is
	 * replaced before it is asked anything. */
	const rotateIfDue = async () => {
		const reason = rotationFor(run, promptsPerRun)
		if (reason) {
			await rotateFor(reason)
		}
	}

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

	/** What the run is really told. A process that has already been told this
	 * conversation is answering in it and takes the prompt alone; one that has not
	 * is handed the whole context rebuilt from the file, which the host composes
	 * around the prompt row rather than around the text — so the prompt is in it
	 * exactly once, wherever the bounds fell.
	 *
	 * There is no third answer. A run that was told nothing and cannot be told the
	 * conversation is not given the question on its own: it would be answered as if
	 * the chat had never happened, in the middle of the chat, and nothing on the
	 * screen would say why. The refusal travels to the caller, which leaves the
	 * prompt on the record for the reader to send again once the store answers. */
	const contextFor = async (promptId: string, text: string) => {
		const conversationId = state.conversationId
		if (run.carried || !conversationId || !botId) {
			return text
		}
		await capture()
		return store.boundedContext(conversationId, botId, promptId)
	}

	/** Whether the run this launch holds has a process to answer in it. A run whose
	 * child never came up, or stopped, has a row in the lineage and nothing behind
	 * it: the prompt would be a question with nobody listening, and the refusal it
	 * earns from the host names a session rather than the handover the reader needs.
	 * A run that is merely due for replacement is answerable until it is replaced. */
	const isAnswerable = () => state.sessionOpen && run.spent === null

	/** Every runtime call names the run this controller holds, so one issued while a
	 * restart is in flight is refused by the host rather than aimed at whatever
	 * process happens to be installed by the time it lands.
	 *
	 * The two refusals are kept apart because they are different failures: the store
	 * would not give up the conversation, or Claude would not take the prompt. Both
	 * leave the prompt where it is — written, shown, and the one the reader may send
	 * again. */
	const submit = async (id: string, text: string) => {
		const runtime = state.runtime
		if (!runtime || !isAnswerable()) {
			dispatch({ type: "promptRejected", id, error: { kind: "notStarted" } })
			return
		}
		let carried: string
		try {
			carried = await contextFor(id, text)
		} catch (refusal) {
			dispatch({ type: "promptRejected", id, error: toStoreError(refusal) })
			return
		}
		try {
			await driver.submitPrompt(runtime, carried)
			run.carried = true
			run.prompts += 1
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
	 * against a question no reload could show.
	 *
	 * A run that cannot take it is replaced first, before the prompt is written: a
	 * checkpoint taken over a transcript that already held the question would fold
	 * the very words about to be asked, and the context built afterwards would carry
	 * them twice. */
	/** One prompt at a time, claimed before the first await. The turn a caller is
	 * refused on only becomes busy once the prompt has been written down, and
	 * everything a handover does happens before that — so the busy check alone lets
	 * a second caller in through the window the first one is still opening, and both
	 * replace the run. */
	const admit = async (submission: () => Promise<void>) => {
		if (sending || isTurnBusy(state.turn)) {
			report({ kind: "turnAlreadyRunning" })
			return
		}
		sending = true
		try {
			await submission()
		} finally {
			sending = false
		}
	}

	const sendPrompt = async (trimmed: string, repliedToMessageId?: string) => {
		const conversationId = state.conversationId
		if (!conversationId) {
			reportStore({ kind: "unavailable" })
			return
		}
		await rotateIfDue()
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
					repliedToMessageId: repliedToMessageId ?? null,
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

	const send = (text: string, repliedToMessageId?: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return Promise.resolve()
		}
		return admit(() => sendPrompt(trimmed, repliedToMessageId))
	}

	/** Resubmits a prompt the store already holds. Only the one Claude refused: it
	 * is on the record, so nothing is written again.
	 *
	 * The run it goes to is the one the next prompt would go to, handover included:
	 * a prompt refused because the run behind it was spent would otherwise be sent
	 * again to that same spent run, however many times the reader asked.
	 *
	 * The turn is named from the row rather than kept from the send that failed: a
	 * handover starts the run over and leaves no open turn behind it, and a reply
	 * arriving with none belongs to nothing this launch could write it under. */
	const retryPrompt = async (id: string) => {
		if (state.rejectedPromptId !== id) {
			return
		}
		const target = state.messages.find((message) => message.id === id)
		if (target?.role !== "user") {
			return
		}
		dispatch({ type: "promptRetried", id })
		await rotateIfDue()
		activeTurn = { id: target.turnId, promptId: id }
		await submit(id, target.content)
	}

	const retry = (id: string) => admit(() => retryPrompt(id))

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
		rotate: () => rotateFor(ASKED_FOR),
		loadOlder,
		send,
		stop,
		respond,
		retry,
		shutdown,
	}
}
