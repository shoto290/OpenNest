// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	CREATED_EVENT,
	FIRST_RUN_DONE_EVENT,
	type LaunchOutcome,
	SEED_REFUSED_EVENT,
} from "./companions-transport"
import { useCompanionAnnouncements } from "./use-companion-announcements"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

const hostInvoke = vi.mocked(invoke)

const hostListen = vi.mocked(listen)

const failureNotice = vi.mocked(raiseFailureNotice)

type Announce = (event: { payload: unknown }) => void

const announcers = new Map<string, Announce>()

const unsubscribes = new Map<string, () => void>()

const NOTHING_HAPPENED: LaunchOutcome = { created: null, refused: null }

afterEach(cleanup)

beforeEach(() => {
	announcers.clear()
	unsubscribes.clear()
	failureNotice.mockReset()
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(NOTHING_HAPPENED)
	hostListen.mockReset()
	hostListen.mockImplementation((event, handler) => {
		announcers.set(event, handler as Announce)
		const unsubscribe = vi.fn()
		unsubscribes.set(event, unsubscribe)
		return Promise.resolve(unsubscribe)
	})
})

const settling = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
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
	await settling()
	return rendered
}

const SHOTO = { id: "b1", name: "Shoto" }

const REFUSAL = { reason: "the personal space is missing" }

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

		await announcing(SEED_REFUSED_EVENT, REFUSAL)

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: expect.any(String),
			description: REFUSAL.reason,
		})
		expect(onCreated).not.toHaveBeenCalled()
	})

	it("reads the launch outcome only once every listener is armed", async () => {
		await listening({ onCreated: vi.fn(), onFirstRunDone: vi.fn() })

		expect(hostInvoke).toHaveBeenCalledExactlyOnceWith(
			"companion_launch_outcome",
		)
		const lastListen = Math.max(...hostListen.mock.invocationCallOrder)
		expect(hostInvoke.mock.invocationCallOrder[0]).toBeGreaterThan(lastListen)
	})

	it("greets a companion planted before anything listened, once, whatever arrives after", async () => {
		hostInvoke.mockResolvedValue({ created: SHOTO, refused: null })
		const onCreated = vi.fn()
		await listening({ onCreated, onFirstRunDone: vi.fn() })

		await announcing(CREATED_EVENT, SHOTO)

		expect(onCreated).toHaveBeenCalledExactlyOnceWith(SHOTO)
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("raises a refusal that happened before anything listened, once, whatever arrives after", async () => {
		hostInvoke.mockResolvedValue({ created: null, refused: REFUSAL })
		const onCreated = vi.fn()
		await listening({ onCreated, onFirstRunDone: vi.fn() })

		await announcing(SEED_REFUSED_EVENT, REFUSAL)

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith({
			title: expect.any(String),
			description: REFUSAL.reason,
		})
		expect(onCreated).not.toHaveBeenCalled()
	})

	it("raises nothing when the launch planted nothing and refused nothing", async () => {
		const onCreated = vi.fn()
		await listening({ onCreated, onFirstRunDone: vi.fn() })

		expect(onCreated).not.toHaveBeenCalled()
		expect(failureNotice).not.toHaveBeenCalled()
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

	it("reports a launch outcome that could not be read instead of failing silently", async () => {
		const reported = vi.spyOn(console, "error").mockImplementation(() => {})
		hostInvoke.mockRejectedValue(new Error("no host"))

		await listening({ onCreated: vi.fn(), onFirstRunDone: vi.fn() })

		expect(reported).toHaveBeenCalledWith(
			"companions: the launch outcome could not be read",
			expect.any(Error),
		)
		reported.mockRestore()
	})
})
