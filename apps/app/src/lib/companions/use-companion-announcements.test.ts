// @vitest-environment happy-dom

import { listen } from "@tauri-apps/api/event"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	CREATED_EVENT,
	FIRST_RUN_DONE_EVENT,
	SEED_REFUSED_EVENT,
} from "./companions-transport"
import { useCompanionAnnouncements } from "./use-companion-announcements"

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

const hostListen = vi.mocked(listen)

const failureNotice = vi.mocked(raiseFailureNotice)

type Announce = (event: { payload: unknown }) => void

const announcers = new Map<string, Announce>()

const unsubscribes = new Map<string, () => void>()

afterEach(cleanup)

beforeEach(() => {
	announcers.clear()
	unsubscribes.clear()
	failureNotice.mockReset()
	hostListen.mockReset()
	hostListen.mockImplementation((event, handler) => {
		announcers.set(event, handler as Announce)
		const unsubscribe = vi.fn()
		unsubscribes.set(event, unsubscribe)
		return Promise.resolve(unsubscribe)
	})
})

const announcing = async (event: string, payload: unknown) => {
	const announce = announcers.get(event)
	if (!announce) {
		throw new Error(`nothing listens to ${event}`)
	}
	await act(async () => {
		announce({ payload })
	})
}

const listening = async (announcements: {
	onCreated: () => void
	onFirstRunDone: () => void
}) => {
	const rendered = renderHook(() => useCompanionAnnouncements(announcements))
	await act(async () => undefined)
	return rendered
}

describe("useCompanionAnnouncements", () => {
	it("reloads the roster when a companion is announced as created", async () => {
		const onCreated = vi.fn()
		const onFirstRunDone = vi.fn()
		await listening({ onCreated, onFirstRunDone })

		await announcing(CREATED_EVENT, { id: "b2", name: "Quill" })

		expect(onCreated).toHaveBeenCalledExactlyOnceWith({
			id: "b2",
			name: "Quill",
		})
		expect(onFirstRunDone).not.toHaveBeenCalled()
	})

	it("reads the preferences again when the first run is announced as done", async () => {
		const onCreated = vi.fn()
		const onFirstRunDone = vi.fn()
		await listening({ onCreated, onFirstRunDone })

		await announcing(FIRST_RUN_DONE_EVENT, null)

		expect(onFirstRunDone).toHaveBeenCalledTimes(1)
		expect(onCreated).not.toHaveBeenCalled()
	})

	it("raises a failure notice holding the reason the first companion was refused", async () => {
		const onCreated = vi.fn()
		const onFirstRunDone = vi.fn()
		await listening({ onCreated, onFirstRunDone })

		await announcing(SEED_REFUSED_EVENT, {
			reason: "the personal space is missing",
		})

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: expect.any(String),
			description: "the personal space is missing",
		})
		expect(onCreated).not.toHaveBeenCalled()
	})

	it("drops every listener when the screen goes away", async () => {
		const { unmount } = await listening({
			onCreated: vi.fn(),
			onFirstRunDone: vi.fn(),
		})

		unmount()
		await act(async () => undefined)

		for (const unsubscribe of unsubscribes.values()) {
			expect(unsubscribe).toHaveBeenCalledTimes(1)
		}
	})

	it("reports a listener that could not be armed instead of failing silently", async () => {
		const reported = vi.spyOn(console, "error").mockImplementation(() => {})
		hostListen.mockRejectedValue(new Error("no window"))

		await listening({ onCreated: vi.fn(), onFirstRunDone: vi.fn() })

		expect(reported).toHaveBeenCalled()
		reported.mockRestore()
	})
})
