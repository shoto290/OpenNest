const MINUTE_MS = 60 * 1000

export type RosterClock = {
	subscribe: (onReading: () => void) => () => void
	read: () => number
}

/** The clock the roster's ages are read from. It holds one reading, which is what
 * labels every row of a render, and takes a new one every minute so an age the
 * reader is looking at is never a minute stale.
 *
 * It only runs while the window is shown: a hidden window is nobody reading, the
 * labels it drew stay as they were, and a window being read again — shown, or
 * subscribed to for the first time — is worth a reading of its own rather than a
 * wait for the next minute. */
export const createRosterClock = (): RosterClock => {
	let reading = Date.now()
	let ticker: ReturnType<typeof setInterval> | undefined
	let notify: (() => void) | undefined

	const publish = () => {
		reading = Date.now()
		notify?.()
	}

	const stopTicking = () => {
		clearInterval(ticker)
		ticker = undefined
	}

	const followVisibility = () => {
		stopTicking()
		if (document.hidden) {
			return
		}
		ticker = setInterval(publish, MINUTE_MS)
		publish()
	}

	return {
		read: () => reading,
		subscribe: (onReading) => {
			notify = onReading
			document.addEventListener("visibilitychange", followVisibility)
			followVisibility()

			return () => {
				notify = undefined
				document.removeEventListener("visibilitychange", followVisibility)
				stopTicking()
			}
		},
	}
}
