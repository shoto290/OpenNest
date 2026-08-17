"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(hover: hover) and (pointer: fine)"

let media: MediaQueryList | null = null

const hoverQuery = () => {
	if (media === null) media = window.matchMedia(QUERY)
	return media
}

/** One native listener for the whole page, however many callers subscribe: a
 * transcript mounts one of these per bubble action, and each would otherwise
 * hold its own. */
const listeners = new Set<() => void>()

const broadcast = () => {
	for (const notify of listeners) notify()
}

const subscribe = (onChange: () => void) => {
	if (listeners.size === 0) hoverQuery().addEventListener("change", broadcast)
	listeners.add(onChange)
	return () => {
		listeners.delete(onChange)
		if (listeners.size === 0) {
			hoverQuery().removeEventListener("change", broadcast)
		}
	}
}

/**
 * Returns true only on devices that have a true hover (mouse / trackpad).
 * Touch devices fire phantom `:hover` on tap that sticks until tap-elsewhere
 * — gate hover-only effects (scale lifts, magnetic pulls) behind this.
 * Read during render, so the first paint already knows.
 */
export const useHoverCapable = () =>
	useSyncExternalStore(
		subscribe,
		() => hoverQuery().matches,
		() => false,
	)
