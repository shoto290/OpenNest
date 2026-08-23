import { describe, expect, it, vi } from "vitest"

import { createFakeNotificationPort } from "./fake-notification-port"

describe("createFakeNotificationPort", () => {
	it("keeps every send in the order it was made", async () => {
		const notifications = createFakeNotificationPort()
		expect(notifications.sent).toEqual([])

		await notifications.send({
			botId: "bot-1",
			title: "Ada",
			body: "The migration is done.",
		})
		await notifications.send({
			botId: "bot-2",
			title: "Grace",
			body: "I need a decision.",
		})

		expect(notifications.sent).toEqual([
			{ botId: "bot-1", title: "Ada", body: "The migration is done." },
			{ botId: "bot-2", title: "Grace", body: "I need a decision." },
		])
	})

	it("tells every listener which bot was clicked", async () => {
		const notifications = createFakeNotificationPort()
		const first = vi.fn()
		const second = vi.fn()
		await notifications.onActivate(first)
		await notifications.onActivate(second)

		notifications.activate("bot-1")

		expect(first).toHaveBeenCalledWith("bot-1")
		expect(second).toHaveBeenCalledWith("bot-1")
	})

	it("stops telling a listener that has been dropped", async () => {
		const notifications = createFakeNotificationPort()
		const listener = vi.fn()
		const unsubscribe = await notifications.onActivate(listener)

		unsubscribe()
		notifications.activate("bot-1")

		expect(listener).not.toHaveBeenCalled()
	})

	it("survives a listener that drops itself while being told", async () => {
		const notifications = createFakeNotificationPort()
		const second = vi.fn()
		const unsubscribe = await notifications.onActivate(() => unsubscribe())
		await notifications.onActivate(second)

		notifications.activate("bot-1")

		expect(second).toHaveBeenCalledWith("bot-1")
	})
})
