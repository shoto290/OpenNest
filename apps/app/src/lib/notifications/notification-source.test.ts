import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	createFakeNotificationPort,
	type FakeNotificationPort,
} from "./fake-notification-port"
import type { ConversationRound } from "./notification-policy"
import {
	type NotificationSourceOptions,
	type NotificationSourceSwitches,
	startNotificationSource,
} from "./notification-source"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import { type ChatState, initialChatState } from "../chat/chat-state"
import type { Conversation } from "../conversations/store-contract"
import { speakingBot } from "../conversations/transcript-fixtures"

const BOT = { kind: "bot", id: "bot-one" } as const

const OTHER_BOT = { kind: "bot", id: "bot-two" } as const

const ROOM = { kind: "conversation", id: "room-one" } as const

const SPACE = "space-one"

const ALL_ON: NotificationSourceSwitches = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const question = (id: string): QuestionRequest => ({
	id,
	questions: [
		{
			header: "Pick one",
			question: "Which branch?",
			options: [],
			multiSelect: false,
		},
	],
})

const permission = (id: string): PermissionRequest => ({
	id,
	toolName: "Bash",
	title: "Run npm test",
	detail: null,
})

const createFakeChat = () => {
	const states = new Map<string, ChatState>()
	const listeners = new Set<() => void>()

	return {
		stateFor: (botId: string) => states.get(botId) ?? initialChatState,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		listenerCount: () => listeners.size,
		publish: (botId: string, state: Partial<ChatState> = {}) => {
			states.set(botId, { ...initialChatState, ...state })
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const conversation = (id: string, title: string): Conversation => ({
	id,
	spaceId: "space-one",
	sectionId: null,
	pinPosition: null,
	title,
	instructions: "",
	createdAt: 0,
	updatedAt: 0,
	participants: [],
})

const createFakeRuntimes = () => {
	const rounds = new Map<string, ConversationRound>()
	const listeners = new Set<() => void>()

	return {
		heldFor: (conversationId: string) => {
			const round = rounds.get(conversationId)
			return round ? { getState: () => round } : null
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		listenerCount: () => listeners.size,
		release: (conversationId: string) => {
			rounds.delete(conversationId)
		},
		publish: (
			conversationId: string,
			round: Partial<ConversationRound> = {},
		) => {
			rounds.set(conversationId, {
				speakers: [],
				waitingBotIds: [],
				...round,
			})
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = (
	bots: { id: string; name: string }[],
	conversations: Conversation[] = [],
) => {
	const state = { bots, conversations }

	return {
		getState: () => state,
		spaceOfBot: (botId: string) =>
			state.bots.some((bot) => bot.id === botId) ? SPACE : undefined,
		spaceOfConversation: (conversationId: string) =>
			state.conversations.some(
				(conversation) => conversation.id === conversationId,
			)
				? SPACE
				: undefined,
		select: vi.fn(),
		selectConversation: vi.fn(),
		hold: (held: { id: string; name: string }[]) => {
			state.bots = held
		},
		holdConversations: (held: Conversation[]) => {
			state.conversations = held
		},
	}
}

const createFakeWindowFocus = () => {
	let report: ((isFocused: boolean) => void) | undefined

	return {
		watch: (listener: (isFocused: boolean) => void) => {
			report = listener
			return Promise.resolve(() => {
				report = undefined
			})
		},
		isWatched: () => report !== undefined,
		tell: (isFocused: boolean) => report?.(isFocused),
	}
}

type Harness = {
	chat: ReturnType<typeof createFakeChat>
	runtimes: ReturnType<typeof createFakeRuntimes>
	roster: ReturnType<typeof createFakeRoster>
	spaces: { select: ReturnType<typeof vi.fn> }
	notifications: FakeNotificationPort
	windowFocus: ReturnType<typeof createFakeWindowFocus>
	playChime: ReturnType<typeof vi.fn>
	reportFailure: ReturnType<typeof vi.fn>
	stop: () => void
}

const start = async (
	options: Partial<NotificationSourceOptions> = {},
	bots = [{ id: "bot-one", name: "Nyx" }],
	conversations = [conversation("room-one", "Release")],
): Promise<Harness> => {
	const chat = createFakeChat()
	const runtimes = createFakeRuntimes()
	const roster = createFakeRoster(bots, conversations)
	const spaces = { select: vi.fn() }
	const notifications = createFakeNotificationPort()
	const windowFocus = createFakeWindowFocus()
	const playChime = vi.fn()
	const reportFailure = vi.fn()

	const stop = startNotificationSource({
		chat,
		runtimes,
		roster,
		spaces,
		notifications,
		switches: () => ALL_ON,
		hasFocus: () => false,
		watchFocus: windowFocus.watch,
		raiseWindow: async () => undefined,
		playChime,
		reportFailure,
		...options,
	})
	await Promise.resolve()

	return {
		chat,
		runtimes,
		roster,
		spaces,
		notifications,
		windowFocus,
		playChime,
		reportFailure,
		stop,
	}
}

const seed = (harness: Harness, botId: string) => {
	harness.chat.publish(botId)
	harness.notifications.sent.length = 0
}

const seedRound = (
	harness: Harness,
	conversationId: string,
	round: Partial<ConversationRound> = {},
) => {
	harness.runtimes.publish(conversationId, round)
	harness.notifications.sent.length = 0
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("startNotificationSource", () => {
	it("sends the bot's name and what happened", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("compares every bot on the roster, not only the one being read", async () => {
		const harness = await start({}, [
			{ id: "bot-one", name: "Nyx" },
			{ id: "bot-two", name: "Ora" },
		])
		seed(harness, "bot-one")

		harness.chat.publish("bot-two", { permission: permission("p-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: OTHER_BOT, title: "Ora", body: "Wants your permission" },
		])
	})

	it("sends nothing for a bot the roster has never held", async () => {
		const harness = await start({}, [])
		harness.chat.publish("bot-ghost", { question: question("q-1") })
		harness.chat.publish("bot-ghost", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing on the first sight of a bot", async () => {
		const harness = await start()

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends on the window's focus rather than the document's", async () => {
		const harness = await start({ hasFocus: () => true })
		harness.windowFocus.tell(false)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("decides on the focus the window reported last", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		harness.windowFocus.tell(false)
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("decides on the document until the window has reported", async () => {
		const harness = await start({ hasFocus: () => true })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("reads the switches at each publish", async () => {
		const switches = { ...ALL_ON, notifyOnQuestion: false }
		const harness = await start({ switches: () => switches })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		switches.notifyOnQuestion = true
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toEqual([
			{ target: BOT, title: "Nyx", body: "Asked you a question" },
		])
	})

	it("plays the chime once for a publish that told the reader anything", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", {
			question: question("q-1"),
			permission: permission("p-1"),
		})

		expect(harness.notifications.sent).toHaveLength(2)
		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("plays nothing for a publish that told the reader nothing", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one")

		expect(harness.playChime).not.toHaveBeenCalled()
	})

	it("notifies without the chime while the sound switch is off, and reads it at each publish", async () => {
		const switches = { ...ALL_ON, notifyWithSound: false }
		const harness = await start({ switches: () => switches })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		switches.notifyWithSound = true
		harness.chat.publish("bot-one", { question: question("q-2") })

		expect(harness.notifications.sent).toHaveLength(2)
		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("shows the window and opens the bot the click carries", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })

		harness.notifications.activate(BOT)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
	})

	it("opens the bot the click carries even when the window stays behind", async () => {
		const raiseWindow = vi.fn(() => Promise.reject(new Error("window is gone")))
		const harness = await start({ raiseWindow })

		harness.notifications.activate(BOT)

		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
		expect(harness.spaces.select).toHaveBeenCalledWith("space-one")
		await Promise.resolve()
		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
	})

	it("shows the window and leaves the selection alone for a bot that is gone", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })
		harness.roster.hold([])

		harness.notifications.activate(BOT)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.select).not.toHaveBeenCalled()
	})

	it("forgets the state of a bot the roster let go of", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.roster.hold([])
		harness.chat.publish("bot-one")
		harness.roster.hold([{ id: "bot-one", name: "Nyx" }])
		harness.chat.publish("bot-one", { question: question("q-1") })

		expect(harness.notifications.sent).toEqual([])
	})

	it("stops listening to the controller, the window and the click once disposed", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.stop()
		await Promise.resolve()
		harness.chat.publish("bot-one", { question: question("q-1") })
		harness.notifications.activate(BOT)

		expect(harness.chat.listenerCount()).toBe(0)
		expect(harness.runtimes.listenerCount()).toBe(0)
		expect(harness.windowFocus.isWatched()).toBe(false)
		expect(harness.notifications.sent).toEqual([])
		expect(harness.roster.select).not.toHaveBeenCalled()
	})
})

describe("startNotificationSource on a conversation", () => {
	it("names the conversation whose round has finished", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([
			{ target: ROOM, title: "Release", body: "Finished its turn" },
		])
	})

	it("sends nothing while a bot of the conversation is still speaking", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one", { speakers: [speakingBot("bot-two")] })

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends one notification for a round several bots answered in turn", async () => {
		const harness = await start()
		seedRound(harness, "room-one", {
			speakers: [speakingBot("bot-one")],
			waitingBotIds: ["bot-two"],
		})

		harness.runtimes.publish("room-one", { waitingBotIds: ["bot-two"] })
		harness.runtimes.publish("room-one", { speakers: [speakingBot("bot-two")] })
		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([
			{ target: ROOM, title: "Release", body: "Finished its turn" },
		])
	})

	it("sends nothing for a conversation holding no runtime", async () => {
		const harness = await start()

		harness.chat.publish("bot-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing on the first sight of a conversation", async () => {
		const harness = await start()

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the window holds the focus", async () => {
		const harness = await start()
		harness.windowFocus.tell(true)
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("sends nothing while the finished turn switch is off", async () => {
		const harness = await start({
			switches: () => ({ ...ALL_ON, notifyOnFinishedTurn: false }),
		})
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})

	it("plays the chime the sound switch asks for", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.publish("room-one")

		expect(harness.playChime).toHaveBeenCalledTimes(1)
	})

	it("shows the window and opens the conversation the click carries", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })

		harness.notifications.activate(ROOM)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.selectConversation).toHaveBeenCalledWith("room-one")
		expect(harness.roster.select).not.toHaveBeenCalled()
	})

	it("shows the window and leaves the selection alone for a conversation that is gone", async () => {
		const raiseWindow = vi.fn(async () => undefined)
		const harness = await start({ raiseWindow })
		harness.roster.holdConversations([])

		harness.notifications.activate(ROOM)

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.selectConversation).not.toHaveBeenCalled()
	})

	it("forgets the round of a conversation whose runtime was let go", async () => {
		const harness = await start()
		seedRound(harness, "room-one", { speakers: [speakingBot("bot-one")] })

		harness.runtimes.release("room-one")
		harness.runtimes.publish("room-two")
		harness.runtimes.publish("room-one")

		expect(harness.notifications.sent).toEqual([])
	})
})

const REFUSAL = "no notification centre"

const aRefusedSend = (): FakeNotificationPort => {
	const notifications = createFakeNotificationPort()
	notifications.send = () => Promise.reject(new Error(REFUSAL))
	return notifications
}

describe("startNotificationSource when a subscription breaks", () => {
	it("raises a notice when the click subscription is refused", async () => {
		const notifications = createFakeNotificationPort()
		notifications.onActivate = () => Promise.reject(new Error("no listener"))

		const harness = await start({ notifications })

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title: "Clicking a notification will no longer open its conversation",
			description: "no listener",
		})
	})

	it("raises a notice when the focus watch is refused", async () => {
		const harness = await start({
			watchFocus: () => Promise.reject(new Error("no window")),
		})

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title: "Notifications may now appear while the app is in front",
			description: "no window",
		})
	})

	it("raises a notice when the host refuses to show a notification", async () => {
		const harness = await start({ notifications: aRefusedSend() })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()

		expect(harness.reportFailure).toHaveBeenCalledWith({
			title: "A notification could not be shown",
			description: REFUSAL,
		})
	})

	it("raises one notice however many notifications the host refuses", async () => {
		const harness = await start({ notifications: aRefusedSend() })
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()
		harness.chat.publish("bot-one", { permission: permission("p-1") })
		await Promise.resolve()

		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
	})

	it("stays quiet while every subscription holds and every notification shows", async () => {
		const harness = await start()
		seed(harness, "bot-one")

		harness.chat.publish("bot-one", { question: question("q-1") })
		await Promise.resolve()

		expect(harness.reportFailure).not.toHaveBeenCalled()
	})
})
