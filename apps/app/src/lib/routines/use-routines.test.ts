// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormValues,
} from "@workspace/ui/components/routine-form"

import type { Routine, RoutineKey } from "./routine-contract"
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

const SCHEDULE_SOURCE = {
	id: "schedule",
	title: "Schedule",
	payload: [],
	dedupeKey: "occurrenceId",
}

const DECLARED = [
	SCHEDULE_SOURCE,
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
		expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY),
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

it("lists the routines of a conversation whose sources are unreadable", async () => {
	list.mockResolvedValueOnce([ROUTINE])
	sources.mockRejectedValue(new Error("the sources are unreadable"))

	const { result } = renderHook(() =>
		useRoutines(ROUTINE.conversationId, ROUTINE.botId),
	)

	await waitFor(() => expect(result.current.failure).toBe("read"))
	expect(result.current.routines).toHaveLength(1)
	expect(result.current.form.canCreate).toBe(false)
})

it("keeps the key a later read carried when an earlier read rejects", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	let refuse = (_reason: unknown) => {}
	readKey.mockReturnValueOnce(
		new Promise((_resolve, reject) => {
			refuse = reject
		}),
	)
	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)

	act(() => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	await waitFor(() => expect(result.current.form.open?.webhook).toBeDefined())

	await act(async () => {
		refuse(new Error("the key is unreadable"))
	})

	expect(result.current.form.open?.hasFailedToReadKey).toBeUndefined()
	expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY)
})

it("hands the panel a trigger source the lead does not declare", async () => {
	list.mockResolvedValueOnce([WEBHOOK_ROUTINE])
	sources.mockResolvedValue([SCHEDULE_SOURCE])

	const { result } = renderHook(() =>
		useRoutines(ROUTINE.conversationId, ROUTINE.botId),
	)
	await waitFor(() => expect(result.current.routines).toHaveLength(1))
	expect(result.current.form.sources).toEqual([
		{ id: "schedule", title: "Schedule", kind: "schedule" },
	])

	readKey.mockResolvedValueOnce(A_WEBHOOK_KEY)
	await act(async () => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})

	expect(result.current.form.sources).toContainEqual({
		id: "local-webhook",
		title: "local-webhook",
		kind: "localWebhook",
	})
})

it("keeps a key that settled between a save and its refusal", async () => {
	const result = await mountLeadRoutines([WEBHOOK_ROUTINE])
	let settleKey = (_read: RoutineKey) => {}
	readKey.mockReturnValueOnce(
		new Promise<RoutineKey>((resolve) => {
			settleKey = resolve
		}),
	)
	let refuseSave = (_reason: unknown) => {}
	update.mockReturnValueOnce(
		new Promise<Routine>((_resolve, reject) => {
			refuseSave = reject
		}),
	)

	act(() => {
		result.current.form.onOpen(WEBHOOK_ROUTINE.id)
	})
	act(() => {
		result.current.form.onSave(entered({ instruction: "Read it" }))
	})
	await act(async () => {
		settleKey(A_WEBHOOK_KEY)
	})
	await act(async () => {
		refuseSave({ kind: "blankField", field: "title" })
	})

	expect(result.current.form.open?.webhook).toEqual(A_WEBHOOK_KEY)
	expect(result.current.form.open?.refusal).toBe("blankTitle")
})

it("raises the write failure of a save on a routine that left the list", async () => {
	const result = await mountLeadRoutines([ROUTINE])

	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})
	remove.mockResolvedValueOnce(undefined)
	await act(async () => {
		await result.current.remove(ROUTINE.id)
	})
	await act(async () => {
		result.current.form.onSave(entered({ title: "Nightly report" }))
	})

	expect(result.current.failure).toBe("write")
	expect(result.current.form.open?.values.title).toBe("Nightly report")
	expect(update).not.toHaveBeenCalled()
})

it("leaves the panel on the list when a save resolves after the form was closed", async () => {
	const result = await mountLeadRoutines([])
	let settleSave = (_written: Routine) => {}
	create.mockReturnValueOnce(
		new Promise<Routine>((resolve) => {
			settleSave = resolve
		}),
	)

	act(() => {
		result.current.form.onNew()
	})
	act(() => {
		result.current.form.onSave(
			entered({
				title: ROUTINE.title,
				instruction: ROUTINE.instruction,
				triggerSourceId: "schedule",
				expression: "0 * * * *",
			}),
		)
	})
	act(() => {
		result.current.form.onClose()
	})
	await act(async () => {
		settleSave(ROUTINE)
	})

	expect(result.current.form.open).toBeNull()
	expect(result.current.routines).toHaveLength(1)
})

it("leaves the routine on the form when a refusal lands from another form", async () => {
	const result = await mountLeadRoutines([ROUTINE])
	let refuseSave = (_reason: unknown) => {}
	create.mockReturnValueOnce(
		new Promise<Routine>((_resolve, reject) => {
			refuseSave = reject
		}),
	)

	act(() => {
		result.current.form.onNew()
	})
	act(() => {
		result.current.form.onSave(
			entered({ instruction: "Read it", triggerSourceId: "schedule" }),
		)
	})
	act(() => {
		result.current.form.onOpen(ROUTINE.id)
	})
	await act(async () => {
		refuseSave({ kind: "blankField", field: "title" })
	})

	expect(result.current.form.open).toMatchObject({
		id: ROUTINE.id,
		values: { title: ROUTINE.title, instruction: ROUTINE.instruction },
	})
	expect(result.current.form.open?.refusal).toBeUndefined()
	expect(result.current.failure).toBe("write")
})
