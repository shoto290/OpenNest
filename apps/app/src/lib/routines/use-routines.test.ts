// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { Routine } from "./routine-contract"
import { routinesTransport } from "./routines-transport"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { useRoutines } from "./use-routines"

vi.mock("./routines-transport", () => ({
	routinesTransport: { list: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock("./trigger-sources-transport", () => ({
	triggerSourcesTransport: { sources: vi.fn() },
}))

const list = vi.mocked(routinesTransport.list)
const update = vi.mocked(routinesTransport.update)
const remove = vi.mocked(routinesTransport.delete)
const sources = vi.mocked(triggerSourcesTransport.sources)

const ROUTINE: Routine = {
	id: "r-1",
	conversationId: "c-1",
	botId: "b-1",
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 0,
}

const mountHeldRoutines = async () => {
	list.mockResolvedValueOnce([ROUTINE])
	sources.mockResolvedValue([])

	const { result } = renderHook(() => useRoutines(ROUTINE.conversationId))
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	return result
}

beforeEach(() => {
	vi.clearAllMocks()
})

afterEach(cleanup)

it("clears a write failure once a later write resolves", async () => {
	const result = await mountHeldRoutines()

	update.mockRejectedValueOnce(new Error("write refused"))
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBe("write"))

	update.mockResolvedValueOnce({ ...ROUTINE, isEnabled: false })
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBeNull())
})

it("clears a write failure once a deletion resolves", async () => {
	const result = await mountHeldRoutines()

	update.mockRejectedValueOnce(new Error("write refused"))
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.failure).toBe("write"))

	remove.mockResolvedValueOnce(undefined)
	await act(async () => {
		await result.current.remove(ROUTINE.id)
	})
	expect(result.current.failure).toBeNull()
})

it("keeps a read failure whatever a write resolves to", async () => {
	const result = await mountHeldRoutines()

	list.mockRejectedValueOnce(new Error("read refused"))
	await act(async () => {
		result.current.reload()
	})
	await waitFor(() => expect(result.current.failure).toBe("read"))

	update.mockResolvedValueOnce({ ...ROUTINE, isEnabled: false })
	await act(async () => {
		result.current.setEnabled(ROUTINE.id, false)
	})
	await waitFor(() => expect(result.current.routines[0].isEnabled).toBe(false))
	expect(result.current.failure).toBe("read")
})
