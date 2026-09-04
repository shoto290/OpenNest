// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { MissionChanged, MissionDetail } from "./mission-contract"
import { missionsTransport } from "./missions-transport"
import { useMissionDetail } from "./use-mission-detail"

vi.mock("./missions-transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("./missions-transport")>()),
	missionsTransport: { detail: vi.fn(), onChanged: vi.fn() },
}))

const readDetail = vi.mocked(missionsTransport.detail)
const onChanged = vi.mocked(missionsTransport.onChanged)

const DETAIL: MissionDetail = {
	mission: {
		id: "m-1",
		originConversationId: "c-1",
		botId: "b-1",
		threadConversationId: "c-2",
		objective: "Ship the mission thread.",
		ticket: {
			platform: "linear",
			externalId: "OPE-30",
			url: "https://example.com/OPE-30",
			title: "Mission thread screen",
		},
		tools: ["Repository"],
		state: "working",
		openedAt: 1,
		closedAt: null,
	},
	events: [
		{
			id: "e-1",
			missionId: "m-1",
			kind: "opened",
			source: "claude-code",
			payload: null,
			createdAt: 2,
		},
	],
}

let announce: (changed: MissionChanged) => void

beforeEach(() => {
	readDetail.mockReset().mockResolvedValue(DETAIL)
	onChanged.mockReset().mockImplementation((listener) => {
		announce = listener
		return Promise.resolve(() => undefined)
	})
})

afterEach(cleanup)

it("reads the mission it is opened on", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"))

	await waitFor(() => expect(result.current.isReading).toBe(false))

	expect(readDetail).toHaveBeenCalledWith("m-1")
	expect(result.current.read?.mission).toEqual(DETAIL.mission)
	expect(result.current.read?.events).toHaveLength(1)
})

it("reads the mission again when a change names it", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"))

	await waitFor(() => expect(result.current.isReading).toBe(false))

	announce({ missionId: "m-1", state: "waiting_human" })

	await waitFor(() => expect(readDetail).toHaveBeenCalledTimes(2))
})

it("leaves the mission alone when a change names another one", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"))

	await waitFor(() => expect(result.current.isReading).toBe(false))

	announce({ missionId: "m-2", state: "done" })

	expect(readDetail).toHaveBeenCalledTimes(1)
})

it("reports a failed read and reads again on retry", async () => {
	readDetail.mockRejectedValueOnce({ kind: "unknownMission", id: "m-1" })

	const { result } = renderHook(() => useMissionDetail("m-1"))

	await waitFor(() => expect(result.current.hasFailedToRead).toBe(true))

	result.current.onRetry()

	await waitFor(() => expect(result.current.hasFailedToRead).toBe(false))
	expect(result.current.read?.mission).toEqual(DETAIL.mission)
})
