import type { SubmittedAttachment } from "./attachments-contract"
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
	REDESCRIBED,
	type RotationReason,
	rotationFor,
	rotationReasonForFailure,
	rotationReasonForStartFailure,
} from "./rotation"

import { createQueue } from "../queue"
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
	/** The state of any bot the reader has opened, not only the one on the screen.
	 * A bot nobody has opened yet is answering nothing, and reads as the state a
	 * launch starts on. */
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	/** Checks the binary and opens a session when it answers. Deduplicated while in flight. */
	preflight: (resume?: string) => Promise<SessionHandle | null>
	/** Opens a bot's stored conversation, paints its tail, then starts Claude in it.
	 * Sequential by construction: nothing may be written before the conversation it
	 * belongs to is on the record. The session itself is not resumed from disk — a
	 * provider session belongs to the launch that opened it.
	 *
	 * This is also how the reader switches bots, and a switch takes nothing away from
	 * the bot being left: it keeps its process, its turn and its transcript, and goes
	 * on writing into its own conversation. What the caller gets back is a handle only
	 * when a process had to be started — a bot already answering is shown, not
	 * restarted. Nothing is opened for a bot the caller did not name: there is no
	 * default bot on this side. */
	open: (botId: string) => Promise<SessionHandle | null>
	/** Ends the runtime of a bot that is going away, and forgets everything this
	 * launch held for it. Called before the row is deleted: a process left running
	 * would answer into a conversation that no longer exists. */
	close: (botId: string) => Promise<void>
	/** Says a bot is not what the process answering for it was started as. A child
	 * is given its system prompt and its directory at spawn and there is no frame
	 * that changes either, so the run holding it is spent from here and the next
	 * prompt is carried by a process started as the bot reads now.
	 *
	 * The handover waits for that prompt rather than happening on the spot: a reader
	 * still typing into the settings would otherwise be spending a process per
	 * keystroke, and nothing is waiting on the one it would spawn. A bot with no live
	 * run has nothing to retire, and no other bot is touched. */
	redescribe: (botId: string) => void
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
	/** The same send, aimed at a named bot rather than at the selection. What a
	 * prompt that had to be prepared first goes through: storing its files takes a
	 * round trip, and the reader may be reading somebody else by the time it lands.
	 * A bot this launch has not opened takes nothing. */
	sendTo: (botId: string, text: string) => Promise<void>
	/** Writes the files a bot's next prompt names down, and answers their absolute
	 * paths in the order they were staged. Rejects with an `AttachmentStoreError`,
	 * which leaves every staged file where it is: nothing was stored. */
	storeAttachments: (
		botId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
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

/** One bot's whole runtime: what its screen shows, the run it holds, and the
 * bookkeeping of the reply it is streaming. Every bot the reader has opened holds
 * one of these, and none of them is shared — which is what lets a bot go on
 * answering into its own conversation while the reader is talking to another. */
type BotChat = {
	id: string
	state: ChatState
	/** What this launch knows about the process this bot is holding. Replaced whole
	 * by every start, because none of it describes anything but that one process. */
	run: LiveRun
	activeTurn: { id: string; promptId: string } | null
	/** The reply the session has announced and nothing has been written down for
	 * yet. A protocol message that only ever called a tool says nothing, so it is
	 * held here instead of opened: the row is written by the first word it says, or
	 * by an ending that is not a completion, and dropped whole when neither comes.
	 * One at a time — a message the next one starts over has said all it ever will. */
	heldReply: ChatMessage | null
	/** The replies this bot opened and has not settled, and how far each has
	 * streamed. A message leaves both the moment it ends, which is what makes a
	 * replayed ending, and every delta behind it, a no-op. */
	openMessages: Map<string, number>
	settledMessages: Set<string>
	pendingPreflight: Promise<SessionHandle | null> | null
	/** The handover in flight for this bot, if there is one. A second caller joins it
	 * instead of starting another: two would open two rows in one lineage and ask the
	 * host for two processes for one bot, and the host takes one transition at a time
	 * per bot — so the run this launch believes it holds would be whichever child lost
	 * the seat. */
	pendingRotation: Promise<SessionHandle | null> | null
	/** A prompt on its way. Claimed before anything is awaited, because the turn a
	 * second caller checks only becomes busy once the prompt has been written down,
	 * and the whole handover happens before that. */
	sending: boolean
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

	/** Every bot the reader has opened, each with a runtime of its own. Nothing is
	 * shared between two of them but the store underneath and the order writes reach
	 * it in, which is what lets several bots answer at the same time. */
	const bots = new Map<string, BotChat>()
	/** The bot on the screen. Everything the reader asks for is asked of this one,
	 * and it is the only thing a switch changes. */
	let selected: BotChat | null = null
	let detach: Promise<() => void> | null = null
	const listeners = new Set<() => void>()

	/** Every read and every write in the order it was issued. Two deltas racing on
	 * the same row would concatenate in whichever order the host answered, which is
	 * the one thing an append-only column cannot be asked to forgive.
	 *
	 * The reads are in it for the other half of that: a page carries a row's whole
	 * content while a delta carries the words to add to it, so a page read while a
	 * write is in flight is read against a screen that does not hold that write yet —
	 * and the merge, seeing the durable row further along, takes it, after which the
	 * delta lands on top of the words it already contains. Queued together, a write
	 * that has reached the store has reached the screen before the read after it
	 * begins, so the two can no longer disagree about how far the row has come. */
	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const botFor = (id: string): BotChat => {
		const known = bots.get(id)
		if (known) {
			return known
		}
		const bot: BotChat = {
			id,
			state: initialChatState,
			run: openedRun(false),
			activeTurn: null,
			heldReply: null,
			openMessages: new Map(),
			settledMessages: new Set(),
			pendingPreflight: null,
			pendingRotation: null,
			sending: false,
		}
		bots.set(id, bot)
		return bot
	}

	const dispatch = (bot: BotChat, action: ChatAction) => {
		const next = chatReducer(bot.state, action)
		if (next === bot.state) {
			return
		}
		bot.state = next
		publish()
	}

	/** The controller speaking for the run a bot holds, in the vocabulary the host
	 * speaks: what it says about that bot's own session is scoped with it and meets
	 * the same gate as everything the session reports. */
	const announce = (bot: BotChat, event: ClaudeEvent) =>
		dispatch(bot, { type: "driverEvent", scope: bot.state.runtime, event })

	const report = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toTransportError(reason) })

	const reportStore = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toStoreError(reason) })

	/** A write and what it lets the reader see, in that order. `shown` runs only
	 * once the store has taken the write, so nothing reaches the screen that a
	 * reload would not bring back; a refusal shows nothing and says so. Callbacks
	 * settle in the order their writes were issued, because each one is attached
	 * to its own link of the chain. */
	const write = (
		bot: BotChat,
		operation: () => Promise<unknown>,
		shown?: () => void,
	) => {
		void enqueue(operation).then(
			() => shown?.(),
			(reason) => reportStore(bot, reason),
		)
	}

	const syncBot = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		const current = transcript.getState()
		dispatch(bot, {
			type: "transcriptChanged",
			messages: selectMessages(current, conversationId),
			hasOlder: selectHasMore(current, conversationId),
		})
	}

	/** Every open bot, not the one on the screen: a bot answering in the background
	 * is writing into its own conversation, and the reader coming back to it must
	 * find what it said rather than where they left it. */
	const syncTranscript = () => {
		for (const bot of bots.values()) {
			syncBot(bot)
		}
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
		bot: BotChat,
		id: string,
		seq: number,
		text: string,
		conversationId: string,
	) => {
		if (text.length === 0) {
			return
		}
		if (bot.heldReply?.id === id) {
			const held = bot.heldReply
			bot.heldReply = null
			openReply(bot, held, conversationId)
		}
		const streamed = bot.openMessages.get(id)
		if (streamed === undefined || seq <= streamed) {
			return
		}
		bot.openMessages.set(id, seq)
		write(
			bot,
			() => store.appendText(id, text),
			() => transcript.stream({ conversationId, id, text }),
		)
	}

	/** A reply this controller has written nothing for yet. One it has opened is
	 * being streamed into, and one it has settled is finished — a frame announcing
	 * either is the same message arriving twice. */
	const isUnwritten = (bot: BotChat, id: string) =>
		!bot.openMessages.has(id) && !bot.settledMessages.has(id)

	/** Takes the announced reply for what it is so far: a message with no words yet.
	 * Nothing is written and nothing reaches the screen — a reply is only ever shown
	 * once the store holds it. */
	const holdReply = (bot: BotChat, message: ChatMessage) => {
		if (!bot.activeTurn || !isUnwritten(bot, message.id)) {
			return
		}
		bot.heldReply = message
	}

	const openReply = (
		bot: BotChat,
		message: ChatMessage,
		conversationId: string,
	) => {
		const turn = bot.activeTurn
		if (!turn || !isUnwritten(bot, message.id)) {
			return
		}
		bot.openMessages.set(message.id, 0)
		write(
			bot,
			() =>
				store.openAssistantMessage({
					id: message.id,
					conversationId,
					turnId: turn.id,
					authorBotId: bot.id,
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
		streamReply(bot, message.id, 1, message.text, conversationId)
	}

	/** An ending is claimed here once and only once, so a replayed one and every
	 * delta behind it stop at the guard above. A store that refuses the ending
	 * leaves the message open on disk, and the screen shows it exactly that way:
	 * still unfinished, which is what the next launch will read back. */
	const settleReply = (
		bot: BotChat,
		id: string,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		if (!bot.openMessages.has(id)) {
			return
		}
		bot.openMessages.delete(id)
		bot.settledMessages.add(id)
		write(
			bot,
			() => store.finalizeMessage(id, completion),
			() => transcript.settle({ conversationId, id, completion }),
		)
	}

	const writeReply = (
		bot: BotChat,
		message: ChatMessage,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		openReply(bot, message, conversationId)
		settleReply(bot, message.id, completion, conversationId)
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
		bot: BotChat,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		const held = bot.heldReply
		bot.heldReply = null
		if (held && isWorthKeeping(held, completion)) {
			writeReply(bot, held, completion, conversationId)
		}
	}

	/** The text a reply ends with is the text its deltas wrote: the column is
	 * append-only, so what has already landed is the answer, and the completion
	 * frame repeats it rather than adding to it. A reply that ends without ever
	 * having been opened is still a reply — it is opened on what it says, and
	 * closed in the same breath, unless there is nothing in it worth a row. */
	const settleCompleted = (
		bot: BotChat,
		message: ChatMessage,
		conversationId: string,
	) => {
		const completion = ENDING_FOR[message.completion]
		if (!completion || bot.settledMessages.has(message.id)) {
			return
		}
		if (bot.heldReply?.id === message.id) {
			bot.heldReply = null
			if (!isWorthKeeping(message, completion)) {
				return
			}
		}
		writeReply(bot, message, completion, conversationId)
	}

	/** Every reply the turn was still carrying, ended the same way — the one nothing
	 * has been written for included. Copied before it is walked: settling a reply
	 * takes it out of the map. */
	const settleOpenReplies = (
		bot: BotChat,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		settleHeldReply(bot, completion, conversationId)
		for (const id of [...bot.openMessages.keys()]) {
			settleReply(bot, id, completion, conversationId)
		}
	}

	const endTurn = (
		bot: BotChat,
		completion: TerminalCompletion,
		conversationId: string,
	) => {
		settleOpenReplies(bot, completion, conversationId)
		const turn = bot.activeTurn
		bot.activeTurn = null
		if (turn) {
			write(bot, () => store.completeTurn(turn.id, now()))
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
		bot: BotChat,
		scope: RuntimeScope | null,
		sessionId: string,
	) => {
		if (!scope) {
			return
		}
		write(bot, () =>
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
	 * reported it.
	 *
	 * The conversation is the run's own rather than the one on the screen. They are
	 * the same only while the reader is looking at this bot, and what a process says
	 * belongs to the conversation it was started for whether or not anybody is
	 * watching it — writing it under the bot on the screen would put one bot's words
	 * in another's transcript. */
	const persist = (
		bot: BotChat,
		scope: RuntimeScope | null,
		event: ClaudeEvent,
	) => {
		const conversationId = scope?.conversationId
		if (!conversationId) {
			return
		}
		switch (event.type) {
			case "sessionReady":
				return recordProviderSession(bot, scope, event.sessionId)
			case "messageStarted":
				return holdReply(bot, event.message)
			case "messageDelta":
				return streamReply(bot, event.id, event.seq, event.text, conversationId)
			case "messageCompleted":
				return settleCompleted(bot, event.message, conversationId)
			case "turnEnded":
				return endTurn(
					bot,
					ENDING_FOR_OUTCOME[event.ended.outcome],
					conversationId,
				)
			default:
				return
		}
	}

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
	}

	/** Hands an event to the bot it is for. The run it names decides, never the
	 * subscription it arrived on: the host delivers every bot's stream on one
	 * channel, and a replaced session keeps talking until its child is gone. So a
	 * frame reaches the bot whose run produced it and no other — and a frame from a
	 * run nobody holds any more reaches none at all.
	 *
	 * Walked rather than filtered: this runs on every word of every answer, and a
	 * list built to be thrown away per token is the kind of work a stream multiplies.
	 */
	const route = (scope: RuntimeScope | null, event: ClaudeEvent) => {
		for (const bot of bots.values()) {
			if (!isSameRuntimeScope(scope, bot.state.runtime)) {
				continue
			}
			dispatch(bot, { type: "driverEvent", scope, event })
			noteFailure(bot, event)
			persist(bot, scope, event)
		}
	}

	/** Resolves once the subscription is live. Tauri registers listeners over IPC,
	 * so a command issued before this settles loses the events it emits. */
	const connect = () => {
		disconnect()
		detach = driver.subscribe(({ scope, event }) => route(scope, event))
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
	const noteFailure = (bot: BotChat, event: ClaudeEvent) => {
		if (event.type !== "failed") {
			return
		}
		const reason = rotationReasonForFailure(event.error)
		if (!reason) {
			return
		}
		bot.run.spent ??= reason
		bot.run.carried = false
	}

	const attach = () => {
		connect()
		return disconnect
	}

	const checkFor = async (bot: BotChat) => {
		try {
			const result = await driver.check(bot.state.runtime)
			dispatch(bot, { type: "binaryVersion", version: result.binaryVersion })
			announce(bot, { type: "connectionChanged", state: result.connection })
			if (result.error) {
				report(bot, result.error)
			}
			return result
		} catch (reason) {
			report(bot, reason)
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

	/** A reply the bot's own session was streaming when it went away is closed as
	 * interrupted: nothing on disk can resume a stream, and it neither failed nor was
	 * cancelled. The turn it belonged to is left open on purpose — it never
	 * completed, and nothing is going to complete it. Only this bot's replies are
	 * touched: every other bot is answering in a process this start has nothing to
	 * do with.
	 *
	 * A process is never started unscoped: without a conversation and a bot there is
	 * no run to open, and a session nothing can attribute is one whose every event
	 * would be somebody's guess. So the reader is told the store is not answering
	 * instead of being handed an unattributable session. */
	const startFor = async (
		bot: BotChat,
		resume?: string,
		rotatedFor: RotationReason | null = null,
	) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			reportStore(bot, { kind: "unavailable" })
			return null
		}
		settleOpenReplies(bot, INTERRUPTED, conversationId)
		bot.activeTurn = null

		let runtime: RuntimeScope
		try {
			runtime = await openRun(conversationId, bot.id, rotatedFor)
		} catch (reason) {
			reportStore(bot, reason)
			return null
		}

		// A resumed session is the same process still holding what it was told; a
		// fresh one has been told nothing, and the first prompt it takes is what
		// carries the conversation to it.
		bot.run = openedRun(Boolean(resume))
		dispatch(bot, { type: "sessionReset", runtime, sessionId: resume ?? null })
		try {
			if (detach) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(runtime, resume)
			dispatch(bot, { type: "sessionOpened" })
			return handle
		} catch (reason) {
			// The row is open and nothing came up behind it. The run is spent from
			// here, so the next prompt replaces it rather than being handed to a run
			// that has a place in the lineage and no child at all.
			const error = toTransportError(reason)
			bot.run.spent ??= rotationReasonForStartFailure(error)
			announce(bot, { type: "failed", error })
			return null
		}
	}

	/** The reason travels with the start: a run that is spent is left behind for what
	 * spent it, whether the prompt that needed a fresh process asked for the handover
	 * or a reader coming back to the bot did. A row replaced under no reason at all is
	 * a handover nobody can account for afterwards. */
	const runPreflight = async (bot: BotChat, resume?: string) => {
		const checked = await checkFor(bot)
		if (checked?.connection !== "ready") {
			return null
		}
		return startFor(bot, resume, bot.run.spent)
	}

	const preflightFor = (bot: BotChat, resume?: string) => {
		bot.pendingPreflight ??= runPreflight(bot, resume).finally(() => {
			bot.pendingPreflight = null
		})
		return bot.pendingPreflight
	}

	const openConversation = async (bot: BotChat) => {
		try {
			const chat = await store.mainChat(bot.id)
			dispatch(bot, { type: "conversationOpened", conversationId: chat.id })
			// Said twice on purpose. The subscription only fires when a page moves the
			// transcript — a conversation with nothing in it moves nothing — so the
			// first call fills the screen from what has already been read, and the
			// second paints the page this load went for.
			syncBot(bot)
			await enqueue(() => transcript.load(chat.id))
			syncBot(bot)
		} catch (reason) {
			reportStore(bot, reason)
		}
	}

	/** The bot is no longer what its process was started as. Marked rather than
	 * replaced, for the reason a failed run is — see `noteFailure`. What it holds is
	 * left alone: the child that is running still carries the conversation, and it
	 * goes on carrying it until the prompt that replaces it. */
	const redescribe = (botId: string) => {
		const bot = bots.get(botId)
		if (!bot || !bot.state.sessionOpen) {
			return
		}
		bot.run.spent ??= REDESCRIBED
	}

	/** Whether the bot has a process of its own to go on answering in. A run whose
	 * child never came up, or stopped, has a row in the lineage and nothing behind
	 * it: the prompt would be a question with nobody listening, and the refusal it
	 * earns from the host names a session rather than the handover the reader needs.
	 * A run that is merely due for replacement is answerable until it is replaced. */
	const isAnswerable = (bot: BotChat) =>
		bot.state.sessionOpen && bot.run.spent === null

	/** The one process a bot may have. A bot already answering is shown as it is —
	 * starting a second one for it would leave the first running with nothing left
	 * holding it, and would cut off the very answer the reader came back for. */
	const openedFor = (bot: BotChat) =>
		isAnswerable(bot) ? Promise.resolve(null) : preflightFor(bot)

	const open = async (nextBotId: string) => {
		const bot = botFor(nextBotId)
		selected = bot
		publish()
		await openConversation(bot)
		return openedFor(bot)
	}

	/** The bot is going away, so its process goes with it and this launch forgets
	 * everything it was holding for it. The refusal of a shutdown for a run the host
	 * has already replaced is nobody's to act on by then — there is no screen left to
	 * report it to. */
	const close = async (botId: string) => {
		const bot = bots.get(botId)
		if (!bot) {
			return
		}
		bots.delete(botId)
		if (selected === bot) {
			selected = null
		}
		publish()
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch(() => undefined)
	}

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
	const capture = async (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		const runtime = bot.state.runtime
		if (!conversationId || !runtime) {
			return
		}
		await store.captureCheckpoint(
			conversationId,
			bot.id,
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
	const runRotation = async (bot: BotChat, reason: RotationReason) => {
		try {
			await capture(bot)
		} catch (refusal) {
			reportStore(bot, refusal)
			return null
		}
		return startFor(bot, undefined, reason)
	}

	/** One handover at a time per bot, whoever asked for it: a prompt that found the
	 * run spent and a reader who asked for a fresh one are the same handover when
	 * they overlap, and the second is answered with the first rather than with a run
	 * of its own. */
	const rotateFor = (bot: BotChat, reason: RotationReason) => {
		bot.pendingRotation ??= runRotation(bot, reason).finally(() => {
			bot.pendingRotation = null
		})
		return bot.pendingRotation
	}

	/** The handover the next prompt needs, if it needs one. A run still answering is
	 * left exactly where it is; one that is spent, or that has carried its share, is
	 * replaced before it is asked anything. */
	const rotateIfDue = async (bot: BotChat) => {
		const reason = rotationFor(bot.run, promptsPerRun)
		if (reason) {
			await rotateFor(bot, reason)
		}
	}

	const loadOlder = async (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId || !bot.state.hasOlder || bot.state.loadingOlder) {
			return
		}
		dispatch(bot, { type: "olderLoading", loading: true })
		try {
			await enqueue(() => transcript.loadOlder(conversationId))
		} catch (reason) {
			reportStore(bot, reason)
		} finally {
			dispatch(bot, { type: "olderLoading", loading: false })
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
	const contextFor = async (bot: BotChat, promptId: string, text: string) => {
		const conversationId = bot.state.conversationId
		if (bot.run.carried || !conversationId) {
			return text
		}
		await capture(bot)
		return store.boundedContext(conversationId, bot.id, promptId)
	}

	/** Every runtime call names the run this bot holds, so one issued while a
	 * restart is in flight is refused by the host rather than aimed at whatever
	 * process happens to be installed by the time it lands.
	 *
	 * The two refusals are kept apart because they are different failures: the store
	 * would not give up the conversation, or Claude would not take the prompt. Both
	 * leave the prompt where it is — written, shown, and the one the reader may send
	 * again. */
	const submit = async (bot: BotChat, id: string, text: string) => {
		const runtime = bot.state.runtime
		if (!runtime || !isAnswerable(bot)) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: { kind: "notStarted" },
			})
			return
		}
		let carried: string
		try {
			carried = await contextFor(bot, id, text)
		} catch (refusal) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: toStoreError(refusal),
			})
			return
		}
		try {
			await driver.submitPrompt(runtime, carried)
			bot.run.carried = true
			bot.run.prompts += 1
		} catch (reason) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: toTransportError(reason),
			})
		}
	}

	/** One prompt at a time per bot, claimed before the first await. The turn a
	 * caller is refused on only becomes busy once the prompt has been written down,
	 * and everything a handover does happens before that — so the busy check alone
	 * lets a second caller in through the window the first one is still opening, and
	 * both replace the run. */
	const admit = async (bot: BotChat, submission: () => Promise<void>) => {
		if (bot.sending || isTurnBusy(bot.state.turn)) {
			report(bot, { kind: "turnAlreadyRunning" })
			return
		}
		bot.sending = true
		try {
			await submission()
		} finally {
			bot.sending = false
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
	const sendPrompt = async (
		bot: BotChat,
		trimmed: string,
		repliedToMessageId?: string,
	) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			reportStore(bot, { kind: "unavailable" })
			return
		}
		await rotateIfDue(bot)
		dispatch(bot, { type: "promptSubmitted" })

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
			dispatch(bot, {
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
		bot.activeTurn = { id: turnId, promptId }
		await submit(bot, promptId, trimmed)
	}

	/** The files a prompt is about to name, written down before the prompt is sent.
	 * They belong to the conversation rather than to the run answering in it, so a
	 * bot with none open has nowhere to put them and is refused rather than answered
	 * with no paths at all — the composer would send the prompt without them and
	 * throw away what it was holding. */
	const storeAttachments = (
		botId: string,
		attachments: SubmittedAttachment[],
	): Promise<string[]> => {
		const conversationId = bots.get(botId)?.state.conversationId
		if (!conversationId) {
			return Promise.reject({
				kind: "unwritable",
				detail: "no conversation is open to attach them to",
			})
		}
		return driver.storeAttachments(conversationId, attachments)
	}

	const send = (bot: BotChat, text: string, repliedToMessageId?: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return Promise.resolve()
		}
		return admit(bot, () => sendPrompt(bot, trimmed, repliedToMessageId))
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
	const retryPrompt = async (bot: BotChat, id: string) => {
		if (bot.state.rejectedPromptId !== id) {
			return
		}
		const target = bot.state.messages.find((message) => message.id === id)
		if (target?.role !== "user") {
			return
		}
		dispatch(bot, { type: "promptRetried", id })
		await rotateIfDue(bot)
		bot.activeTurn = { id: target.turnId, promptId: id }
		await submit(bot, id, target.content)
	}

	const stop = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime || !canStopTurn(bot.state.turn)) {
			return
		}
		announce(bot, { type: "turnChanged", state: "stopping" })
		try {
			await driver.cancelTurn(runtime)
		} catch (reason) {
			dispatch(bot, { type: "stopRejected", error: toTransportError(reason) })
		}
	}

	const respond = async (
		bot: BotChat,
		id: string,
		decision: PermissionDecision,
	) => {
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver
			.respondToPermission(runtime, id, decision)
			.catch((reason) => report(bot, reason))
	}

	/** Names the run this bot holds, and asks for nothing when it holds none.
	 * A second shutdown is as safe as the first: by then the host holds no session
	 * either, and a caller it has no other run to protect from is not refused. */
	const shutdown = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch((reason) => report(bot, reason))
	}

	/** Everything the reader asks for is asked of the bot on the screen. There is no
	 * default one: before a bot is opened there is nothing to ask, and nowhere an
	 * answer could be shown. */
	const onSelected = <T>(
		ask: (bot: BotChat) => Promise<T>,
		nothing: T,
	): Promise<T> => (selected ? ask(selected) : Promise.resolve(nothing))

	return {
		getState: () => selected?.state ?? initialChatState,
		stateFor: (botId) => bots.get(botId)?.state ?? initialChatState,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		attach,
		check: () => onSelected(checkFor, null),
		start: (resume) => onSelected((bot) => startFor(bot, resume), null),
		preflight: (resume) => onSelected((bot) => preflightFor(bot, resume), null),
		open,
		close,
		redescribe,
		restart: () =>
			onSelected(
				(bot) => preflightFor(bot, bot.state.sessionId ?? undefined),
				null,
			),
		rotate: () => onSelected((bot) => rotateFor(bot, ASKED_FOR), null),
		loadOlder: () => onSelected(loadOlder, undefined),
		send: (text, repliedToMessageId) =>
			onSelected((bot) => send(bot, text, repliedToMessageId), undefined),
		sendTo: async (botId, text) => {
			const bot = bots.get(botId)
			if (bot) {
				await send(bot, text)
			}
		},
		storeAttachments,
		stop: () => onSelected(stop, undefined),
		respond: (id, decision) =>
			onSelected((bot) => respond(bot, id, decision), undefined),
		retry: (id) =>
			onSelected((bot) => admit(bot, () => retryPrompt(bot, id)), undefined),
		shutdown: () => onSelected(shutdown, undefined),
	}
}
