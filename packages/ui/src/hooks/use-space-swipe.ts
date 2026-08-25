import { type RefObject, useEffect, useRef } from "react"

export const SWIPE_SETTLE = 220

type SwipeDelta = {
	deltaX: number
	deltaY: number
}

export const isHorizontalSwipe = ({ deltaX, deltaY }: SwipeDelta) =>
	Math.abs(deltaX) > Math.abs(deltaY)

export type SpaceDrag = {
	index: number
	travel: number
	isCommitted: boolean
}

export const spaceAtRest = (index: number): SpaceDrag => ({
	index,
	travel: 0,
	isCommitted: false,
})

type SpaceDragged = {
	drag: SpaceDrag
	deltaX: number
	count: number
	width: number
}

const hasCrossedHalf = (travel: number, width: number) =>
	width > 0 && Math.abs(travel) * 2 >= width

export const spaceDragged = ({
	drag,
	deltaX,
	count,
	width,
}: SpaceDragged): SpaceDrag => {
	const travel = drag.travel + deltaX
	const step = travel > 0 ? 1 : -1
	const isHeldAtEnd = step > 0 && drag.index >= count - 1
	const isHeldAtStart = step < 0 && drag.index <= 0
	if (isHeldAtEnd || isHeldAtStart) return { ...drag, travel: 0 }
	if (hasCrossedHalf(travel, width))
		return { index: drag.index + step, travel: 0, isCommitted: true }
	return { ...drag, travel }
}

type SpaceSwipe = {
	target: RefObject<HTMLElement | null>
	count: number
	index: number
	isEnabled: boolean
	onTravel: (travel: number) => void
	onSettle: (index: number) => void
}

export const useSpaceSwipe = ({
	target,
	count,
	index,
	isEnabled,
	onTravel,
	onSettle,
}: SpaceSwipe) => {
	const inView = useRef(index)
	inView.current = index
	const travelled = useRef(onTravel)
	travelled.current = onTravel
	const settled = useRef(onSettle)
	settled.current = onSettle

	useEffect(() => {
		const node = target.current
		if (!isEnabled || !node) return

		let drag = spaceAtRest(inView.current)
		let quiet: ReturnType<typeof setTimeout> | null = null

		const goQuiet = () => {
			quiet = null
			const released = drag
			drag = spaceAtRest(inView.current)
			if (released.isCommitted || released.travel === 0) return
			settled.current(released.index)
		}

		const onWheel = (event: WheelEvent) => {
			if (quiet) clearTimeout(quiet)
			quiet = setTimeout(goQuiet, SWIPE_SETTLE)

			if (drag.isCommitted || !isHorizontalSwipe(event)) return
			if (drag.travel === 0) drag = spaceAtRest(inView.current)

			drag = spaceDragged({
				count,
				deltaX: event.deltaX,
				drag,
				width: node.clientWidth,
			})
			if (drag.isCommitted) settled.current(drag.index)
			else travelled.current(drag.travel)
		}

		node.addEventListener("wheel", onWheel, { passive: true })
		return () => {
			node.removeEventListener("wheel", onWheel)
			if (quiet) clearTimeout(quiet)
		}
	}, [target, isEnabled, count])
}
