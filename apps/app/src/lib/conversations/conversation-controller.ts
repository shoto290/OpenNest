import { addresseesIn, toMentionTokens } from "./mentions"
import { isNameless, leadOf, presentParticipants } from "./roster-conversations"
import type { Conversation, MessagePin } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type {
	TerminalCompletion,
	TranscriptMessage,
} from "./transcript-contract"
import { createTranscriptController } from "./transcript-controller"
import { selectHasMore, selectMessages } from "./transcript-state"
import {
	closedSpeaker,
	emptyQueue,
	handedOver,
	loopingPairIn,
	reopenedFor,
	type Summons,
	startedNext,
	type TurnQueue,
} from "./turn-queue"

import { createQueue } from "../queue"
import type {
	ActivityEvent,
	AgentEvent,
	ChatMessage,
	PermissionDecision,
	PermissionRequest,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
	TransportError,
} from "../agent/contract"
import type { ChatError } from "../chat/chat-state"
import {
	chatErrorOf,
	isSameRuntimeScope,
	toReadError,
	toTransportError,
} from "../chat/chat-state"
import type { ChatDriver } from "../chat/driver"
import {
	answeredText,
	questionMessageIdOf,
	questionMessageText,
} from "../chat/question-message"
import {
	ENDING_FOR,
	ENDING_FOR_OUTCOME,
	isWorthKeeping,
} from "../chat/reply-endings"
import {
	type WorkingState,
	withActivity,
	workingFor,
} from "../chat/working-kind"

export type RefusedMessage = {
	id: string
	text: string
	repliedToMessageId: string | null
}

export type PendingPrompt =
	| { kind: "question"; botId: string; request: QuestionRequest }
	| { kind: "permission"; botId: string; request: PermissionRequest }

export type ConversationState = {
	conversationId: string | null
	messages: TranscriptMessage[]
	hasOlder: boolean
	isLoadingOlder: boolean
	speakingBotId: string | null
	speakingWork: WorkingState | null
	waitingBotIds: string[]
	loopingPair: [string, string] | null
	refusedMessage: RefusedMessage | null
	pendingPrompt: PendingPrompt | null
	latestError: ChatError | null
}

export type ConversationController = {
	getState: () => ConversationState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	open: (conversation: Conversation) => Promise<void>
	loadOlder: () => Promise<void>
	follow: (isAtLiveEdge: boolean) => void
	send: (text: string, repliedToMessageId?: string) => Promise<void>
	sendAgain: (messageId: string) => Promise<void>
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
	dismissError: (id: string) => void
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	stop: () => Promise<void>
	shutdown: () => Promise<void>
}

export type ConversationControllerOptions = {
	newId?: () => string
	now?: () => number
	onNamed?: (conversationId: string, title: string) => void
}

type OpenTurn = {
	id: string
	promptId: string
}

type Speaker = {
	botId: string
	scope: RuntimeScope
	turn: OpenTurn
	openMessages: Map<string, number>
	settledMessages: Set<string>
	heldReply: ChatMessage | null
	written: Map<string, string>
	activities: ActivityEvent[]
	pending: PendingPrompt | null
	isDropped: boolean
}

const NO_MESSAGES: TranscriptMessage[] = []

const NO_PINS: MessagePin[] = []

const isSamePair = (
	left: [string, string] | null,
	right: [string, string] | null,
) =>
	left === right ||
	(left !== null &&
		right !== null &&
		left[0] === right[0] &&
		left[1] === right[1])

const isSameWork = (left: WorkingState | null, right: WorkingState | null) =>
	left?.kind === right?.kind && left?.label === right?.label

const isSameOrder = (left: string[], right: string[]) =>
	left.length === right.length && left.every((id, rank) => id === right[rank])

const isSameState = (left: ConversationState, right: ConversationState) =>
	left.conversationId === right.conversationId &&
	left.messages === right.messages &&
	left.hasOlder === right.hasOlder &&
	left.isLoadingOlder === right.isLoadingOlder &&
	left.speakingBotId === right.speakingBotId &&
	isSameWork(left.speakingWork, right.speakingWork) &&
	isSameOrder(left.waitingBotIds, right.waitingBotIds) &&
	isSamePair(left.loopingPair, right.loopingPair) &&
	left.refusedMessage === right.refusedMessage &&
	left.pendingPrompt === right.pendingPrompt &&
	left.latestError === right.latestError

const promptWork = (pending: PendingPrompt): WorkingState => ({
	kind: "waiting",
	label:
		pending.kind === "question"
			? pending.request.questions[0]?.header
			: pending.request.title,
})

const initialState: ConversationState = {
	conversationId: null,
	messages: NO_MESSAGES,
	hasOlder: false,
	isLoadingOlder: false,
	speakingBotId: null,
	speakingWork: null,
	waitingBotIds: [],
	loopingPair: null,
	refusedMessage: null,
	pendingPrompt: null,
	latestError: null,
}

export const createConversationController = (
	driver: ChatDriver,
	store: TranscriptStore,
	options: ConversationControllerOptions = {},
): ConversationController => {
	const newId = options.newId ?? (() => crypto.randomUUID())
	const now = options.now ?? (() => Date.now())
	const transcript = createTranscriptController(store)
	const enqueue = createQueue()

	const listeners = new Set<() => void>()
	let state = initialState
	let conversation: Conversation | null = null
	let queue: TurnQueue = emptyQueue
	let activeTurn: OpenTurn | null = null
	let speaker: Speaker | null = null
	const runs = new Map<string, RuntimeScope>()
	let refused: RefusedMessage | null = null
	let latestError: ChatError | null = null
	let errorCount = 0
	let detach: Promise<() => void> | null = null
	let driving: Promise<void> | null = null

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const settle = (next: ConversationState) => {
		if (isSameState(state, next)) {
			return
		}
		state = next
		publish()
	}

	const noteFailure = (error: TransportError) => {
		latestError = chatErrorOf(error, errorCount)
		errorCount += 1
	}

	const forgetFailure = () => {
		latestError = null
	}

	const readTranscript = () => {
		const conversationId = conversation?.id
		if (!conversationId) {
			return { messages: NO_MESSAGES, hasOlder: false }
		}
		const held = transcript.getState()
		return {
			messages: selectMessages(held, conversationId),
			hasOlder: selectHasMore(held, conversationId),
		}
	}

	const speakingWork = (): WorkingState | null => {
		if (!queue.speaking) {
			return null
		}
		if (!speaker) {
			return { kind: "thinking" }
		}
		if (speaker.pending) {
			return promptWork(speaker.pending)
		}
		return workingFor(speaker.activities, speaker.written.size > 0)
	}

	const sync = () => {
		settle({
			...state,
			...readTranscript(),
			conversationId: conversation?.id ?? null,
			speakingBotId: queue.speaking?.botId ?? null,
			speakingWork: speakingWork(),
			waitingBotIds: queue.waiting.map(({ botId }) => botId),
			loopingPair: loopingPairIn(queue.handovers),
			refusedMessage: refused,
			pendingPrompt: speaker?.pending ?? null,
			latestError,
		})
	}

	transcript.subscribe(sync)

	const write = (operation: () => Promise<unknown>, shown?: () => void) => {
		void enqueue(operation).then(
			() => shown?.(),
			() => undefined,
		)
	}

	const participants = () =>
		conversation ? presentParticipants(conversation) : []

	const presentBotIds = () => participants().map(({ botId }) => botId)

	const mentionBots = () =>
		participants().map(({ botId, name }) => ({ id: botId, name }))

	const isUnwritten = (held: Speaker, id: string) =>
		!held.openMessages.has(id) && !held.settledMessages.has(id)

	const openReply = (held: Speaker, message: ChatMessage) => {
		if (!conversation || !isUnwritten(held, message.id)) {
			return
		}
		const conversationId = conversation.id
		held.openMessages.set(message.id, 0)
		write(
			() =>
				store.openAssistantMessage({
					id: message.id,
					conversationId,
					turnId: held.turn.id,
					authorBotId: held.botId,
					repliedToMessageId: held.turn.promptId,
					createdAt: message.timestamp,
				}),
			() =>
				transcript.append({
					id: message.id,
					conversationId,
					turnId: held.turn.id,
					role: "assistant",
					content: "",
					completion: "streaming",
					createdAt: message.timestamp,
					authorBotId: held.botId,
					repliedToMessageId: held.turn.promptId,
					runtimeSessionId: held.scope.runtimeSessionId,
				}),
		)
		streamReply(held, message.id, 1, message.text)
	}

	const streamReply = (
		held: Speaker,
		id: string,
		seq: number,
		text: string,
	) => {
		if (text.length === 0 || !conversation) {
			return
		}
		const conversationId = conversation.id
		if (held.heldReply?.id === id) {
			const pending = held.heldReply
			held.heldReply = null
			openReply(held, pending)
		}
		const streamed = held.openMessages.get(id)
		if (streamed === undefined || seq <= streamed) {
			return
		}
		held.openMessages.set(id, seq)
		held.written.set(id, (held.written.get(id) ?? "") + text)
		write(
			() => store.appendText(id, text),
			() => transcript.stream({ conversationId, id, text }),
		)
	}

	const settleMentions = (held: Speaker, id: string) => {
		const written = held.written.get(id) ?? ""
		const settled = toMentionTokens(written, mentionBots())
		if (settled === written) {
			return undefined
		}
		held.written.set(id, settled)
		return settled
	}

	const settleReply = (
		held: Speaker,
		id: string,
		completion: TerminalCompletion,
	) => {
		if (!held.openMessages.has(id) || !conversation) {
			return
		}
		const conversationId = conversation.id
		held.openMessages.delete(id)
		held.settledMessages.add(id)
		const settledText = settleMentions(held, id)
		write(
			() => store.finalizeMessage(id, completion, settledText),
			() => transcript.settle({ conversationId, id, completion, settledText }),
		)
	}

	const writeReply = (
		held: Speaker,
		message: ChatMessage,
		completion: TerminalCompletion,
	) => {
		openReply(held, message)
		settleReply(held, message.id, completion)
	}

	const settleCompleted = (held: Speaker, message: ChatMessage) => {
		const completion = ENDING_FOR[message.completion]
		if (!completion || held.settledMessages.has(message.id)) {
			return
		}
		if (held.heldReply?.id === message.id) {
			held.heldReply = null
		}
		if (isUnwritten(held, message.id) && !isWorthKeeping(message, completion)) {
			return
		}
		writeReply(held, message, completion)
	}

	const settleOpenReplies = (held: Speaker, completion: TerminalCompletion) => {
		const pending = held.heldReply
		held.heldReply = null
		if (pending && isWorthKeeping(pending, completion)) {
			writeReply(held, pending, completion)
		}
		for (const id of [...held.openMessages.keys()]) {
			settleReply(held, id, completion)
		}
	}

	const completeTurn = (turn: OpenTurn) => {
		write(() => store.completeTurn(turn.id, now()))
	}

	const noteHandovers = (held: Speaker) => {
		const present = presentBotIds()
		for (const [promptId, text] of held.written) {
			for (const botId of addresseesIn(text, present)) {
				queue = handedOver(queue, held.botId, { botId, promptId })
			}
		}
	}

	const closeSpeaker = (completion: TerminalCompletion) => {
		const held = speaker
		if (!held) {
			return
		}
		speaker = null
		settleOpenReplies(held, completion)
		if (!held.isDropped) {
			noteHandovers(held)
		}
		if (held.turn !== activeTurn) {
			completeTurn(held.turn)
		}
		queue = closedSpeaker(queue)
		sync()
		drive()
	}

	const noteActivity = (held: Speaker, activity: ActivityEvent) => {
		held.activities = withActivity(held.activities, activity)
		sync()
	}

	const holdPrompt = (held: Speaker, pending: PendingPrompt) => {
		held.pending = pending
		sync()
	}

	const releasePrompt = (held: Speaker, id: string) => {
		if (held.pending?.request.id !== id) {
			return
		}
		held.pending = null
		sync()
	}

	const askQuestion = (held: Speaker, request: QuestionRequest) => {
		const id = questionMessageIdOf(request.id)
		writeReply(
			held,
			{
				id,
				role: "assistant",
				text: questionMessageText(request),
				completion: "complete",
				timestamp: now(),
			},
			"complete",
		)
		held.written.delete(id)
		holdPrompt(held, { kind: "question", botId: held.botId, request })
	}

	const apply = (held: Speaker, event: AgentEvent) => {
		switch (event.type) {
			case "messageStarted":
				if (isUnwritten(held, event.message.id)) {
					held.heldReply = event.message
				}
				return
			case "messageDelta":
				return streamReply(held, event.id, event.seq, event.text)
			case "activity":
				return noteActivity(held, event.activity)
			case "messageCompleted":
				return settleCompleted(held, event.message)
			case "questionRequested":
				return askQuestion(held, event.request)
			case "permissionRequested":
				return holdPrompt(held, {
					kind: "permission",
					botId: held.botId,
					request: event.request,
				})
			case "permissionResolved":
				return releasePrompt(held, event.id)
			case "turnEnded":
				return closeSpeaker(ENDING_FOR_OUTCOME[event.ended.outcome])
			case "failed":
				return closeSpeaker("failed")
			default:
				return
		}
	}

	const route = (scope: RuntimeScope | null, event: AgentEvent) => {
		const held = speaker
		if (!held || !isSameRuntimeScope(scope, held.scope)) {
			return
		}
		apply(held, event)
	}

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
	}

	const connect = () => {
		disconnect()
		detach = driver.subscribe(({ scope, event }) => route(scope, event))
		return detach
	}

	const attach = () => {
		connect()
		return disconnect
	}

	const openScope = async (
		conversationId: string,
		botId: string,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(
			conversationId,
			botId,
			now(),
			runs.get(botId)?.runtimeSessionId ?? null,
			null,
		)
		const scope = {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
		runs.set(botId, scope)
		return scope
	}

	const speak = async (summons: Summons, turn: OpenTurn) => {
		if (!conversation) {
			return
		}
		const conversationId = conversation.id
		const scope = await openScope(conversationId, summons.botId)
		speaker = {
			botId: summons.botId,
			scope,
			turn,
			openMessages: new Map(),
			settledMessages: new Set(),
			heldReply: null,
			written: new Map(),
			activities: [],
			pending: null,
			isDropped: false,
		}
		if (detach) {
			await connect()
		}
		await driver.startOrResumeSession(scope)
		const context = await store.boundedContext(
			conversationId,
			summons.botId,
			scope.runtimeSessionId,
			summons.promptId,
		)
		await driver.submitPrompt(scope, context)
	}

	const runNext = async () => {
		while (speaker === null && queue.waiting.length > 0) {
			const next = queue.waiting[0]
			const turn = activeTurn
			if (!turn) {
				return
			}
			queue = startedNext(queue)
			sync()
			try {
				await speak(next, turn)
				forgetFailure()
				sync()
				return
			} catch (reason) {
				speaker = null
				queue = closedSpeaker(queue)
				noteFailure(toTransportError(reason))
				sync()
			}
		}
		if (speaker === null && queue.waiting.length === 0 && activeTurn) {
			completeTurn(activeTurn)
			activeTurn = null
		}
	}

	const drive = () => {
		if (driving) {
			return
		}
		driving = runNext().finally(() => {
			driving = null
		})
	}

	const storePrompt = async (turn: OpenTurn, said: TranscriptMessage) => {
		await store.startTurn({
			id: turn.id,
			conversationId: said.conversationId,
			startedAt: said.createdAt,
		})
		await store.appendUserMessage({
			id: said.id,
			conversationId: said.conversationId,
			turnId: turn.id,
			authorBotId: null,
			repliedToMessageId: said.repliedToMessageId,
			content: said.content,
			createdAt: said.createdAt,
		})
	}

	const answeredIn = (conversationId: string, messageId?: string) => {
		if (!messageId) {
			return null
		}
		const shown = selectMessages(transcript.getState(), conversationId)
		return shown.some((message) => message.id === messageId) ? messageId : null
	}

	const summonedBy = (content: string, promptId: string): Summons[] => {
		const named = addresseesIn(content, presentBotIds())
		const lead = conversation ? leadOf(conversation) : undefined
		const answering = named.length > 0 ? named : lead ? [lead] : []
		return answering.map((botId) => ({ botId, promptId }))
	}

	const nameFrom = async (conversationId: string, text: string) => {
		const title = await driver.titleFor(text).catch(() => null)
		if (title) {
			options.onNamed?.(conversationId, title)
		}
	}

	const send = async (text: string, repliedToMessageId?: string) => {
		const trimmed = text.trim()
		if (!conversation || trimmed.length === 0) {
			return
		}
		const conversationId = conversation.id
		const isNamingItself =
			isNameless(conversation) && state.messages.length === 0
		const content = toMentionTokens(trimmed, mentionBots())
		const turn: OpenTurn = { id: newId(), promptId: newId() }
		const said: TranscriptMessage = {
			id: turn.promptId,
			conversationId,
			turnId: turn.id,
			seq: 0,
			role: "user",
			content,
			completion: "complete",
			createdAt: now(),
			authorBotId: null,
			repliedToMessageId: answeredIn(conversationId, repliedToMessageId),
			runtimeSessionId: null,
		}

		try {
			await enqueue(() => storePrompt(turn, said))
		} catch {
			refused = {
				id: said.id,
				text: trimmed,
				repliedToMessageId: said.repliedToMessageId,
			}
			sync()
			return
		}

		refused = null
		if (isNamingItself) {
			void nameFrom(conversationId, trimmed)
		}
		transcript.append(said)
		if (speaker) {
			speaker.isDropped = true
		} else if (activeTurn) {
			completeTurn(activeTurn)
		}
		queue = reopenedFor(queue, summonedBy(content, turn.promptId))
		activeTurn = turn
		sync()
		drive()
	}

	const sendAgain = (messageId: string) => {
		const held = refused
		return held?.id === messageId
			? send(held.text, held.repliedToMessageId ?? undefined)
			: Promise.resolve()
	}

	const recordAnswers = (
		held: Speaker,
		request: QuestionRequest,
		answers: QuestionAnswers,
	) => {
		const conversationId = conversation?.id
		const content = answeredText(request, answers)
		if (!conversationId || content.length === 0) {
			return
		}
		const id = newId()
		const createdAt = now()
		const repliedToMessageId = questionMessageIdOf(request.id)
		write(
			() =>
				store.appendUserMessage({
					id,
					conversationId,
					turnId: held.turn.id,
					authorBotId: null,
					repliedToMessageId,
					content,
					createdAt,
				}),
			() =>
				transcript.append({
					id,
					conversationId,
					turnId: held.turn.id,
					role: "user",
					content,
					completion: "complete",
					createdAt,
					authorBotId: null,
					repliedToMessageId,
					runtimeSessionId: null,
				}),
		)
	}

	const answer = async (id: string, answers: QuestionAnswers) => {
		const held = speaker
		const pending = held?.pending
		if (!held || pending?.kind !== "question" || pending.request.id !== id) {
			return
		}
		await driver.answerQuestion(held.scope, id, answers).catch(() => undefined)
		recordAnswers(held, pending.request, answers)
		releasePrompt(held, id)
	}

	const respond = async (id: string, decision: PermissionDecision) => {
		const held = speaker
		if (held?.pending?.request.id !== id) {
			return
		}
		await driver
			.respondToPermission(held.scope, id, decision)
			.catch(() => undefined)
		releasePrompt(held, id)
	}

	const stop = async () => {
		const held = speaker
		if (held?.pending) {
			await respond(held.pending.request.id, "deny")
		}
		queue = reopenedFor(queue, [])
		if (held) {
			held.isDropped = true
		}
		sync()
		if (held) {
			await driver.cancelTurn(held.scope).catch(() => undefined)
			return
		}
		drive()
	}

	const open = async (next: Conversation) => {
		const isSameConversation = conversation?.id === next.id
		conversation = next
		if (isSameConversation) {
			sync()
			return
		}
		queue = emptyQueue
		activeTurn = null
		refused = null
		forgetFailure()
		sync()
		await enqueue(() => transcript.load(next.id)).catch(() => undefined)
		sync()
	}

	const follow = (isAtLiveEdge: boolean) => {
		if (conversation) {
			transcript.follow(conversation.id, isAtLiveEdge)
		}
	}

	const dismissError = (id: string) => {
		if (latestError?.id !== id) {
			return
		}
		forgetFailure()
		sync()
	}

	const loadOlder = async () => {
		if (!conversation || !state.hasOlder || state.isLoadingOlder) {
			return
		}
		const conversationId = conversation.id
		settle({ ...state, isLoadingOlder: true })
		try {
			await enqueue(() => transcript.loadOlder(conversationId))
			forgetFailure()
		} catch (reason) {
			noteFailure(toReadError(reason))
		} finally {
			settle({ ...state, isLoadingOlder: false, latestError })
		}
	}

	const pin = (messageId: string, blockIndex: number) => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() =>
					store.pinMessage(conversationId, messageId, blockIndex, now()),
				)
			: Promise.resolve()
	}

	const unpin = (messageId: string, blockIndex: number) => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() => store.unpinMessage(conversationId, messageId, blockIndex))
			: Promise.resolve()
	}

	const pins = () => {
		const conversationId = conversation?.id
		return conversationId
			? enqueue(() => store.pinnedMessages(conversationId))
			: Promise.resolve(NO_PINS)
	}

	const shutdown = async () => {
		const held = speaker
		if (held) {
			await driver.shutdown(held.scope).catch(() => undefined)
		}
		disconnect()
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
		open,
		loadOlder,
		follow,
		send,
		sendAgain,
		pin,
		unpin,
		pins,
		dismissError,
		answer,
		respond,
		stop,
		shutdown,
	}
}
