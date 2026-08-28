import { useEffect, useState } from "react"

const anchorFor = (bubbleId: string) =>
	document.querySelector(`[data-message-id="${CSS.escape(bubbleId)}"]`)

export function useBubbleVisibility(bubbleId: string | null): boolean {
	const [isInView, setIsInView] = useState(true)

	useEffect(() => {
		if (!bubbleId || typeof IntersectionObserver === "undefined") {
			return
		}
		const anchor = anchorFor(bubbleId)
		if (!anchor) {
			return
		}
		setIsInView(true)
		const observer = new IntersectionObserver(([entry]) =>
			setIsInView(entry.isIntersecting),
		)
		observer.observe(anchor)
		return () => observer.disconnect()
	}, [bubbleId])

	return isInView
}
