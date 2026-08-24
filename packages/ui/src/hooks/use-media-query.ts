"use client"

import { useCallback, useSyncExternalStore } from "react"

const mediaQueries = new Map<string, MediaQueryList>()

const mediaQuery = (query: string) => {
	const cached = mediaQueries.get(query)
	if (cached) return cached
	const created = window.matchMedia(query)
	mediaQueries.set(query, created)
	return created
}

const getServerSnapshot = () => false

export const useMediaQuery = (query: string) => {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const media = mediaQuery(query)
			media.addEventListener("change", onChange)
			return () => media.removeEventListener("change", onChange)
		},
		[query],
	)

	const getSnapshot = useCallback(() => mediaQuery(query).matches, [query])

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
