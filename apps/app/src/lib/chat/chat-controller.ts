import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

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
	toReadError,
	toStoreError,
	toTransportError,
} from "./chat-state"
import type { ChatDriver } from "./driver"
import {
	answeredText,
	answersFromText,
	questionMessageIdOf,
	questionMessageText,
} from "./question-message"
import { ENDING_FOR, ENDING_FOR_OUTCOME, isWorthKeeping } from "./reply-endings"
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
	PermissionDecision,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
	SessionHandle,
} from "../agent/contract"
import type {
	MessagePin,
	MessageReference,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import type {
	TerminalCompletion,
	TranscriptMessage,
} from "../conversations/transcript-contract"
import { createTranscriptController } from "../conversations/transcript-controller"
import {
	selectHasMore,
	selectMessages,
} from "../conversations/transcript-state"
import { createReportedRunsReader } from "../routines/create-run-port"
import {
	indexedByTurnId,
	type ReportedRun,
	type RunReportDraft,
} from "../routines/routine-contract"
import type { ReportedRunsReader } from "../routines/run-port"

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
	leave: (botId: string) => void
	redescribe: (botId: string) => void
	restart: () => Promise<SessionHandle | null>
	rotate: () => Promise<SessionHandle | null>
	loadOlder: () => Promise<void>
	follow: (isAtLiveEdge: boolean) => void
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
	reportRun: (draft: RunReportDraft) => Promise<string>
	storeAttachments: (
		botId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	stop: () => Promise<void>
	discard: (id: string) => void
	dismissError: (id: string) => void
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

export type ChatControllerOptions = {
	newId?: () => string
	now?: () => number
	promptsPerRun?: number
	readReportedRuns?: ReportedRunsReader
}

const INTERRUPTED: TerminalCompletion = "interrupted"

const NO_PINS: MessagePin[] = []

type PromptOutcome = "submitted" | "unwritten" | "refused"

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

type TransitionKind = "open" | "close"

type BotTransition = {
	kind: TransitionKind
	settled: Promise<unknown>
}

export function createChatController(
	driver: ChatDriver,
	store: TranscriptStore,
	options: ChatControllerOptions = {},
): ChatController {
	const newId = options.newId ?? (() => crypto.randomUUID())
	const now = options.now ?? (() => Date.now())
	const promptsPerRun = options.promptsPerRun ?? PROMPTS_PER_RUN
	const readReportedRuns =
		options.readReportedRuns ?? createReportedRunsReader()
	const transcript = createTranscriptController(store)

	const bots = new Map<string, BotChat>()
	const transitions = new Map<string, BotTransition>()
	let chosenBotId: string | null = null
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

	const chosenBot = () =>
		chosenBotId === null ? null : (bots.get(chosenBotId) ?? null)

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

	const reportRead = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toReadError(reason) })

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
					authorBotId: bot.id,
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

	const recordQuestion = (
		bot: BotChat,
		request: QuestionRequest,
		conversationId: string,
	) => {
		if (bot.state.question?.id !== request.id) {
			return
		}
		writeReply(
			bot,
			{
				id: questionMessageIdOf(request.id),
				role: "assistant",
				text: questionMessageText(request),
				completion: "complete",
				timestamp: now(),
			},
			"complete",
			conversationId,
		)
	}

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
			case "questionRequested":
				return recordQuestion(bot, event.request, conversationId)
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
		bot: BotChat,
		reason: RotationReason | null,
	): Promise<RuntimeScope> => {
		const opened = await store.openRuntimeSession(
			conversationId,
			bot.id,
			now(),
			bot.state.runtime?.runtimeSessionId ?? null,
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
			runtime = await openRun(conversationId, bot, rotatedFor)
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

	const rememberCause = (bot: BotChat, reported: ReportedRun) =>
		dispatch(bot, {
			type: "causesChanged",
			causes: new Map(bot.state.reportedCauses).set(reported.turnId, reported),
		})

	const readCauses = async (bot: BotChat, conversationId: string) => {
		try {
			const reported = await readReportedRuns(conversationId)
			if (reported.length === 0) {
				return
			}
			dispatch(bot, {
				type: "causesChanged",
				causes: new Map([
					...indexedByTurnId(reported),
					...bot.state.reportedCauses,
				]),
			})
		} catch {
			raiseFailureNotice({
				title: i18n.t("chat:transcript.cause.unavailable.title"),
				description: i18n.t("chat:transcript.cause.unavailable.description"),
			})
		}
	}

	const openConversation = async (bot: BotChat) => {
		try {
			const chat = await store.mainChat(bot.id)
			dispatch(bot, { type: "conversationOpened", conversationId: chat.id })
			void recallCommands(bot)
			void readCauses(bot, chat.id)
			syncBot(bot)
			await enqueue(() => transcript.load(chat.id))
			syncBot(bot)
		} catch (reason) {
			reportStore(bot, reason)
		}
	}

	const storeReport = async (reported: TranscriptMessage) => {
		await store.startTurn({
			id: reported.turnId,
			conversationId: reported.conversationId,
			startedAt: reported.createdAt,
		})
		await store.openAssistantMessage({
			id: reported.id,
			conversationId: reported.conversationId,
			turnId: reported.turnId,
			authorBotId: reported.authorBotId,
			repliedToMessageId: null,
			createdAt: reported.createdAt,
		})
		await store.appendText(reported.id, reported.content)
		await store.finalizeMessage(reported.id, "complete")
		await store.completeTurn(reported.turnId, now())
	}

	const openChatOf = ({ botId, conversationId }: RunReportDraft) => {
		const bot = bots.get(botId)
		return bot?.state.conversationId === conversationId ? bot : null
	}

	const reportRun = async (draft: RunReportDraft) => {
		const reported: TranscriptMessage = {
			id: newId(),
			conversationId: draft.conversationId,
			turnId: newId(),
			seq: 0,
			role: "assistant",
			content: draft.text,
			completion: "complete",
			createdAt: now(),
			authorBotId: draft.botId,
			repliedToMessageId: null,
			runtimeSessionId: draft.runtimeSessionId,
		}
		await enqueue(() => storeReport(reported))
		const bot = openChatOf(draft)
		if (bot) {
			rememberCause(bot, {
				turnId: reported.turnId,
				routineTitle: draft.routineTitle,
				triggerSourceId: draft.triggerSourceId,
			})
			transcript.append(reported)
		}
		return reported.turnId
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

	const runOpen = async (nextBotId: string) => {
		const bot = botFor(nextBotId)
		await openConversation(bot)
		const handle = await openedFor(bot)
		pump(bot)
		return handle
	}

	const runClose = async (botId: string) => {
		const bot = bots.get(botId)
		if (!bot) {
			return
		}
		bots.delete(botId)
		publish()
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch(() => undefined)
	}

	const forget = (botId: string, transition: BotTransition) => {
		if (transitions.get(botId) === transition) {
			transitions.delete(botId)
		}
	}

	const transitionFor = <T>(
		botId: string,
		kind: TransitionKind,
		run: () => Promise<T>,
	) => {
		const inFlight = transitions.get(botId)
		if (inFlight?.kind === kind) {
			return inFlight.settled as Promise<T>
		}
		const settled = (inFlight?.settled ?? Promise.resolve()).then(run, run)
		const transition: BotTransition = { kind, settled }
		transitions.set(botId, transition)
		const drop = () => forget(botId, transition)
		settled.then(drop, drop)
		return settled
	}

	const leaveThread = (botId: string) => {
		const conversationId = bots.get(botId)?.state.conversationId
		if (conversationId) {
			transcript.leave(conversationId)
		}
	}

	const choose = (botId: string | null) => {
		chosenBotId = botId
		publish()
	}

	const open = (botId: string) => {
		choose(botId)
		return transitionFor(botId, "open", () => runOpen(botId))
	}

	const close = (botId: string) => {
		if (chosenBotId === botId) {
			choose(null)
		}
		return transitionFor(botId, "close", () => runClose(botId))
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

	const follow = (bot: BotChat, isAtLiveEdge: boolean) => {
		const conversationId = bot.state.conversationId
		if (conversationId) {
			transcript.follow(conversationId, isAtLiveEdge)
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
			reportRead(bot, reason)
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
		const runtime = bot.state.runtime
		if (bot.run.carried || !conversationId || !runtime) {
			return text
		}
		await capture(bot)
		return store.boundedContext(
			conversationId,
			bot.id,
			runtime.runtimeSessionId,
			promptId,
		)
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
			authorBotId: null,
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
		const asked = bot.state.question
		if (asked) {
			await answer(bot, asked.id, answersFromText(asked, trimmed))
			return
		}
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
		const content = answeredText(request, answers)
		if (!conversationId || !turn || content.length === 0) {
			return
		}
		const id = newId()
		const createdAt = now()
		const repliedToMessageId = questionMessageIdOf(request.id)
		write(
			bot,
			() =>
				store.appendUserMessage({
					id,
					conversationId,
					turnId: turn.id,
					authorBotId: null,
					repliedToMessageId,
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
					authorBotId: null,
					repliedToMessageId,
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
	): Promise<T> => {
		const bot = chosenBot()
		return bot ? ask(bot) : Promise.resolve(nothing)
	}

	const forSelected = (act: (bot: BotChat) => void) => {
		const bot = chosenBot()
		if (bot) {
			act(bot)
		}
	}

	return {
		getState: () => chosenBot()?.state ?? initialChatState,
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
		leave: leaveThread,
		redescribe,
		restart: () =>
			onSelected(
				(bot) => preflightFor(bot, bot.state.sessionId ?? undefined),
				null,
			),
		rotate: () => onSelected((bot) => rotateFor(bot, ASKED_FOR), null),
		loadOlder: () => onSelected(loadOlder, undefined),
		follow: (isAtLiveEdge) => forSelected((bot) => follow(bot, isAtLiveEdge)),
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
		reportRun,
		storeAttachments,
		stop: () => onSelected(stop, undefined),
		discard: (id) =>
			forSelected((bot) => dispatch(bot, { type: "outboxEntryRemoved", id })),
		dismissError: (id) =>
			forSelected((bot) => dispatch(bot, { type: "errorDismissed", id })),
		respond: (id, decision) =>
			onSelected((bot) => respond(bot, id, decision), undefined),
		answer: (id, answers) =>
			onSelected((bot) => answer(bot, id, answers), undefined),
		retry: (id) =>
			onSelected((bot) => admit(bot, () => retryPrompt(bot, id)), undefined),
		shutdown: () => onSelected(shutdown, undefined),
	}
}
