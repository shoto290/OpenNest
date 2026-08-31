// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import { ThreadScreen } from "@/components/thread-screen"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import type { ChatController } from "@/lib/chat/chat-controller"
import {
	type ChatError,
	chatReducer,
	initialChatState,
} from "@/lib/chat/chat-state"
import type { BotThread, Thread } from "@/lib/chat/thread-contract"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import { createScriptedDriver } from "@/lib/conversations/scripted-driver"
import type { Bot } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { botIdentity, message } from "@/lib/conversations/transcript-fixtures"
import { type FakeLayout, fakeLayout } from "@/lib/perf/fake-layout"

const CRASH: ChatError = {
	id: "crashed-0",
	error: { kind: "crashed", code: 1, detail: null },
}

const NO_ERRORS: ChatError[] = []

const CRASH_TITLE = "Claude Code stopped"

const SPAWN_FAILURE: ChatError = {
	id: "spawnFailed-1",
	error: { kind: "spawnFailed", detail: "no binary" },
}

const SPAWN_TITLE = "Claude Code is unavailable"

const PINS_TITLE = "Pinned messages are out of date"

const READ_TITLE = "Earlier messages not loaded"

const SPACE = "personal"

const refusingOlderStore = (): TranscriptStore => {
	const base = createFakeTranscriptStore()
	return {
		...base,
		loadPage: (conversationId, cursor) =>
			cursor
				? Promise.reject(new Error("refused"))
				: Promise.resolve({
						conversationId,
						messages: [message({ conversationId, seq: 2 })],
						hasMore: true,
					}),
	}
}

const stubController = (
	overrides: Partial<ChatController> = {},
): ChatController => ({
	getState: () => initialChatState,
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
	attach: () => () => undefined,
	check: async () => null,
	start: async () => null,
	preflight: async () => null,
	open: async () => null,
	close: async () => undefined,
	redescribe: () => undefined,
	restart: async () => null,
	rotate: async () => null,
	loadOlder: async () => undefined,
	follow: () => undefined,
	send: async () => undefined,
	sendTo: async () => undefined,
	reference: async () => null,
	pin: async () => undefined,
	unpin: async () => undefined,
	pins: async () => [],
	storeAttachments: async () => [],
	stop: async () => undefined,
	discard: () => undefined,
	respond: async () => undefined,
	answer: async () => undefined,
	retry: async () => undefined,
	shutdown: async () => undefined,
	dismissError: () => undefined,
	...overrides,
})

const attachments = createAttachmentsController({
	store: async () => [],
	send: () => true,
})

const botOf = (id: string, name: string): Bot => ({
	...botIdentity({ name }),
	id,
	createdAt: 0,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

type ThreadFixture = {
	id: string
	name: string
	said: string
	errors?: ChatError[]
	controller?: ChatController
}

const threadOf = ({
	id,
	name,
	said,
	errors = NO_ERRORS,
	controller = stubController(),
}: ThreadFixture): BotThread => ({
	kind: "bot",
	bot: botOf(id, name),
	chat: {
		state: {
			...initialChatState,
			connection: "ready",
			conversationId: `c-${id}`,
			messages: [
				message({
					id: `m-${id}`,
					conversationId: `c-${id}`,
					role: "assistant",
					authorBotId: id,
					content: said,
				}),
			],
			errors,
			errorCount: errors.length,
		},
		controller,
	},
	isSettingsOpen: false,
	isOverlayOpen: false,
	onToggleSettings: () => undefined,
})

const screenOf = (thread: Thread) =>
	createElement(ThreadScreen, {
		attachments,
		drafts: createDraftsController(),
		readerName: "Reader",
		thread,
	})

const settle = () =>
	act(async () => {
		await Promise.resolve()
	})

describe("ThreadScreen", () => {
	let layout: FakeLayout

	beforeEach(() => {
		layout = fakeLayout()
	})

	afterEach(() => {
		cleanup()
		layout.restore()
	})

	it("forgets the reply target of the thread left behind", async () => {
		const first = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
		})
		const second = threadOf({
			id: "bot-2",
			name: "Vex",
			said: "the second answer",
		})
		const { rerender } = render(screenOf(first))
		await settle()

		fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0])
		expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy()

		rerender(screenOf(second))
		await settle()

		expect(screen.queryByRole("button", { name: "Cancel reply" })).toBeNull()
	})

	it("leaves a dismissed bot failure dismissed when the reader returns", async () => {
		let held = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		const controller = stubController({
			dismissError: (id) => {
				held = {
					...held,
					chat: {
						...held.chat,
						state: chatReducer(held.chat.state, {
							type: "errorDismissed",
							id,
						}),
					},
				}
			},
		})
		held = { ...held, chat: { ...held.chat, controller } }
		const { unmount } = render(screenOf(held))
		await settle()

		expect(screen.getByText(CRASH_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))
		unmount()
		render(screenOf(held))
		await settle()

		expect(screen.queryByText(CRASH_TITLE)).toBeNull()
	})

	it("shows the failure that came after the one the reader dismissed", async () => {
		const dismissed = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		const later = chatReducer(dismissed.chat.state, {
			type: "errorDismissed",
			id: CRASH.id,
		})

		render(
			screenOf({
				...dismissed,
				chat: {
					...dismissed.chat,
					state: { ...later, errors: [SPAWN_FAILURE] },
				},
			}),
		)
		await settle()

		expect(screen.getByText(SPAWN_TITLE)).toBeTruthy()
	})

	it("leaves a dismissed conversation failure dismissed when the reader returns", async () => {
		const store = refusingOlderStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const runtimes = createConversationRuntimes(createScriptedDriver(), store)
		const thread: Thread = {
			kind: "conversation",
			conversation,
			runtimes,
			isSettingsOpen: false,
			onOpenSettings: () => undefined,
		}
		const { unmount } = render(screenOf(thread))
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Load older messages" }))
		await settle()
		expect(screen.getByText(READ_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))
		expect(screen.queryByText(READ_TITLE)).toBeNull()

		unmount()
		render(screenOf(thread))
		await settle()

		expect(screen.queryByText(READ_TITLE)).toBeNull()
	})

	it("tells the reader when the pinned messages could not be read", async () => {
		const thread = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			controller: stubController({
				pins: () => Promise.reject(new Error("refused")),
			}),
		})
		render(screenOf(thread))
		await settle()

		expect(screen.getByText(PINS_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))

		expect(screen.queryByText(PINS_TITLE)).toBeNull()
	})
})
