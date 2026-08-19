import { describe, expect, it } from "vitest"

import { rosterTimestamp } from "./roster-timestamp"

/** A moment in the reader's own timezone, which is the only one a row is read in:
 * built from local parts so the label does not follow the machine the test runs on. */
const at = (
	year: number,
	month: number,
	day: number,
	hour = 12,
	minute = 0,
): number => new Date(year, month - 1, day, hour, minute).getTime()

/** A Wednesday, late enough in the day that the distances below are read against a
 * clock that has already run. */
const NOW = at(2025, 3, 12, 21, 30)

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

/** A message that landed a given distance before the reading it is labelled from. */
const ago = (distance: number): string => rosterTimestamp(NOW - distance, NOW)

describe("rosterTimestamp", () => {
	// The minute a message lands in is the one a reader is still in: it is not a
	// distance yet, it is the present.
	it("reads a message from the last minute as now", () => {
		expect(ago(0)).toBe("now")
		expect(ago(59 * 1000)).toBe("now")
	})

	it("counts the whole minutes of the hour behind it", () => {
		expect(ago(MINUTE_MS)).toBe("1m")
		expect(ago(MINUTE_MS + 59 * 1000)).toBe("1m")
		expect(ago(12 * MINUTE_MS)).toBe("12m")
		expect(ago(59 * MINUTE_MS)).toBe("59m")
	})

	it("counts the whole hours of the day behind it", () => {
		expect(ago(HOUR_MS)).toBe("1h")
		expect(ago(HOUR_MS + 59 * MINUTE_MS)).toBe("1h")
		expect(ago(23 * HOUR_MS)).toBe("23h")
	})

	it("counts the whole days of the week behind it", () => {
		expect(ago(DAY_MS)).toBe("1d")
		expect(ago(DAY_MS + 23 * HOUR_MS)).toBe("1d")
		expect(ago(6 * DAY_MS)).toBe("6d")
	})

	it("counts the whole weeks of the four behind it", () => {
		expect(ago(WEEK_MS)).toBe("1w")
		expect(ago(WEEK_MS + 6 * DAY_MS)).toBe("1w")
		expect(ago(3 * WEEK_MS)).toBe("3w")
	})

	// Past four weeks a count of weeks stops locating anything, so the row dates the
	// message instead.
	it("dates a message older than four weeks", () => {
		expect(ago(4 * WEEK_MS)).toBe("2/12")
		expect(rosterTimestamp(at(2024, 12, 31), NOW)).toBe("12/31")
	})

	// Every label the row can draw, at its widest, is short enough to be read whole
	// in a 44px slot.
	it("keeps every label it draws narrow enough for the row", () => {
		const widest = [
			ago(0),
			ago(59 * MINUTE_MS),
			ago(23 * HOUR_MS),
			ago(6 * DAY_MS),
			ago(3 * WEEK_MS),
			rosterTimestamp(at(2024, 12, 31), NOW),
		]

		for (const label of widest) {
			expect(label.length).toBeLessThanOrEqual(5)
		}
	})

	// A host whose clock moved under this launch. It is not the future, it is now.
	it("reads a message stamped ahead of the clock as now", () => {
		expect(rosterTimestamp(at(2025, 3, 13, 8, 15), NOW)).toBe("now")
	})
})
