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

/** A Wednesday, late enough in the day that yesterday is a calendar day away rather
 * than a handful of hours. */
const NOW = at(2025, 3, 12, 21, 30)

describe("rosterTimestamp", () => {
	it("gives the hour and the minute to a message from today", () => {
		expect(rosterTimestamp(at(2025, 3, 12, 9, 24), NOW)).toBe("09:24")
		// Both ends of the day: the small hours are not the afternoon, and a clock
		// that ran to noon is still on the same page as one that ran to midnight.
		expect(rosterTimestamp(at(2025, 3, 12, 0, 5), NOW)).toBe("00:05")
		expect(rosterTimestamp(at(2025, 3, 12, 13, 7), NOW)).toBe("13:07")
	})

	// Ten minutes before midnight and ten minutes after it are hours apart and days
	// apart, and it is the calendar that a row is read against.
	it("counts the days by the calendar and not by the hours between them", () => {
		expect(
			rosterTimestamp(at(2025, 3, 12, 0, 10), at(2025, 3, 12, 23, 50)),
		).toBe("00:10")
		expect(
			rosterTimestamp(at(2025, 3, 11, 23, 50), at(2025, 3, 12, 0, 10)),
		).toBe("Yesterday")
	})

	it("names yesterday rather than dating it", () => {
		expect(rosterTimestamp(at(2025, 3, 11, 9, 24), NOW)).toBe("Yesterday")
	})

	// The six days before yesterday: the weekday still locates them, and the last of
	// them is the furthest one that does.
	it("names the weekday of the six days before yesterday", () => {
		expect(rosterTimestamp(at(2025, 3, 10), NOW)).toBe("Mon")
		expect(rosterTimestamp(at(2025, 3, 9), NOW)).toBe("Sun")
		expect(rosterTimestamp(at(2025, 3, 6), NOW)).toBe("Thu")
	})

	// A week back, the weekday it names is the one the row already shows for this
	// week, so it dates it instead.
	it("dates a message older than that", () => {
		expect(rosterTimestamp(at(2025, 3, 5), NOW)).toBe("3/5/25")
		expect(rosterTimestamp(at(2024, 12, 31), NOW)).toBe("12/31/24")
	})

	// The night a clock changes is an hour short, and the day before it is still a
	// whole day before it.
	it("counts a day a clock change fell in as a whole day", () => {
		expect(rosterTimestamp(at(2025, 3, 29), at(2025, 3, 31, 9, 0))).toBe("Sat")
	})

	// A host whose clock moved under this launch. It is not the future, it is now.
	it("reads a message stamped ahead of the clock as today", () => {
		expect(rosterTimestamp(at(2025, 3, 13, 8, 15), NOW)).toBe("08:15")
	})
})
