const MINUTE_MS = 60 * 1000

export type RosterClock = {
	subscribe: (onReading: () => void) => () => void
	read: () => number
}

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
