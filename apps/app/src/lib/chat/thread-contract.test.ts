import { describe, expect, it } from "vitest"

import type { PermissionRequest } from "@/lib/agent/contract"
import type { ChatController } from "@/lib/chat/chat-controller"
import { type ChatState, initialChatState } from "@/lib/chat/chat-state"
import {
	factsOf,
	type LoadedBotThread,
	type LoadedConversationThread,
} from "@/lib/chat/thread-contract"
import type {
	ConversationController,
	ConversationState,
	PendingPrompt,
} from "@/lib/conversations/conversation-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import type {
	Bot,
	Conversation,
	Participant,
} from "@/lib/conversations/store-contract"
import { botIdentity } from "@/lib/conversations/transcript-fixtures"

const REQUEST: PermissionRequest = {
	id: "p-1",
	toolName: "Bash",
	title: "Run the build",
	detail: "bun run build",
}

const bot: Bot = {
	...botIdentity(),
	id: "b-1",
	createdAt: 0,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
}

const participant = (fields: Partial<Participant> = {}): Participant => ({
	botId: "b-1",
	role: "assistant",
	joinedAt: 1,
	leftAt: null,
	name: "Nyx",
	avatarAnimal: "owl",
	avatarBlot: "green",
	avatarImagePath: null,
	isDeleted: false,
	...fields,
})

const conversationOf = (participants: Participant[]): Conversation => ({
	id: "c-1",
	spaceId: "personal",
	sectionId: null,
	pinPosition: null,
	title: "Launch",
	instructions: "",
	createdAt: 1,
	updatedAt: 1,
	participants,
})

const conversationState = (
	pendingPrompt: PendingPrompt | null,
): ConversationState => ({
	conversationId: "c-1",
	messages: [],
	hasOlder: false,
	isLoadingOlder: false,
	speakers: [],
	waitingBotIds: [],
	loopingPair: null,
	refusedMessage: null,
	pendingPrompt,
	latestError: null,
})

const botController = {} as ChatController

const botThreadOf = (state: ChatState): LoadedBotThread => ({
	kind: "bot",
	bot,
	chat: { state, controller: botController },
	isSettingsOpen: false,
	isOverlayOpen: false,
	onToggleSettings: () => undefined,
	state,
	controller: botController,
})

type ConversationThreadFixture = {
	participants: Participant[]
	pendingPrompt: PendingPrompt | null
}

const conversationThreadOf = ({
	participants,
	pendingPrompt,
}: ConversationThreadFixture): LoadedConversationThread => ({
	kind: "conversation",
	conversation: conversationOf(participants),
	runtimes: {} as ConversationRuntimes,
	isSettingsOpen: false,
	onOpenSettings: () => undefined,
	state: conversationState(pendingPrompt),
	controller: {} as ConversationController,
})

describe("factsOf permission", () => {
	it("carries the bot thread permission with no author", () => {
		const facts = factsOf(
			botThreadOf({ ...initialChatState, permission: REQUEST }),
		)

		expect(facts.permission).toEqual({ request: REQUEST, authorBotId: null })
		expect(facts.isPromptPending).toBe(true)
	})

	it("leaves the bot thread permission null when nothing is pending", () => {
		expect(factsOf(botThreadOf(initialChatState)).permission).toBeNull()
	})

	it("carries the conversation permission with its author", () => {
		const facts = factsOf(
			conversationThreadOf({
				participants: [participant()],
				pendingPrompt: { kind: "permission", botId: "b-2", request: REQUEST },
			}),
		)

		expect(facts.permission).toEqual({ request: REQUEST, authorBotId: "b-2" })
	})

	it("leaves the conversation permission null for a question prompt", () => {
		const facts = factsOf(
			conversationThreadOf({
				participants: [participant()],
				pendingPrompt: {
					kind: "question",
					botId: "b-2",
					request: { id: "q-1", questions: [] },
				},
			}),
		)

		expect(facts.permission).toBeNull()
	})

	it("leaves the conversation permission null when no prompt is pending", () => {
		const facts = factsOf(
			conversationThreadOf({
				participants: [participant()],
				pendingPrompt: null,
			}),
		)

		expect(facts.permission).toBeNull()
	})
})

describe("factsOf canAttach", () => {
	it("follows session readiness on a bot thread", () => {
		const ready = botThreadOf({
			...initialChatState,
			connection: "ready",
			sessionOpen: true,
		})

		expect(factsOf(ready).canAttach).toBe(true)
		expect(factsOf(botThreadOf(initialChatState)).canAttach).toBe(false)
	})

	it("follows the present participants on a conversation", () => {
		const seated = conversationThreadOf({
			participants: [participant()],
			pendingPrompt: null,
		})
		const empty = conversationThreadOf({
			participants: [
				participant({ leftAt: 2 }),
				participant({ isDeleted: true }),
			],
			pendingPrompt: null,
		})

		expect(factsOf(seated).canAttach).toBe(true)
		expect(factsOf(empty).canAttach).toBe(false)
	})
})
