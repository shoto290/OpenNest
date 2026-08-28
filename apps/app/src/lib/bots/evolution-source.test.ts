import { describe, expect, it, vi } from "vitest"

import {
	type EvolutionSourceOptions,
	startEvolutionSource,
} from "./evolution-source"

import type {
	EvolvedBundle,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"

const scopeOf = (botId: string): RuntimeScope => ({
	conversationId: "chat-1",
	botId,
	runtimeSessionId: "run-1",
	epoch: 1,
})

const createFakeDriver = () => {
	const listeners = new Set<(event: ScopedEvent) => void>()

	return {
		subscribe: (onEvent: (event: ScopedEvent) => void) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},
		evolve: (botId: string, bundle: EvolvedBundle) => {
			for (const listener of listeners) {
				listener({
					scope: scopeOf(botId),
					event: {
						type: "botEvolved",
						bundle,
						commitId: "c-1",
						title: "learned to count",
					},
				})
			}
		},
	}
}

type Panels = Pick<
	EvolutionSourceOptions,
	"roster" | "skills" | "history" | "userPlugin" | "spacePlugin"
>

type OpenPanels = {
	botId: string | null
	spaceId?: string | null
}

const createPanels = ({ botId, spaceId = null }: OpenPanels) => {
	const panels: Panels = {
		roster: {
			spaceOfBot: (id: string) => (id === "bot-1" ? "space-1" : undefined),
			reload: vi.fn(() => Promise.resolve()),
		},
		skills: { getState: () => ({ botId }), reload: vi.fn() },
		history: { getState: () => ({ botId }), reload: vi.fn() },
		userPlugin: { reload: vi.fn() },
		spacePlugin: { getState: () => ({ spaceId }), reload: vi.fn() },
	}
	return panels
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const start = (panels: Panels) => {
	const driver = createFakeDriver()
	const stop = startEvolutionSource({ driver, ...panels })
	return { driver, stop }
}

describe("evolution source", () => {
	it("re-reads the open bot's skills, history and the roster", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(panels.skills.reload).toHaveBeenCalledTimes(1)
		expect(panels.history.reload).toHaveBeenCalledTimes(1)
		expect(panels.roster.reload).toHaveBeenCalledTimes(1)
	})

	it("leaves the panels of another bot untouched", () => {
		const panels = createPanels({ botId: "bot-2" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "bot")

		expect(panels.skills.reload).not.toHaveBeenCalled()
		expect(panels.history.reload).not.toHaveBeenCalled()
	})

	it("re-reads the person's plugin", () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "user")

		expect(panels.userPlugin.reload).toHaveBeenCalledTimes(1)
		expect(panels.skills.reload).not.toHaveBeenCalled()
	})

	it("re-reads the plugin of the open space", () => {
		const panels = createPanels({ botId: "bot-1", spaceId: "space-1" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "space")

		expect(panels.spacePlugin.reload).toHaveBeenCalledTimes(1)
	})

	it("leaves the plugin of another space untouched", () => {
		const panels = createPanels({ botId: "bot-1", spaceId: "space-2" })
		const { driver } = start(panels)

		driver.evolve("bot-1", "space")

		expect(panels.spacePlugin.reload).not.toHaveBeenCalled()
	})

	it("stops reading once detached", async () => {
		const panels = createPanels({ botId: "bot-1" })
		const { driver, stop } = start(panels)

		stop()
		await flush()
		driver.evolve("bot-1", "bot")

		expect(panels.roster.reload).not.toHaveBeenCalled()
	})
})
