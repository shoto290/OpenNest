"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"

const NO_OP = () => {}

const getServerSnapshot = () => false

export const useIsNarrowerThan = (
	element: HTMLElement | null,
	width: number,
) => {
	const isNarrower = useRef(false)

	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!element) return NO_OP

			const observer = new ResizeObserver(() => {
				const next = element.getBoundingClientRect().width < width
				if (next === isNarrower.current) return
				isNarrower.current = next
				onChange()
			})
			observer.observe(element)

			return () => observer.disconnect()
		},
		[element, width],
	)

	const getSnapshot = useCallback(() => isNarrower.current, [])

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
