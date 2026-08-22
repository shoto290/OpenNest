/** The distances a moment is read at, largest first. Anything under a minute is
 * read as now: a reader counting seconds is reading the wrong surface. */
const UNITS = [
	["year", 31_536_000_000],
	["month", 2_592_000_000],
	["week", 604_800_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
] as const satisfies readonly (readonly [Intl.RelativeTimeFormatUnit, number])[]

/** One formatter per language, kept: a list of a hundred commits builds one, not a
 * hundred. */
const formatters = new Map<string, Intl.RelativeTimeFormat>()

const formatterFor = (locale: string) => {
	const kept = formatters.get(locale)
	if (kept) return kept

	const made = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
	formatters.set(locale, made)
	return made
}

/**
 * A moment said as a distance from another one — "2 hours ago", "il y a 2 heures".
 * The wording is the platform's, in the language it is asked in, so no catalogue
 * carries a phrase per unit. `now` is a parameter rather than a reading of the clock
 * so the same input always says the same thing.
 */
const toRelativeTime = (at: number, locale: string, now: number) => {
	const format = formatterFor(locale)
	const elapsed = at - now

	for (const [unit, span] of UNITS) {
		if (Math.abs(elapsed) >= span) {
			return format.format(Math.round(elapsed / span), unit)
		}
	}

	return format.format(0, "second")
}

export { toRelativeTime }
