import type { MessageAuthor } from "@workspace/ui/components/message"
import type { RosterBot } from "@workspace/ui/components/roster"

import type { ChatController } from "./chat-controller"
import type { ChatError, ChatState } from "./chat-state"
import { isSessionReady, isTurnBusy } from "./chat-state"
import { type ReplyTarget, workingStateFor } from "./screen-model"
import type { Chat } from "./use-chat"
import type { WorkingState } from "./working-kind"

import { avatarSrc } from "../host"
import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import type {
	ConversationController,
	ConversationState,
	PendingPrompt,
	RefusedMessage,
} from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import { presentParticipants } from "../conversations/roster-conversations"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { ReportedRunsByTurnId } from "../routines/routine-contract"

export type ThreadFace = RosterBot

export type ThreadAuthors = ReadonlyMap<string, MessageAuthor>

export type ThreadQuotes = ReadonlyMap<string, ReplyTarget>

export type BotThread = {
	kind: "bot"
	bot: Bot
	chat: Chat
	isSettingsOpen: boolean
	isOverlayOpen: boolean
	onToggleSettings: () => void
}

export type ConversationThread = {
	kind: "conversation"
	conversation: Conversation
	runtimes: ConversationRuntimes
	isSettingsOpen: boolean
	onOpenSettings: (conversationId: string) => void
}

export type Thread = BotThread | ConversationThread

export type LoadedBotThread = BotThread & {
	state: ChatState
	controller: ChatController
}

export type LoadedConversationThread = ConversationThread & {
	state: ConversationState
	controller: ConversationController
}

export type LoadedThread = LoadedBotThread | LoadedConversationThread

export const faceOfBot = (bot: Bot): ThreadFace => ({
	id: bot.id,
	name: bot.name,
	animal: bot.avatarAnimal,
	blot: bot.avatarBlot ?? undefined,
	image: avatarSrc(bot.avatarImagePath),
})

export type ThreadPermission = {
	request: PermissionRequest
	authorBotId: string | null
}

export type ThreadFacts = {
	id: string
	bot: Bot | null
	botController: ChatController | null
	conversation: Conversation | null
	botWork: WorkingState | null
	isReady: boolean
	isBusy: boolean
	isLoadingOlder: boolean
	isPromptPending: boolean
	isOverlayOpen: boolean
	canAttach: boolean
	permission: ThreadPermission | null
	latestError?: ChatError
	question: QuestionRequest | null
	refused: RefusedMessage | null
	rejectedPromptId: string | null
	workingBotIds: (string | null)[]
	loopingPair: [string, string] | null
	causes: ReportedRunsByTurnId
}

const NO_WORKING_BOT_IDS: (string | null)[] = []

const NO_CAUSES: ReportedRunsByTurnId = new Map()

const questionIn = (prompt: PendingPrompt | null): QuestionRequest | null =>
	prompt?.kind === "question" ? prompt.request : null

const permissionIn = (prompt: PendingPrompt | null): ThreadPermission | null =>
	prompt?.kind === "permission"
		? { request: prompt.request, authorBotId: prompt.botId }
		: null

const permissionOf = (
	request: PermissionRequest | null,
): ThreadPermission | null => (request ? { request, authorBotId: null } : null)

const botFactsOf = (thread: LoadedBotThread): ThreadFacts => {
	const isReady = isSessionReady(thread.state)

	return {
		id: thread.bot.id,
		bot: thread.bot,
		botController: thread.controller,
		conversation: null,
		botWork: workingStateFor(thread.state),
		isReady,
		isBusy: isTurnBusy(thread.state.turn),
		isLoadingOlder: thread.state.loadingOlder,
		isPromptPending: thread.state.permission !== null,
		isOverlayOpen: thread.isOverlayOpen,
		canAttach: isReady,
		permission: permissionOf(thread.state.permission),
		latestError: thread.state.errors.at(-1),
		question: thread.state.question,
		refused: null,
		rejectedPromptId: thread.state.rejectedPromptId,
		workingBotIds: NO_WORKING_BOT_IDS,
		loopingPair: null,
		causes: NO_CAUSES,
	}
}

const conversationFactsOf = (
	thread: LoadedConversationThread,
): ThreadFacts => ({
	id: thread.conversation.id,
	bot: null,
	botController: null,
	conversation: thread.conversation,
	botWork: null,
	isReady: false,
	isBusy: thread.state.speakers.length > 0,
	isLoadingOlder: thread.state.isLoadingOlder,
	isPromptPending: false,
	isOverlayOpen: false,
	canAttach: presentParticipants(thread.conversation).length > 0,
	permission: permissionIn(thread.state.pendingPrompt),
	latestError: thread.state.latestError ?? undefined,
	question: questionIn(thread.state.pendingPrompt),
	refused: thread.state.refusedMessage,
	rejectedPromptId: null,
	workingBotIds: [
		...thread.state.speakers.map(({ botId }) => botId),
		...thread.state.waitingBotIds,
	],
	loopingPair: thread.state.loopingPair,
	causes: thread.state.reportedCauses,
})

export const factsOf = (thread: LoadedThread): ThreadFacts =>
	thread.kind === "bot" ? botFactsOf(thread) : conversationFactsOf(thread)
