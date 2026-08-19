"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"

const NO_OP = () => {}

const getServerSnapshot = () => false

/**
 * Whether an element is narrower than `width` px, kept current as it resizes.
 * The element-level counterpart of a media query: a surface a caller sized narrow
 * inside a wide window answers true, which is what a window query would miss.
 *
 * The answer is measured in the observer and read from a ref, so a component that
 * re-renders on every keystroke never forces a layout, and it re-renders only when
 * the threshold is actually crossed.
 */
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
