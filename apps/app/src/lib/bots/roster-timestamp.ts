/** The words the roster is labelled in. Pinned rather than read off the machine:
 * every other line in this app is English, and a row whose date order followed the
 * host would be read against names and previews that did not. */
const LOCALE = "en-US"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const FOUR_WEEKS_MS = 4 * WEEK_MS

/** Built once. A formatter is expensive to make and this one never changes.
 * Month and day only: the row's slot is 44px and a two-digit year does not fit
 * beside a two-digit month and a two-digit day, so the label that would clip is
 * the one the reader never sees whole. */
const DATE = new Intl.DateTimeFormat(LOCALE, {
	month: "numeric",
	day: "numeric",
})

/** How long ago a bot last said something, as narrow as the row's slot: the
 * distance is what a reader of a roster wants, and it stays a distance until
 * naming one stops locating the message, where the calendar takes over.
 *
 * `now` is given rather than read, so every row of one roster is labelled from one
 * reading and a test can stand the clock still. A moment ahead of that reading is a
 * host whose clock moved under this launch, and it reads as now. */
export const rosterTimestamp = (at: number, now: number): string => {
	const age = now - at
	if (age < MINUTE_MS) {
		return "now"
	}
	if (age < HOUR_MS) {
		return `${Math.floor(age / MINUTE_MS)}m`
	}
	if (age < DAY_MS) {
		return `${Math.floor(age / HOUR_MS)}h`
	}
	if (age < WEEK_MS) {
		return `${Math.floor(age / DAY_MS)}d`
	}
	if (age < FOUR_WEEKS_MS) {
		return `${Math.floor(age / WEEK_MS)}w`
	}
	return DATE.format(at)
}
