import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	createFakeNotificationPort,
	type FakeNotificationPort,
} from "./fake-notification-port"
import type { NotificationSwitches } from "./notification-policy"
import {
	type NotificationSourceOptions,
	startNotificationSource,
} from "./notification-source"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import { type ChatState, initialChatState } from "../chat/chat-state"

const ALL_ON: NotificationSwitches = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
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

const createFakeRoster = (bots: { id: string; name: string }[]) => {
	const state = { bots }

	return {
		getState: () => state,
		select: vi.fn(),
		hold: (held: { id: string; name: string }[]) => {
			state.bots = held
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
	roster: ReturnType<typeof createFakeRoster>
	notifications: FakeNotificationPort
	windowFocus: ReturnType<typeof createFakeWindowFocus>
	stop: () => void
}

const start = async (
	options: Partial<NotificationSourceOptions> = {},
	bots = [{ id: "bot-one", name: "Nyx" }],
): Promise<Harness> => {
	const chat = createFakeChat()
	const roster = createFakeRoster(bots)
	const notifications = createFakeNotificationPort()
	const windowFocus = createFakeWindowFocus()

	const stop = startNotificationSource({
		chat,
		roster,
		notifications,
		switches: () => ALL_ON,
		hasFocus: () => false,
		watchFocus: windowFocus.watch,
		raiseWindow: () => undefined,
		...options,
	})
	await Promise.resolve()

	return { chat, roster, notifications, windowFocus, stop }
}

const seed = (harness: Harness, botId: string) => {
	harness.chat.publish(botId)
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
			{ botId: "bot-one", title: "Nyx", body: "Asked you a question" },
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
			{ botId: "bot-two", title: "Ora", body: "Wants your permission" },
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
			{ botId: "bot-one", title: "Nyx", body: "Asked you a question" },
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
			{ botId: "bot-one", title: "Nyx", body: "Asked you a question" },
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
			{ botId: "bot-one", title: "Nyx", body: "Asked you a question" },
		])
	})

	it("shows the window and opens the bot the click carries", async () => {
		const raiseWindow = vi.fn()
		const harness = await start({ raiseWindow })

		harness.notifications.activate("bot-one")

		expect(raiseWindow).toHaveBeenCalled()
		expect(harness.roster.select).toHaveBeenCalledWith("bot-one")
	})

	it("shows the window and leaves the selection alone for a bot that is gone", async () => {
		const raiseWindow = vi.fn()
		const harness = await start({ raiseWindow })
		harness.roster.hold([])

		harness.notifications.activate("bot-one")

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
		harness.notifications.activate("bot-one")

		expect(harness.chat.listenerCount()).toBe(0)
		expect(harness.windowFocus.isWatched()).toBe(false)
		expect(harness.notifications.sent).toEqual([])
		expect(harness.roster.select).not.toHaveBeenCalled()
	})
})
