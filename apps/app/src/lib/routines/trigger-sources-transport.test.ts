import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const SCHEDULE: TriggerSource = {
	id: "schedule",
	title: "On a schedule",
	payload: [{ name: "firedAt", type: "datetime" }],
	dedupeKey: "firedAt",
}

describe("triggerSourcesTransport", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
	})

	it("asks the host for the sources stacked for one bot", async () => {
		hostInvoke.mockResolvedValueOnce([SCHEDULE])

		await expect(triggerSourcesTransport.sources("b-1")).resolves.toEqual([
			SCHEDULE,
		])

		expect(hostInvoke).toHaveBeenCalledWith("routine_trigger_sources", {
			botId: "b-1",
		})
	})

	it("carries an unreadable declaration back to the caller", async () => {
		const failure = {
			kind: "unreadableSources",
			path: "bundle/.triggers.json",
			reason: "expected value at line 1",
		}
		hostInvoke.mockRejectedValueOnce(failure)

		await expect(triggerSourcesTransport.sources("b-1")).rejects.toEqual(
			failure,
		)
	})
})
