const LOCALE = "en-US"

const STAMP = new Intl.DateTimeFormat(LOCALE, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
})

export const pinTimestamp = (at: number): string => STAMP.format(at)
