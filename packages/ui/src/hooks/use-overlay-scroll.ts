import type { PartialOptions } from "overlayscrollbars"
import { useOverlayScrollbars } from "overlayscrollbars-react"
import { useCallback } from "react"

const OPTIONS: PartialOptions = {
	scrollbars: {
		autoHide: "leave",
		autoHideDelay: 600,
		theme: "os-theme-app",
	},
}

const canScroll = (element: HTMLElement) => {
	const { overflowX, overflowY } = getComputedStyle(element)
	return overflowX !== "hidden" || overflowY !== "hidden"
}

export const useOverlayScroll = () => {
	const [initialize, instance] = useOverlayScrollbars({ options: OPTIONS })

	return useCallback(
		(element: HTMLElement | null) => {
			if (!element || instance() || !canScroll(element)) return
			initialize({ target: element, elements: { viewport: element } })
		},
		[initialize, instance],
	)
}
