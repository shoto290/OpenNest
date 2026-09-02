// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import { ThreadScreen } from "@/components/thread-screen"
import type { AgentEvent } from "@/lib/agent/contract"
import { createAttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatController } from "@/lib/chat/chat-controller"
import {
	type ChatError,
	chatReducer,
	initialChatState,
} from "@/lib/chat/chat-state"
import { createDraftsController } from "@/lib/chat/drafts-controller"
import type { BotThread, Thread } from "@/lib/chat/thread-contract"
import { createConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "@/lib/conversations/scripted-driver"
import type { Bot } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import {
	botIdentity,
	message,
	seatBots,
} from "@/lib/conversations/transcript-fixtures"
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
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const WRITING_STARTED: AgentEvent = {
	type: "messageStarted",
	message: {
		id: "msg-writing",
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 1,
	},
}

const WRITING: AgentEvent[] = [
	WRITING_STARTED,
	{
		type: "messageDelta",
		id: "msg-writing",
		seq: 1,
		text: "the walls hold\n\nand",
	},
]

const FIRST_TOKEN: AgentEvent[] = [
	WRITING_STARTED,
	{ type: "messageDelta", id: "msg-writing", seq: 1, text: "the walls hold" },
]

const BLOCK_CLOSED: AgentEvent[] = [
	{ type: "messageDelta", id: "msg-writing", seq: 2, text: "\n\nand" },
]

const ASKED: AgentEvent[] = [
	{
		type: "questionRequested",
		request: {
			id: "ask-1",
			questions: [
				{
					header: "Which wall",
					question: "Which wall holds?",
					options: [],
					multiSelect: false,
				},
			],
		},
	},
]

const HANDED_TO_ADA: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-handover",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-handover", seq: 1, text: "@Ada keep going" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const SAID_AND_LANDED: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-said",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id: "msg-said", seq: 1, text: "the walls hold" },
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

type Room = {
	driver: ScriptedDriver
	thread: Thread
	idOf: (name: string) => string
	send: (text: string) => Promise<void>
}

const roomOf = async (names: string[]): Promise<Room> => {
	const store = createFakeTranscriptStore()
	const bots = await seatBots(store, SPACE, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const driver = createScriptedDriver()
	const runtimes = createConversationRuntimes(driver, store)
	const controller = runtimes.runtimeFor(conversation.id)

	return {
		driver,
		thread: {
			kind: "conversation",
			conversation,
			runtimes,
			isSettingsOpen: false,
			onOpenSettings: () => undefined,
		},
		idOf: (name) => bots.find((bot) => bot.name === name)?.id ?? name,
		send: async (text) => {
			await act(async () => {
				await controller.send(text)
			})
			await settle()
		},
	}
}

const stopsFor = (name: string) =>
	screen.queryAllByRole("button", { name: `Stop ${name}` })

const stopFor = (name: string) => stopsFor(name)[0] ?? null

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
		const opened = threadOf({
			id: "bot-1",
			name: "Nyx",
			said: "the first answer",
			errors: [CRASH],
		})
		let state = opened.chat.state
		const controller = stubController({
			dismissError: (id) => {
				state = chatReducer(state, { type: "errorDismissed", id })
			},
		})
		const shown = (): BotThread => ({ ...opened, chat: { state, controller } })
		const { unmount } = render(screenOf(shown()))
		await settle()

		expect(screen.getByText(CRASH_TITLE)).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }))
		unmount()
		render(screenOf(shown()))
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

	it("stops the bot whose working row carries the stop, and no other", async () => {
		const room = await roomOf(["Ada", "Nyx"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada @Nyx now")

		expect(stopFor("Nyx")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Stop Ada" }))
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
		expect(stopFor("Nyx")).toBeTruthy()
	})

	it("leaves no stop on the waiting row of a bot holding no seat", async () => {
		const room = await roomOf(["Ada", "Nyx"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		await room.send("@Nyx after")

		expect(stopFor("Ada")).toBeTruthy()
		expect(stopFor("Nyx")).toBeNull()
	})

	it("carries the stop onto the run a speaking bot is writing", async () => {
		const room = await roomOf(["Ada"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), WRITING)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		fireEvent.click(stopsFor("Ada")[0])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("holds a seated bot on its waiting row until it publishes a block", async () => {
		const room = await roomOf(["Ada"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
		})
		await settle()

		expect(screen.queryByText("the walls hold")).toBeNull()
		expect(screen.getByText("Ada is thinking…")).toBeTruthy()
		expect(stopFor("Ada")).toBeTruthy()
	})

	it("keeps the working row of a seated bot that has published a block", async () => {
		const room = await roomOf(["Ada"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.getByText("Ada is writing…")).toBeTruthy()

		fireEvent.click(stopsFor("Ada")[1])
		await settle()

		expect(room.driver.cancelled).toEqual([room.idOf("Ada")])
	})

	it("keeps the working row of a bot asking after it published a block", async () => {
		const room = await roomOf(["Ada"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Ada"), ASKED)
		})
		await settle()

		expect(screen.getByText("Ada · Which wall")).toBeTruthy()
	})

	it("draws one row for a speaking bot another speaker hands over to", async () => {
		const room = await roomOf(["Ada", "Nyx"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada @Nyx now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), FIRST_TOKEN)
			room.driver.pushTo(room.idOf("Ada"), BLOCK_CLOSED)
			room.driver.pushTo(room.idOf("Nyx"), HANDED_TO_ADA)
		})
		await settle()

		expect(screen.getAllByText(/^Ada is /)).toHaveLength(1)
		expect(screen.getByText("Ada is writing…")).toBeTruthy()
	})

	it("leaves no stop on the turn a bot has landed", async () => {
		const room = await roomOf(["Ada"])
		render(screenOf(room.thread))
		await settle()

		await room.send("@Ada now")
		act(() => {
			room.driver.pushTo(room.idOf("Ada"), SAID_AND_LANDED)
		})
		await settle()

		expect(screen.getByText("the walls hold")).toBeTruthy()
		expect(screen.queryByText("Ada is writing…")).toBeNull()
		expect(stopFor("Ada")).toBeNull()
	})

	it("stops the solo bot from the row it works on", async () => {
		const thread = threadOf({ id: "bot-1", name: "Nyx", said: "the answer" })
		const cancelled: string[] = []
		render(
			screenOf({
				...thread,
				chat: {
					state: { ...thread.chat.state, turn: "running" },
					controller: stubController({
						stop: async () => {
							cancelled.push("Nyx")
						},
					}),
				},
			}),
		)
		await settle()

		fireEvent.click(screen.getByRole("button", { name: "Stop Nyx" }))
		await settle()

		expect(cancelled).toEqual(["Nyx"])
	})
})
