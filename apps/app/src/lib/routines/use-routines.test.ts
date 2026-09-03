// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormValues,
} from "@workspace/ui/components/routine-form"

import type { Routine } from "./routine-contract"
import { routinesTransport } from "./routines-transport"
import { triggerSourcesTransport } from "./trigger-sources-transport"
import { useRoutines } from "./use-routines"

vi.mock("./routines-transport", () => ({
	routinesTransport: {
		list: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		create: vi.fn(),
		key: vi.fn(),
	},
}))
vi.mock("./trigger-sources-transport", () => ({
	triggerSourcesTransport: { sources: vi.fn() },
}))

const list = vi.mocked(routinesTransport.list)
const update = vi.mocked(routinesTransport.update)
const remove = vi.mocked(routinesTransport.delete)
const create = vi.mocked(routinesTransport.create)
const readKey = vi.mocked(routinesTransport.key)
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

const WEBHOOK_ROUTINE: Routine = {
	...ROUTINE,
	id: "r-2",
	triggerSourceId: "local-webhook",
	triggerConfig: {},
}

const DECLARED = [
	{ id: "schedule", title: "Schedule", payload: [], dedupeKey: "occurrenceId" },
	{
		id: "local-webhook",
		title: "Local webhook",
		payload: [],
		dedupeKey: "deliveryId",
		header: "X-OpenNest-Key",
	},
]

const A_WEBHOOK_KEY = {
	key: "the-key",
	header: "X-OpenNest-Key",
	url: "http://127.0.0.1:4870/routines",
}

const entered = (values: Partial<RoutineFormValues>): RoutineFormValues => ({
	...EMPTY_ROUTINE_VALUES,
	...values,
})

const mountLeadRoutines = async (listed: Routine[]) => {
	list.mockResolvedValueOnce(listed)
	sources.mockResolvedValue(DECLARED)

	const { result } = renderHook(() =>
		useRoutines(ROUTINE.conversationId, ROUTINE.botId),
	)
	await waitFor(() => expect(result.current.form.canCreate).toBe(true))
	return result
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

it("carries the address, the key and the header name of a created webhook routine", async () => {
	const result = await mountLeadRoutines([])
	create.mockResolvedValueOnce(WEBHOOK_ROUTINE)
	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)

	act(() => {
		result.current.form.onNew()
	})
	await act(async () => {
		result.current.form.onSave(
			entered({
				title: WEBHOOK_ROUTINE.title,
				instruction: WEBHOOK_ROUTINE.instruction,
				triggerSourceId: "local-webhook",
			}),
		)
	})

	await waitFor(() =>
		expect(result.current.form.open?.webhook).toEqual({
			url: A_WEBHOOK_KEY.url,
			key: A_WEBHOOK_KEY.key,
			header: A_WEBHOOK_KEY.header,
		}),
	)
	expect(create).toHaveBeenCalledWith({
		conversationId: ROUTINE.conversationId,
		botId: ROUTINE.botId,
		title: WEBHOOK_ROUTINE.title,
		instruction: WEBHOOK_ROUTINE.instruction,
		triggerSourceId: "local-webhook",
		filter: { matchMode: "all", rows: [] },
		triggerConfig: {},
	})
	expect(result.current.routines).toHaveLength(1)
})

it("fills the form of a schedule routine opened for edit", async () => {
	const result = await mountLeadRoutines([
		{ ...ROUTINE, triggerConfig: { expression: "0 * * * *" } },
	])

	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})

	expect(result.current.form.open).toMatchObject({
		id: ROUTINE.id,
		values: {
			title: ROUTINE.title,
			instruction: ROUTINE.instruction,
			triggerSourceId: "schedule",
			expression: "0 * * * *",
		},
	})
})

it("marks the key as unreadable when its read rejects", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	readKey.mockRejectedValueOnce(new Error("the key is unreadable"))

	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})

	await waitFor(() =>
		expect(result.current.form.open?.hasFailedToReadKey).toBe(true),
	)
	expect(result.current.form.open?.webhook).toBeUndefined()
})

it("marks the title of a form refused for a blank title", async () => {
	const result = await mountLeadRoutines([])
	create.mockRejectedValueOnce({ kind: "blankField", field: "title" })

	act(() => {
		result.current.form.onNew()
	})
	await act(async () => {
		result.current.form.onSave(
			entered({
				instruction: ROUTINE.instruction,
				triggerSourceId: "schedule",
				expression: "0 * * * *",
			}),
		)
	})

	await waitFor(() =>
		expect(result.current.form.open?.refusal).toBe("blankTitle"),
	)
	expect(result.current.form.open?.values).toEqual(
		entered({
			instruction: ROUTINE.instruction,
			triggerSourceId: "schedule",
			expression: "0 * * * *",
		}),
	)
	expect(result.current.failure).toBeNull()
})
