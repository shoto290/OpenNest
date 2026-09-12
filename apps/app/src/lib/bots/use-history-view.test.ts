// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HistoryDay } from "@workspace/ui/components/plugin-settings/history-panel"

import { initialHistoryFilesState } from "./history-files-controller"
import { useHistoryView } from "./use-history-view"

import type { BotHistoryEntry } from "../conversations/store-contract"

afterEach(cleanup)

const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime() / 1000

const MINUTE = 60

const entry = (fields: Partial<BotHistoryEntry> & { id: string }) => ({
	timestamp: NOON,
	author: "user" as const,
	title: "A skill saved",
	body: "",
	paths: ["skills/how-i-work/SKILL.md"],
	...fields,
})

const A_RUN = [
	entry({ id: "newest", timestamp: NOON + MINUTE }),
	entry({ id: "oldest" }),
]

const ANOTHER_CHANGE = entry({
	id: "alone",
	title: "Something else",
	paths: ["AGENTS.md"],
	timestamp: NOON - MINUTE,
})

const viewOf = (commits: BotHistoryEntry[]) => {
	const onOpenRun = vi.fn()
	const onUndoRun = vi.fn()
	const { result, rerender } = renderHook(
		({ isOpen }: { isOpen: boolean }) =>
			useHistoryView({
				...initialHistoryFilesState,
				isOpen,
				commits,
				hasFailedToLoad: false,
				onOpenRun,
				onUndoRun,
			}),
		{ initialProps: { isOpen: true } },
	)

	return { result, rerender, onOpenRun, onUndoRun }
}

const linesOf = (days: HistoryDay[]) =>
	days.flatMap((day) => day.changes.map((change) => change.id))

describe("history view", () => {
	it("shows every change again when the dialogue is opened after a search", () => {
		const { result, rerender } = viewOf([...A_RUN, ANOTHER_CHANGE])

		act(() => result.current.onSearchChange?.("Something else"))
		expect(linesOf(result.current.days)).toEqual(["alone"])

		rerender({ isOpen: false })
		rerender({ isOpen: true })

		expect(linesOf(result.current.days)).toEqual(["newest", "alone"])
	})

	it("returns no day while the search text matches no run", () => {
		const { result } = viewOf([...A_RUN, ANOTHER_CHANGE])

		act(() => result.current.onSearchChange?.("nothing of the sort"))

		expect(result.current.days).toEqual([])
	})

	it("asks for the files of the whole run a line stands for", () => {
		const { result, onOpenRun } = viewOf(A_RUN)
		const [line] = result.current.days[0].changes

		act(() => result.current.onOpen?.(line))

		expect(onOpenRun).toHaveBeenCalledWith("oldest", "newest")
	})

	it("undoes the whole run a line stands for", () => {
		const { result, onUndoRun } = viewOf(A_RUN)
		const [line] = result.current.days[0].changes

		act(() => result.current.onUndo(line))

		expect(onUndoRun).toHaveBeenCalledWith("oldest", "newest")
	})
})
