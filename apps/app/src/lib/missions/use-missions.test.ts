// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Mission } from "./mission-contract"
import { missionsTransport } from "./missions-transport"
import { useMissions } from "./use-missions"

vi.mock("./missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const listMissions = vi.mocked(missionsTransport.list)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const MISSION: Mission = {
	id: "m-1",
	originConversationId: "c-1",
	botId: "bot-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "working",
	openedAt: 0,
	closedAt: null,
}

const A_MINUTE_MS = 60_000

describe("useMissions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		listMissions.mockResolvedValue({ open: [MISSION], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it("reads the missions of the conversation once they are listed", async () => {
		const { result } = renderHook(() => useMissions("c-1"))

		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		expect(result.current.rows.running).toHaveLength(1)
		expect(result.current.hasFailed).toBe(false)
	})

	it("holds its read still when the roster clock ticks", async () => {
		const { result } = renderHook(() => useMissions("c-1"))
		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		const read = result.current

		vi.useFakeTimers()
		vi.setSystemTime(Date.now() + A_MINUTE_MS)
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"))
		})

		expect(result.current).toBe(read)
	})
})
