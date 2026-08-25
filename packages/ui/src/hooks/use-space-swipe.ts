import { type RefObject, useEffect, useRef } from "react"

const SWIPE_THRESHOLD = 48

export const SWIPE_SETTLE = 220

type SwipeDelta = {
	deltaX: number
	deltaY: number
}

export const isHorizontalSwipe = ({ deltaX, deltaY }: SwipeDelta) =>
	Math.abs(deltaX) > Math.abs(deltaY)

export const swipeStepOf = (travel: number) => {
	if (Math.abs(travel) < SWIPE_THRESHOLD) return 0
	return travel > 0 ? 1 : -1
}

type SpaceSwipe = {
	target: RefObject<HTMLElement | null>
	isEnabled: boolean
	onStep: (step: number) => void
}

export const useSpaceSwipe = ({ target, isEnabled, onStep }: SpaceSwipe) => {
	const step = useRef(onStep)
	step.current = onStep

	useEffect(() => {
		const node = target.current
		if (!isEnabled || !node) return

		let travel = 0
		let isSpent = false
		let settle: ReturnType<typeof setTimeout> | null = null

		const rest = () => {
			travel = 0
			isSpent = false
		}

		const onWheel = (event: WheelEvent) => {
			if (!isHorizontalSwipe(event)) return

			if (settle) clearTimeout(settle)
			settle = setTimeout(rest, SWIPE_SETTLE)
			if (isSpent) return

			travel += event.deltaX
			const travelled = swipeStepOf(travel)
			if (travelled === 0) return

			isSpent = true
			travel = 0
			step.current(travelled)
		}

		node.addEventListener("wheel", onWheel, { passive: true })
		return () => {
			node.removeEventListener("wheel", onWheel)
			if (settle) clearTimeout(settle)
		}
	}, [target, isEnabled])
}
