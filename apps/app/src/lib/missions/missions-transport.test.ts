import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { beforeEach, expect, it, vi } from "vitest"

import type { MissionChanged, MissionDetail } from "./mission-contract"
import { MISSION_CHANGED_EVENT, missionsTransport } from "./missions-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

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
		reportedAt: null,
		reportedTurnId: null,
	},
	events: [],
}

beforeEach(() => {
	hostInvoke.mockReset()
	hostListen.mockReset()
})

it("reads one mission and its events from the host", async () => {
	hostInvoke.mockResolvedValueOnce(DETAIL)

	await expect(missionsTransport.detail("m-1")).resolves.toEqual(DETAIL)

	expect(hostInvoke).toHaveBeenCalledWith("mission_detail", {
		missionId: "m-1",
	})
})

it("reads the open and the done missions of a conversation", async () => {
	hostInvoke.mockResolvedValueOnce({ open: [], done: [] })

	await missionsTransport.list("c-1")

	expect(hostInvoke).toHaveBeenCalledWith("mission_list", {
		conversationId: "c-1",
	})
})

it("reads the roster block of a conversation for a bot", async () => {
	hostInvoke.mockResolvedValueOnce("The room holds @ada.")

	await expect(missionsTransport.rosterBlock("c-1", "b-1")).resolves.toBe(
		"The room holds @ada.",
	)

	expect(hostInvoke).toHaveBeenCalledWith("conversation_roster_block", {
		conversationId: "c-1",
		botId: "b-1",
	})
})

it("hands every mission change to its listener", async () => {
	const heard: MissionChanged[] = []
	hostListen.mockResolvedValueOnce(() => undefined)

	await missionsTransport.onChanged((changed) => heard.push(changed))

	const [event, handler] = hostListen.mock.calls[0] ?? []
	expect(event).toBe(MISSION_CHANGED_EVENT)

	handler?.({
		event: MISSION_CHANGED_EVENT,
		id: 1,
		payload: { missionId: "m-1", state: "waiting_human" },
	})

	expect(heard).toEqual([{ missionId: "m-1", state: "waiting_human" }])
})
