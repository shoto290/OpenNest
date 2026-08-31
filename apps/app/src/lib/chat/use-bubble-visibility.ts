import { useEffect, useState } from "react"

const TRANSCRIPT = '[data-slot="message-scroller"]'

const anchorIn = (transcript: Element, bubbleId: string) =>
	transcript.querySelector(`[data-message-id="${CSS.escape(bubbleId)}"]`)

export function useBubbleVisibility(bubbleId: string | null): boolean {
	const [isInView, setIsInView] = useState(true)

	useEffect(() => {
		const transcript = document.querySelector(TRANSCRIPT)
		if (
			!bubbleId ||
			!transcript ||
			typeof IntersectionObserver === "undefined"
		) {
			return
		}
		let watched: Element | null = null
		const observer = new IntersectionObserver(([entry]) =>
			setIsInView(entry.isIntersecting),
		)
		const observeAnchor = (anchor: Element | null) => {
			observer.disconnect()
			watched = anchor
			if (!anchor) {
				setIsInView(false)
				return
			}
			observer.observe(anchor)
		}
		const followMounts = () => {
			const anchor = anchorIn(transcript, bubbleId)
			if (anchor !== watched) {
				observeAnchor(anchor)
			}
		}

		observeAnchor(anchorIn(transcript, bubbleId))
		const mounts = new MutationObserver(followMounts)
		mounts.observe(transcript, { childList: true, subtree: true })

		return () => {
			mounts.disconnect()
			observer.disconnect()
		}
	}, [bubbleId])

	return isInView
}
