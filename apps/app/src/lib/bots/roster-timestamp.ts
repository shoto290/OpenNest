/** The words the roster is labelled in. Pinned rather than read off the machine:
 * every other line in this app is English, and a row whose date order followed the
 * host would be read against names and previews that did not. */
const LOCALE = "en-US"

const DAY_MS = 24 * 60 * 60 * 1000

/** Built once. A formatter is expensive to make and these three never change. */
const TIME = new Intl.DateTimeFormat(LOCALE, {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
})

const WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: "short" })

const DATE = new Intl.DateTimeFormat(LOCALE, {
	month: "numeric",
	day: "numeric",
	year: "2-digit",
})

/** Midnight before a moment, in the reader's own timezone: the row says "today" the
 * way a calendar does, not the way a count of hours would. */
const startOfDay = (at: number): number => {
	const day = new Date(at)
	day.setHours(0, 0, 0, 0)
	return day.getTime()
}

/** How many calendar days back a moment falls. Rounded, because the days a clock
 * change falls in are an hour short or an hour long. */
const daysBefore = (at: number, now: number): number =>
	Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)

/** When a bot last said something, as narrow as the row's slot and as precise as
 * that distance deserves: the hour today, the word for yesterday, the weekday for
 * the week behind it, and the date once naming the day stops locating it.
 *
 * `now` is given rather than read, so every row of one roster is labelled from one
 * reading and a test can stand the clock still. A moment ahead of that reading is a
 * host whose clock moved under this launch, and it reads as today. */
export const rosterTimestamp = (at: number, now: number): string => {
	const days = daysBefore(at, now)
	if (days <= 0) {
		return TIME.format(at)
	}
	if (days === 1) {
		return "Yesterday"
	}
	if (days < 7) {
		return WEEKDAY.format(at)
	}
	return DATE.format(at)
}
