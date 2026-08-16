import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createChatController } from "./chat-controller"
import { isSessionReady } from "./chat-state"
import { createFakeChatDriver, type FakeChatDriver } from "./fake-driver"

import type { ChatMessage } from "../claude/contract"

const STEP_MS = 10
const STORAGE_KEY = "chat.session"

const STORED_MESSAGES: ChatMessage[] = [
	{
		id: "local-1",
		role: "user",
		text: "hello",
		completion: "complete",
		timestamp: 1,
	},
	{
		id: "fake-msg-1",
		role: "assistant",
		text: "hello again",
		completion: "complete",
		timestamp: 2,
	},
]

function createMemoryStorage() {
	const entries = new Map<string, string>()

	return {
		get length() {
			return entries.size
		},
		key: (index: number) => [...entries.keys()][index] ?? null,
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value)
		},
		removeItem: (key: string) => {
			entries.delete(key)
		},
		clear: () => {
			entries.clear()
		},
	} satisfies Storage
}

function bootedController(driver: FakeChatDriver) {
	const controller = createChatController(driver)
	controller.attach()
	return controller
}

function readRecord(storage: Storage): unknown {
	const raw = storage.getItem(STORAGE_KEY)
	return raw === null ? null : JSON.parse(raw)
}

describe("session resume", () => {
	let storage: Storage

	beforeEach(() => {
		vi.useFakeTimers()
		storage = createMemoryStorage()
		vi.stubGlobal("localStorage", storage)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it("starts a fresh session when nothing is stored", async () => {
		const driver = createFakeChatDriver({ stepMs: STEP_MS })
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		const controller = bootedController(driver)

		await controller.preflight()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith(undefined)
		expect(controller.getState().messages).toEqual([])
		expect(isSessionReady(controller.getState())).toBe(true)
	})

	it("resumes the stored session and restores its transcript", async () => {
		storage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				sessionId: "s-42",
				messages: STORED_MESSAGES,
			}),
		)
		const driver = createFakeChatDriver({ stepMs: STEP_MS })
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		const controller = bootedController(driver)

		await controller.preflight()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith("s-42")
		const state = controller.getState()
		expect(state.messages).toEqual(STORED_MESSAGES)
		expect(state.errors).toEqual([])
		expect(isSessionReady(state)).toBe(true)
	})

	it("writes the session id and the transcript when a turn ends", async () => {
		const driver = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "un deux trois",
		})
		const controller = bootedController(driver)
		await controller.preflight()
		await controller.send("hello")
		await vi.runAllTimersAsync()

		expect(readRecord(storage)).toMatchObject({
			version: 1,
			sessionId: controller.getState().sessionId,
			messages: controller.getState().messages,
		})
	})

	it("starts fresh and drops the transcript when the stored session cannot be resumed", async () => {
		storage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				sessionId: "s-expired",
				messages: STORED_MESSAGES,
			}),
		)
		const driver = createFakeChatDriver({ stepMs: STEP_MS })
		const startFresh = driver.startOrResumeSession
		const startSpy = vi
			.spyOn(driver, "startOrResumeSession")
			.mockImplementation((resume?: string) =>
				resume === undefined
					? startFresh()
					: Promise.reject({ kind: "spawnFailed", detail: "session expired" }),
			)
		const controller = bootedController(driver)

		await controller.preflight()
		await vi.runAllTimersAsync()

		const state = controller.getState()
		expect(startSpy).toHaveBeenCalledTimes(2)
		expect(startSpy).toHaveBeenLastCalledWith(undefined)
		expect(state.messages).toEqual([])
		expect(state.errors.at(-1)?.error.kind).toBe("resumeFailed")
		expect(state.errors).toHaveLength(1)
		expect(storage.getItem(STORAGE_KEY)).toBeNull()
		expect(isSessionReady(state)).toBe(true)
	})

	it("ignores a corrupt or outdated stored record", async () => {
		for (const raw of [
			"{not json",
			"null",
			'{"version":0,"sessionId":"s-1"}',
		]) {
			storage.setItem(STORAGE_KEY, raw)
			const driver = createFakeChatDriver({ stepMs: STEP_MS })
			const startSpy = vi.spyOn(driver, "startOrResumeSession")
			const controller = bootedController(driver)

			await controller.preflight()
			await vi.runAllTimersAsync()

			expect(startSpy).toHaveBeenCalledWith(undefined)
			const state = controller.getState()
			expect(state.messages).toEqual([])
			expect(state.errors).toEqual([])
		}
	})

	it("ignores a stored record whose transcript drifted from the message shape", async () => {
		storage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				sessionId: "s-42",
				messages: [{ id: "local-1", role: "narrator", text: "hello" }],
			}),
		)
		const driver = createFakeChatDriver({ stepMs: STEP_MS })
		const startSpy = vi.spyOn(driver, "startOrResumeSession")
		const controller = bootedController(driver)

		await controller.preflight()
		await vi.runAllTimersAsync()

		expect(startSpy).toHaveBeenCalledWith(undefined)
		expect(controller.getState().messages).toEqual([])
	})

	it("persists the transcript on shutdown", async () => {
		const driver = createFakeChatDriver({
			stepMs: STEP_MS,
			replyFor: () => "un deux trois",
		})
		const controller = bootedController(driver)
		await controller.preflight()
		await controller.send("hello")
		await vi.runAllTimersAsync()
		storage.clear()

		await controller.shutdown()

		expect(readRecord(storage)).toMatchObject({
			sessionId: controller.getState().sessionId,
		})
	})

	it("survives a missing localStorage", async () => {
		vi.stubGlobal("localStorage", undefined)
		const driver = createFakeChatDriver({ stepMs: STEP_MS })
		const controller = bootedController(driver)

		await controller.preflight()
		await controller.send("hello")
		await vi.runAllTimersAsync()

		expect(isSessionReady(controller.getState())).toBe(true)
		expect(controller.getState().errors).toEqual([])
	})
})
