import type { SubmittedAttachment } from "./attachments-contract"
import {
	type ChatAction,
	type ChatState,
	canStopTurn,
	chatReducer,
	initialChatState,
	isSameCommandList,
	isSameRuntimeScope,
	isSessionReady,
	isTurnBusy,
} from "./chat-state"
import type { ChatDriver } from "./driver"
import {
	ASKED_FOR,
	EVOLVED,
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
	AgentCommand,
	AgentEvent,
	ChatMessage,
	CheckReport,
	MessageCompletion,
	PermissionDecision,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
	SessionHandle,
	TransportError,
	TurnOutcome,
} from "../agent/contract"
import type {
	MessagePin,
	MessageReference,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import type { TerminalCompletion } from "../conversations/transcript-contract"
import { createTranscriptController } from "../conversations/transcript-controller"
import {
	selectHasMore,
	selectMessages,
} from "../conversations/transcript-state"

export type ChatController = {
	getState: () => ChatState
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	preflight: (resume?: string) => Promise<SessionHandle | null>
	open: (botId: string) => Promise<SessionHandle | null>
	close: (botId: string) => Promise<void>
	redescribe: (botId: string) => void
	restart: () => Promise<SessionHandle | null>
	rotate: () => Promise<SessionHandle | null>
	loadOlder: () => Promise<void>
	send: (text: string, repliedToMessageId?: string) => Promise<void>
	sendTo: (
		botId: string,
		text: string,
		repliedToMessageId?: string,
	) => Promise<void>
	reference: (messageId: string) => Promise<MessageReference | null>
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
	storeAttachments: (
		botId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	stop: () => Promise<void>
	discard: (id: string) => void
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

export type ChatControllerOptions = {
	newId?: () => string
	now?: () => number
	promptsPerRun?: number
}

const INTERRUPTED: TerminalCompletion = "interrupted"

const NO_PINS: MessagePin[] = []

const ENDING_FOR: Record<MessageCompletion, TerminalCompletion | null> = {
	streaming: null,
	complete: "complete",
	cancelled: "cancelled",
	failed: "failed",
}

type PromptOutcome = "submitted" | "unwritten" | "refused"

const ENDING_FOR_OUTCOME: Record<TurnOutcome, TerminalCompletion> = {
	completed: "complete",
	cancelled: "cancelled",
	failed: "failed",
}

type BotChat = {
	id: string
	state: ChatState
	run: LiveRun
	activeTurn: { id: string; promptId: string } | null
	heldReply: ChatMessage | null
	openMessages: Map<string, number>
	settledMessages: Set<string>
	commands: { stored: AgentCommand[]; announced: boolean }
	pendingPreflight: Promise<SessionHandle | null> | null
	pendingRotation: Promise<SessionHandle | null> | null
	sending: boolean
	draining: Promise<void> | null
}

function toTransportError(reason: unknown): TransportError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as TransportError
	}
	return { kind: "writeFailed", detail: String(reason) }
}

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

	const bots = new Map<string, BotChat>()
	let selected: BotChat | null = null
	let detach: Promise<() => void> | null = null
	const listeners = new Set<() => void>()

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
			commands: { stored: [], announced: false },
			pendingPreflight: null,
			pendingRotation: null,
			sending: false,
			draining: null,
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

	const announce = (bot: BotChat, event: AgentEvent) =>
		dispatch(bot, { type: "driverEvent", scope: bot.state.runtime, event })

	const report = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toTransportError(reason) })

	const reportStore = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toStoreError(reason) })

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

	const syncTranscript = () => {
		for (const bot of bots.values()) {
			syncBot(bot)
		}
	}

	transcript.subscribe(syncTranscript)

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

	const isUnwritten = (bot: BotChat, id: string) =>
		!bot.openMessages.has(id) && !bot.settledMessages.has(id)

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
					repliedToMessageId: turn.promptId,
					runtimeSessionId: null,
				}),
		)
		streamReply(bot, message.id, 1, message.text, conversationId)
	}

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

	const isWorthKeeping = (
		message: ChatMessage,
		completion: TerminalCompletion,
	) => message.text.length > 0 || completion !== "complete"

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

	const recordCommands = (
		bot: BotChat,
		scope: RuntimeScope | null,
		commands: AgentCommand[],
	) => {
		if (!scope) {
			return
		}
		const held = bot.commands.stored
		bot.commands.stored = commands
		bot.commands.announced = true
		if (isSameCommandList(held, commands)) {
			return
		}
		write(bot, () => store.recordBotCommands(scope.botId, commands))
	}

	const persist = (
		bot: BotChat,
		scope: RuntimeScope | null,
		event: AgentEvent,
	) => {
		const conversationId = scope?.conversationId
		if (!conversationId) {
			return
		}
		switch (event.type) {
			case "sessionReady":
				return recordProviderSession(bot, scope, event.sessionId)
			case "commandsListed":
				return recordCommands(bot, scope, event.commands)
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

	const route = (scope: RuntimeScope | null, event: AgentEvent) => {
		for (const bot of bots.values()) {
			if (!isSameRuntimeScope(scope, bot.state.runtime)) {
				continue
			}
			dispatch(bot, { type: "driverEvent", scope, event })
			noteFailure(bot, event)
			noteEvolution(bot, event)
			persist(bot, scope, event)
			pump(bot)
		}
	}

	const connect = () => {
		disconnect()
		detach = driver.subscribe(({ scope, event }) => route(scope, event))
		return detach
	}

	const noteFailure = (bot: BotChat, event: AgentEvent) => {
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

	const spend = (bot: BotChat, reason: RotationReason) => {
		if (!bot.state.sessionOpen) {
			return
		}
		bot.run.spent ??= reason
	}

	const noteEvolution = (bot: BotChat, event: AgentEvent) => {
		if (event.type !== "botEvolved") {
			return
		}
		spend(bot, EVOLVED)
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

		bot.run = openedRun(Boolean(resume))
		dispatch(bot, { type: "sessionReset", runtime, sessionId: resume ?? null })
		try {
			if (detach) {
				await connect()
			}
			const handle = await driver.startOrResumeSession(runtime, resume)
			dispatch(bot, { type: "sessionOpened" })
			pump(bot)
			return handle
		} catch (reason) {
			const error = toTransportError(reason)
			bot.run.spent ??= rotationReasonForStartFailure(error)
			announce(bot, { type: "failed", error })
			return null
		}
	}

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

	const recallCommands = (bot: BotChat) =>
		store.botCommands(bot.id).then(
			(commands) => {
				if (bot.commands.announced) {
					return
				}
				bot.commands.stored = commands
				dispatch(bot, { type: "commandsRecalled", commands })
			},
			() => undefined,
		)

	const openConversation = async (bot: BotChat) => {
		try {
			const chat = await store.mainChat(bot.id)
			dispatch(bot, { type: "conversationOpened", conversationId: chat.id })
			void recallCommands(bot)
			syncBot(bot)
			await enqueue(() => transcript.load(chat.id))
			syncBot(bot)
		} catch (reason) {
			reportStore(bot, reason)
		}
	}

	const redescribe = (botId: string) => {
		const bot = bots.get(botId)
		if (!bot) {
			return
		}
		spend(bot, REDESCRIBED)
	}

	const isAnswerable = (bot: BotChat) =>
		bot.state.sessionOpen && bot.run.spent === null

	const openedFor = (bot: BotChat) =>
		isAnswerable(bot) ? Promise.resolve(null) : preflightFor(bot)

	const open = async (nextBotId: string) => {
		const bot = botFor(nextBotId)
		selected = bot
		publish()
		await openConversation(bot)
		const handle = await openedFor(bot)
		pump(bot)
		return handle
	}

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

	const runRotation = async (bot: BotChat, reason: RotationReason) => {
		try {
			await capture(bot)
		} catch (refusal) {
			reportStore(bot, refusal)
			return null
		}
		return startFor(bot, undefined, reason)
	}

	const rotateFor = (bot: BotChat, reason: RotationReason) => {
		bot.pendingRotation ??= runRotation(bot, reason).finally(() => {
			bot.pendingRotation = null
		})
		return bot.pendingRotation
	}

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

	const referenceFor = (bot: BotChat, messageId: string) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.messageReference(conversationId, messageId))
			: Promise.resolve(null)
	}

	const pinFor = (bot: BotChat, messageId: string, blockIndex: number) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() =>
					store.pinMessage(conversationId, messageId, blockIndex, now()),
				)
			: Promise.resolve()
	}

	const unpinFor = (bot: BotChat, messageId: string, blockIndex: number) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.unpinMessage(conversationId, messageId, blockIndex))
			: Promise.resolve()
	}

	const pinsOf = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.pinnedMessages(conversationId))
			: Promise.resolve(NO_PINS)
	}

	const contextFor = async (bot: BotChat, promptId: string, text: string) => {
		const conversationId = bot.state.conversationId
		if (bot.run.carried || !conversationId) {
			return text
		}
		await capture(bot)
		return store.boundedContext(conversationId, bot.id, promptId)
	}

	const submit = async (bot: BotChat, id: string, text: string) => {
		const runtime = bot.state.runtime
		if (!runtime || !isAnswerable(bot)) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: { kind: "notStarted" },
			})
			return false
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
			return false
		}
		try {
			await driver.submitPrompt(runtime, carried)
			bot.run.carried = true
			bot.run.prompts += 1
			return true
		} catch (reason) {
			dispatch(bot, {
				type: "promptRejected",
				id,
				error: toTransportError(reason),
			})
			return false
		}
	}

	const admit = async (bot: BotChat, submission: () => Promise<void>) => {
		if (bot.sending || isTurnBusy(bot.state.turn)) {
			report(bot, { kind: "turnAlreadyRunning" })
			return
		}
		await claim(bot, submission)
	}

	const claim = async <T>(bot: BotChat, submission: () => Promise<T>) => {
		bot.sending = true
		try {
			return await submission()
		} finally {
			bot.sending = false
		}
	}

	const promptRow = (
		conversationId: string,
		content: string,
		repliedToMessageId?: string,
	) => ({
		id: newId(),
		turnId: newId(),
		conversationId,
		content,
		createdAt: now(),
		repliedToMessageId: repliedToMessageId ?? null,
	})

	type PromptRow = ReturnType<typeof promptRow>

	const storePrompt = async (said: PromptRow) => {
		await store.startTurn({
			id: said.turnId,
			conversationId: said.conversationId,
			startedAt: said.createdAt,
		})
		await store.appendUserMessage({
			id: said.id,
			conversationId: said.conversationId,
			turnId: said.turnId,
			authorBotId: null,
			repliedToMessageId: said.repliedToMessageId,
			content: said.content,
			createdAt: said.createdAt,
		})
	}

	const showPrompt = (said: PromptRow) =>
		transcript.append({
			id: said.id,
			conversationId: said.conversationId,
			turnId: said.turnId,
			role: "user",
			content: said.content,
			completion: "complete",
			createdAt: said.createdAt,
			repliedToMessageId: said.repliedToMessageId,
			runtimeSessionId: null,
		})

	const sendPrompt = async (
		bot: BotChat,
		trimmed: string,
		repliedToMessageId?: string,
	): Promise<PromptOutcome> => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			reportStore(bot, { kind: "unavailable" })
			return "unwritten"
		}
		await rotateIfDue(bot)
		dispatch(bot, { type: "promptSubmitted" })

		const said = promptRow(conversationId, trimmed, repliedToMessageId)
		try {
			await enqueue(() => storePrompt(said))
		} catch (reason) {
			dispatch(bot, {
				type: "promptRejected",
				id: null,
				error: toStoreError(reason),
			})
			return "unwritten"
		}

		showPrompt(said)
		bot.activeTurn = { id: said.turnId, promptId: said.id }
		return (await submit(bot, said.id, trimmed)) ? "submitted" : "refused"
	}

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

	const canSend = (bot: BotChat) => canDeliver(bot) && isSessionReady(bot.state)

	const canDeliver = (bot: BotChat) =>
		!bot.sending &&
		bot.state.conversationId !== null &&
		!isTurnBusy(bot.state.turn)

	const sessionForOutbox = async (bot: BotChat) => {
		if (isSessionReady(bot.state)) {
			return true
		}
		await openedFor(bot)
		return canSend(bot)
	}

	const drainOutbox = async (bot: BotChat) => {
		if (!(await sessionForOutbox(bot))) {
			return
		}
		while (canSend(bot)) {
			const entry = bot.state.outbox[0]
			if (!entry) {
				return
			}
			dispatch(bot, { type: "outboxEntryRemoved", id: entry.id })
			const outcome = await claim(bot, () =>
				sendPrompt(bot, entry.text, entry.repliedToMessageId ?? undefined),
			)
			if (outcome === "unwritten") {
				dispatch(bot, { type: "promptReturned", entry })
			}
			if (outcome !== "submitted") {
				return
			}
		}
	}

	const pump = (bot: BotChat) => {
		if (bot.draining || bot.state.outbox.length === 0 || !canDeliver(bot)) {
			return
		}
		bot.draining = drainOutbox(bot)
			.catch((reason) => report(bot, reason))
			.finally(() => {
				bot.draining = null
			})
	}

	const send = async (bot: BotChat, text: string, repliedTo?: string) => {
		const trimmed = text.trim()
		if (trimmed.length === 0) {
			return
		}
		await denyPendingQuestion(bot)
		const outcome = canSend(bot)
			? await claim(bot, () => sendPrompt(bot, trimmed, repliedTo))
			: "unwritten"
		if (outcome === "unwritten") {
			dispatch(bot, {
				type: "promptHeld",
				entry: {
					id: newId(),
					text: trimmed,
					repliedToMessageId: repliedTo ?? null,
				},
			})
		}
		pump(bot)
	}

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

	const recordHeld = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		bot.run.carried = false
		const held = bot.state.outbox
		dispatch(bot, { type: "outboxCleared" })
		for (const entry of held) {
			const said = promptRow(
				conversationId,
				entry.text,
				entry.repliedToMessageId ?? undefined,
			)
			write(
				bot,
				() => storePrompt(said),
				() => showPrompt(said),
			)
		}
	}

	const stop = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime || !canStopTurn(bot.state.turn)) {
			return
		}
		announce(bot, { type: "turnChanged", state: "stopping" })
		recordHeld(bot)
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

	const recordAnswers = (
		bot: BotChat,
		request: QuestionRequest,
		answers: QuestionAnswers,
	) => {
		const conversationId = bot.state.conversationId
		const turn = bot.activeTurn
		const content = request.questions
			.filter(({ question }) => answers[question])
			.map(({ question }) => `${question}\n\n${answers[question]}`)
			.join("\n\n")
		if (!conversationId || !turn || content.length === 0) {
			return
		}
		const id = newId()
		const createdAt = now()
		write(
			bot,
			() =>
				store.appendUserMessage({
					id,
					conversationId,
					turnId: turn.id,
					authorBotId: null,
					repliedToMessageId: null,
					content,
					createdAt,
				}),
			() =>
				transcript.append({
					id,
					conversationId,
					turnId: turn.id,
					role: "user",
					content,
					completion: "complete",
					createdAt,
					repliedToMessageId: null,
					runtimeSessionId: null,
				}),
		)
	}

	const answer = (bot: BotChat, id: string, answers: QuestionAnswers) => {
		const runtime = bot.state.runtime
		const request = bot.state.question
		if (!runtime || request?.id !== id) {
			return Promise.resolve()
		}
		return driver
			.answerQuestion(runtime, id, answers)
			.then(() => recordAnswers(bot, request, answers))
			.catch((reason) => report(bot, reason))
	}

	const denyPendingQuestion = (bot: BotChat) => {
		const request = bot.state.question
		return request ? respond(bot, request.id, "deny") : Promise.resolve()
	}

	const shutdown = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch((reason) => report(bot, reason))
	}

	const onSelected = <T>(
		ask: (bot: BotChat) => Promise<T>,
		nothing: T,
	): Promise<T> => (selected ? ask(selected) : Promise.resolve(nothing))

	const forSelected = (act: (bot: BotChat) => void) => {
		if (selected) {
			act(selected)
		}
	}

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
		sendTo: async (botId, text, repliedToMessageId) => {
			const bot = bots.get(botId)
			if (bot) {
				await send(bot, text, repliedToMessageId)
			}
		},
		reference: (messageId) =>
			onSelected((bot) => referenceFor(bot, messageId), null),
		pin: (messageId, blockIndex) =>
			onSelected((bot) => pinFor(bot, messageId, blockIndex), undefined),
		unpin: (messageId, blockIndex) =>
			onSelected((bot) => unpinFor(bot, messageId, blockIndex), undefined),
		pins: () => onSelected(pinsOf, NO_PINS),
		storeAttachments,
		stop: () => onSelected(stop, undefined),
		discard: (id) =>
			forSelected((bot) => dispatch(bot, { type: "outboxEntryRemoved", id })),
		respond: (id, decision) =>
			onSelected((bot) => respond(bot, id, decision), undefined),
		answer: (id, answers) =>
			onSelected((bot) => answer(bot, id, answers), undefined),
		retry: (id) =>
			onSelected((bot) => admit(bot, () => retryPrompt(bot, id)), undefined),
		shutdown: () => onSelected(shutdown, undefined),
	}
}
