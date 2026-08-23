import { invoke } from "@tauri-apps/api/core"
import { type EventCallback, listen } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { notificationTransport } from "./notification-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

const clickWith = (botId: string) =>
	({ event: "notification://activated", id: 1, payload: botId }) as never

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
	hostListen.mockReset()
	hostListen.mockResolvedValue(() => undefined)
})

describe("notificationTransport", () => {
	it("hands the host the bot the notification stands for", async () => {
		await notificationTransport.send({
			botId: "bot-one",
			title: "Nyx",
			body: "answered",
		})

		expect(hostInvoke).toHaveBeenCalledWith("notification_show", {
			botId: "bot-one",
			title: "Nyx",
			body: "answered",
		})
	})

	it("resolves when the host refuses the notification", async () => {
		hostInvoke.mockRejectedValue(new Error("no notification centre"))

		await expect(
			notificationTransport.send({ botId: "bot-one", title: "a", body: "b" }),
		).resolves.toBeUndefined()
	})

	it("tells the listener which bot was clicked", async () => {
		await notificationTransport.onActivate(vi.fn())
		const clicked = vi.fn()
		await notificationTransport.onActivate(clicked)

		const received = hostListen.mock.calls.at(-1)?.[1] as EventCallback<string>
		received(clickWith("bot-two"))

		expect(clicked).toHaveBeenCalledWith("bot-two")
	})

	it("answers with the unsubscribe the host handed back", async () => {
		const unlisten = vi.fn()
		hostListen.mockResolvedValue(unlisten)

		const stop = await notificationTransport.onActivate(vi.fn())
		stop()

		expect(unlisten).toHaveBeenCalled()
	})
})
