import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createRosterClock } from "./roster-clock"

const MINUTE_MS = 60 * 1000
const START = new Date(2025, 2, 12, 21, 30).getTime()

/** The window the clock follows: shown or hidden, and told when that changes. */
const stubWindow = () => {
	const listeners = new Set<() => void>()
	const stub = {
		hidden: false,
		addEventListener: (_: string, listener: () => void) => {
			listeners.add(listener)
		},
		removeEventListener: (_: string, listener: () => void) => {
			listeners.delete(listener)
		},
	}

	vi.stubGlobal("document", stub)

	const announce = (hidden: boolean) => {
		stub.hidden = hidden
		for (const listener of listeners) {
			listener()
		}
	}

	return {
		listenerCount: () => listeners.size,
		hide: () => announce(true),
		show: () => announce(false),
	}
}

/** A clock with a roster reading it, past the reading subscribing takes: what the
 * tests below assert is what the clock does after that one. */
const readClock = () => {
	const clock = createRosterClock()
	const onReading = vi.fn()
	const unsubscribe = clock.subscribe(onReading)
	onReading.mockClear()

	return { clock, onReading, unsubscribe }
}

describe("createRosterClock", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(START)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("reads the clock the moment it is made", () => {
		stubWindow()

		expect(createRosterClock().read()).toBe(START)
	})

	// A row labelled "3m" is wrong a minute later, so the reading behind it is taken
	// again every minute the roster is on screen.
	it("takes a reading every minute the roster is read", () => {
		stubWindow()
		const { clock, onReading } = readClock()

		vi.advanceTimersByTime(MINUTE_MS)

		expect(clock.read()).toBe(START + MINUTE_MS)

		vi.advanceTimersByTime(2 * MINUTE_MS)

		expect(clock.read()).toBe(START + 3 * MINUTE_MS)
		expect(onReading).toHaveBeenCalledTimes(3)
	})

	// Nobody is reading a hidden window, so the labels it drew stay as they were.
	it("holds its reading while the window is hidden", () => {
		const window = stubWindow()
		const { clock, onReading } = readClock()

		window.hide()
		vi.advanceTimersByTime(5 * MINUTE_MS)

		expect(clock.read()).toBe(START)
		expect(onReading).not.toHaveBeenCalled()
	})

	// The first thing a reader does with a window they just showed is read it, and
	// that is worth a reading of its own rather than a wait for the next minute.
	it("reads the clock again the moment the window is shown", () => {
		const window = stubWindow()
		const { clock, onReading } = readClock()

		window.hide()
		vi.advanceTimersByTime(5 * MINUTE_MS)
		window.show()

		expect(clock.read()).toBe(START + 5 * MINUTE_MS)
		expect(onReading).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(MINUTE_MS)

		expect(clock.read()).toBe(START + 6 * MINUTE_MS)
	})

	// A clock nobody is labelled from is a timer nobody needs.
	it("stops reading once nothing is subscribed", () => {
		const window = stubWindow()
		const { clock, onReading, unsubscribe } = readClock()

		unsubscribe()
		vi.advanceTimersByTime(5 * MINUTE_MS)

		expect(clock.read()).toBe(START)
		expect(onReading).not.toHaveBeenCalled()
		expect(window.listenerCount()).toBe(0)
	})
})
