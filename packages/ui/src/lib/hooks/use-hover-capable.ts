"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(hover: hover) and (pointer: fine)"

let media: MediaQueryList | null = null

const hoverQuery = () => {
	if (media === null) media = window.matchMedia(QUERY)
	return media
}

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

export const useHoverCapable = () =>
	useSyncExternalStore(
		subscribe,
		() => hoverQuery().matches,
		() => false,
	)
