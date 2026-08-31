import { useEffect, useState } from "react"

const anchorFor = (bubbleId: string) =>
	document.querySelector(`[data-message-id="${CSS.escape(bubbleId)}"]`)

export function useBubbleVisibility(bubbleId: string | null): boolean {
	const [isInView, setIsInView] = useState(true)

	useEffect(() => {
		if (!bubbleId || typeof IntersectionObserver === "undefined") {
			return
		}
		let watched: Element | null = null
		const observer = new IntersectionObserver(([entry]) =>
			setIsInView(entry.isIntersecting),
		)
		const watch = (anchor: Element | null) => {
			observer.disconnect()
			watched = anchor
			if (!anchor) {
				setIsInView(false)
				return
			}
			observer.observe(anchor)
		}
		const rewatch = () => {
			const anchor = anchorFor(bubbleId)
			if (anchor !== watched) {
				watch(anchor)
			}
		}

		watch(anchorFor(bubbleId))
		const mounts = new MutationObserver(rewatch)
		mounts.observe(document.body, { childList: true, subtree: true })

		return () => {
			mounts.disconnect()
			observer.disconnect()
		}
	}, [bubbleId])

	return isInView
}
