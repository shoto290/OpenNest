import { describe, expect, it, vi } from "vitest"

import { createFakeNotificationPort } from "./fake-notification-port"
import type { NotificationTarget } from "./notification-port"

const BOT: NotificationTarget = { kind: "bot", id: "bot-1" }

const OTHER_BOT: NotificationTarget = { kind: "bot", id: "bot-2" }

describe("createFakeNotificationPort", () => {
	it("keeps every send in the order it was made", async () => {
		const notifications = createFakeNotificationPort()
		expect(notifications.sent).toEqual([])

		await notifications.send({
			target: BOT,
			title: "Ada",
			body: "The migration is done.",
		})
		await notifications.send({
			target: OTHER_BOT,
			title: "Grace",
			body: "I need a decision.",
		})

		expect(notifications.sent).toEqual([
			{ target: BOT, title: "Ada", body: "The migration is done." },
			{ target: OTHER_BOT, title: "Grace", body: "I need a decision." },
		])
	})

	it("tells every listener which target was clicked", async () => {
		const notifications = createFakeNotificationPort()
		const first = vi.fn()
		const second = vi.fn()
		await notifications.onActivate(first)
		await notifications.onActivate(second)

		notifications.activate(BOT)

		expect(first).toHaveBeenCalledWith(BOT)
		expect(second).toHaveBeenCalledWith(BOT)
	})

	it("stops telling a listener that has been dropped", async () => {
		const notifications = createFakeNotificationPort()
		const listener = vi.fn()
		const unsubscribe = await notifications.onActivate(listener)

		unsubscribe()
		notifications.activate(BOT)

		expect(listener).not.toHaveBeenCalled()
	})

	it("survives a listener that drops itself while being told", async () => {
		const notifications = createFakeNotificationPort()
		const second = vi.fn()
		const unsubscribe = await notifications.onActivate(() => unsubscribe())
		await notifications.onActivate(second)

		notifications.activate(BOT)

		expect(second).toHaveBeenCalledWith(BOT)
	})
})
