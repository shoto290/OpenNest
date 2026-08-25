import { describe, expect, it } from "vitest"

import { createBotBadgeSource } from "./bot-badge-source"
import { type ChatState, initialChatState } from "./chat-state"

import type { PermissionRequest, QuestionRequest } from "../agent/contract"

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
		publish: (botId: string, state: Partial<ChatState> = {}) => {
			states.set(botId, { ...initialChatState, ...state })
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}

const createFakeRoster = (
	rosters: Record<string, { id: string }[]>,
	selectedBotId: string | null = null,
) => {
	const state = { rosters, selectedBotId }
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		select: (botId: string | null) => {
			state.selectedBotId = botId
			publish()
		},
		hold: (held: Record<string, { id: string }[]>) => {
			state.rosters = held
			publish()
		},
	}
}

type HarnessOptions = {
	rosters?: Record<string, { id: string }[]>
	selectedBotId?: string | null
	hasFocus?: boolean
}

const start = ({
	rosters = { home: [{ id: "bot-one" }] },
	selectedBotId = null,
	hasFocus = true,
}: HarnessOptions = {}) => {
	const chat = createFakeChat()
	const roster = createFakeRoster(rosters, selectedBotId)
	let tellFocus: ((isFocused: boolean) => void) | undefined

	const source = createBotBadgeSource({
		chat,
		roster,
		hasFocus: () => hasFocus,
		watchFocus: (report) => {
			tellFocus = report
			report(hasFocus)
			return Promise.resolve(() => undefined)
		},
	})

	const stop = source.start()

	return {
		chat,
		roster,
		source,
		blur: () => tellFocus?.(false),
		stop,
	}
}

const runs = { turn: "running" } as const
const idles = { turn: "idle" } as const
const fails = { turn: "failed" } as const

describe("createBotBadgeSource", () => {
	it("reports none until a bot's chat state changes", () => {
		const { source } = start()

		expect(source.getBadges()["bot-one"]).toBe("none")
	})

	it("reports attention while a question waits", () => {
		const { chat, source } = start()

		chat.publish("bot-one", { ...runs, question: question("q-1") })

		expect(source.getBadges()["bot-one"]).toBe("attention")
	})

	it("reports attention while a permission waits", () => {
		const { chat, source } = start()

		chat.publish("bot-one", { ...runs, permission: permission("p-1") })

		expect(source.getBadges()["bot-one"]).toBe("attention")
	})

	it("keeps attention on the selected bot", () => {
		const { chat, roster, source } = start({ selectedBotId: "bot-one" })

		chat.publish("bot-one", { ...runs, question: question("q-1") })
		roster.select("bot-one")

		expect(source.getBadges()["bot-one"]).toBe("attention")
	})

	it("reports none while a turn runs", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)

		expect(source.getBadges()["bot-one"]).toBe("none")
	})

	it("reports done when an unselected bot ends its turn", () => {
		const { chat, source } = start({ selectedBotId: "bot-two" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(source.getBadges()["bot-one"]).toBe("done")
	})

	it("reports failed when an unselected bot's turn fails", () => {
		const { chat, source } = start({ selectedBotId: "bot-two" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", fails)

		expect(source.getBadges()["bot-one"]).toBe("failed")
	})

	it("reports none when the selected bot ends its turn under focus", () => {
		const { chat, source } = start({ selectedBotId: "bot-one" })

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(source.getBadges()["bot-one"]).toBe("none")
	})

	it("reports done when the selected bot ends its turn without focus", () => {
		const { chat, blur, source } = start({ selectedBotId: "bot-one" })

		blur()
		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(source.getBadges()["bot-one"]).toBe("done")
	})

	it("drops done when the bot becomes the selected bot", () => {
		const { chat, roster, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		roster.select("bot-one")

		expect(source.getBadges()["bot-one"]).toBe("none")
	})

	it("drops failed when the bot starts a new turn", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", fails)
		chat.publish("bot-one", runs)

		expect(source.getBadges()["bot-one"]).toBe("none")
	})

	it("badges a bot of another space", () => {
		const { chat, source } = start({
			rosters: { home: [{ id: "bot-one" }], work: [{ id: "bot-two" }] },
		})

		chat.publish("bot-two", runs)
		chat.publish("bot-two", idles)

		expect(source.getBadges()["bot-two"]).toBe("done")
	})

	it("forgets a bot that leaves the roster", () => {
		const { chat, roster, source } = start()

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)
		roster.hold({ home: [] })

		expect(source.getBadges()).toEqual({})
	})

	it("holds the same badges reference until a badge changes", () => {
		const { chat, source } = start()

		chat.publish("bot-one", runs)
		const held = source.getBadges()
		chat.publish("bot-one", { ...runs, messages: [] })

		expect(source.getBadges()).toBe(held)
	})

	it("tells listeners when a badge changes", () => {
		const { chat, source } = start()
		let calls = 0
		source.subscribe(() => {
			calls += 1
		})

		chat.publish("bot-one", runs)
		chat.publish("bot-one", idles)

		expect(calls).toBe(1)
	})

	it("stops reading chat once stopped", () => {
		const { chat, source, stop } = start()

		chat.publish("bot-one", runs)
		stop()
		chat.publish("bot-one", idles)

		expect(source.getBadges()["bot-one"]).toBe("none")
	})
})
