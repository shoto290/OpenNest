const LOCALE = "en-US"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const FOUR_WEEKS_MS = 4 * WEEK_MS

const DATE = new Intl.DateTimeFormat(LOCALE, {
	month: "numeric",
	day: "numeric",
})

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
