import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import type { MessageAuthor } from "@workspace/ui/components/message"

import type { ChatController } from "./chat-controller"
import type { ChatError, ChatState } from "./chat-state"
import { isSessionReady, isTurnBusy } from "./chat-state"
import { type ReplyTarget, workingStateFor } from "./screen-model"
import type { Chat } from "./use-chat"
import type { WorkingState } from "./working-kind"

import { avatarSrc } from "../host"
import type {
	ConversationController,
	ConversationState,
	RefusedMessage,
} from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { Bot, Conversation } from "../conversations/store-contract"

export type ThreadFace = ConversationBot

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
	latestError?: ChatError
	refused: RefusedMessage | null
	rejectedPromptId: string | null
	workingBotIds: (string | null)[]
	loopingPair: [string, string] | null
}

const NO_WORKING_BOT_IDS: (string | null)[] = []

const botFactsOf = (thread: LoadedBotThread): ThreadFacts => ({
	id: thread.bot.id,
	bot: thread.bot,
	botController: thread.controller,
	conversation: null,
	botWork: workingStateFor(thread.state),
	isReady: isSessionReady(thread.state),
	isBusy: isTurnBusy(thread.state.turn),
	isLoadingOlder: thread.state.loadingOlder,
	isPromptPending:
		thread.state.question !== null || thread.state.permission !== null,
	isOverlayOpen: thread.isOverlayOpen,
	latestError: thread.state.errors.at(-1),
	refused: null,
	rejectedPromptId: thread.state.rejectedPromptId,
	workingBotIds: NO_WORKING_BOT_IDS,
	loopingPair: null,
})

const conversationFactsOf = (
	thread: LoadedConversationThread,
): ThreadFacts => ({
	id: thread.conversation.id,
	bot: null,
	botController: null,
	conversation: thread.conversation,
	botWork: null,
	isReady: false,
	isBusy: thread.state.speakingBotId !== null,
	isLoadingOlder: thread.state.isLoadingOlder,
	isPromptPending: false,
	isOverlayOpen: false,
	latestError: undefined,
	refused: thread.state.refusedMessage,
	rejectedPromptId: null,
	workingBotIds: [thread.state.speakingBotId, ...thread.state.waitingBotIds],
	loopingPair: thread.state.loopingPair,
})

export const factsOf = (thread: LoadedThread): ThreadFacts =>
	thread.kind === "bot" ? botFactsOf(thread) : conversationFactsOf(thread)
