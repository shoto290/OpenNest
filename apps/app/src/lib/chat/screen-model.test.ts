import { describe, expect, it } from "vitest"

import {
	activityStatusFor,
	emptyStateStatusFor,
	needsFreshSession,
	noticeTitleFor,
	toActivityItems,
} from "./screen-model"

import type { ActivityEvent } from "../claude/contract"

function activity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
	return {
		id: "act-1",
		title: "Bash · npm test",
		kind: "tool",
		status: "running",
		...overrides,
	}
}

describe("toActivityItems", () => {
	it("keeps identity and maps transport status onto step status", () => {
		const items = toActivityItems([
			activity({ id: "a", status: "pending" }),
			activity({ id: "b", status: "running" }),
			activity({ id: "c", status: "succeeded" }),
			activity({ id: "d", status: "failed" }),
		])

		expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"])
		expect(items.map((item) => item.status)).toEqual([
			"pending",
			"active",
			"complete",
			"complete",
		])
		expect(items[3].meta).toBe("Failed")
		expect(items[2].meta).toBeUndefined()
	})

	it("falls back to the activity kind when the title is empty", () => {
		expect(toActivityItems([activity({ title: "" })])[0].label).toBe("tool")
	})
})

describe("activityStatusFor", () => {
	it("follows the latest turn, not the whole session log", () => {
		expect(activityStatusFor("running")).toBe("working")
		expect(activityStatusFor("stopping")).toBe("working")
		expect(activityStatusFor("failed")).toBe("failed")
		expect(activityStatusFor("idle")).toBe("complete")
	})
})

describe("emptyStateStatusFor", () => {
	it("says nothing while the preflight is still running", () => {
		expect(emptyStateStatusFor("checking")).toBeNull()
		expect(emptyStateStatusFor("ready")).toBe("ready")
		expect(emptyStateStatusFor("unavailable")).toBe("unavailable")
		expect(emptyStateStatusFor("crashed")).toBe("unavailable")
	})
})

describe("notices", () => {
	it("separates errors that killed the session from the rest", () => {
		expect(needsFreshSession({ kind: "crashed", code: 1, detail: null })).toBe(
			true,
		)
		expect(needsFreshSession({ kind: "turnAlreadyRunning" })).toBe(false)

		expect(noticeTitleFor({ kind: "crashed", code: null, detail: null })).toBe(
			"Claude Code stopped",
		)
		expect(noticeTitleFor({ kind: "binaryNotFound", searched: [] })).toBe(
			"Claude Code is unavailable",
		)
		expect(noticeTitleFor({ kind: "noActiveTurn" })).toBe(
			"That request did not go through",
		)
	})
})
