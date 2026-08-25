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
}

type SpaceDragged = {
	drag: SpaceDrag
	deltaX: number
	count: number
	width: number
}

const withinOnePanel = (travel: number, width: number) =>
	Math.max(Math.min(travel, width), -width)

export const spaceDragged = ({
	drag,
	deltaX,
	count,
	width,
}: SpaceDragged): SpaceDrag => {
	const travel = drag.travel + deltaX
	const isHeldAtEnd = travel > 0 && drag.index >= count - 1
	const isHeldAtStart = travel < 0 && drag.index <= 0
	if (isHeldAtEnd || isHeldAtStart) return { ...drag, travel: 0 }
	return { ...drag, travel: withinOnePanel(travel, width) }
}

type SpaceSettled = {
	drag: SpaceDrag
	width: number
}

export const spaceSettled = ({ drag, width }: SpaceSettled) => {
	if (width <= 0 || Math.abs(drag.travel) * 2 < width) return drag.index
	return drag.index + (drag.travel > 0 ? 1 : -1)
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

		let drag: SpaceDrag = { index: inView.current, travel: 0 }
		let settle: ReturnType<typeof setTimeout> | null = null

		const rest = () => {
			settle = null
			settled.current(spaceSettled({ drag, width: node.clientWidth }))
		}

		const onWheel = (event: WheelEvent) => {
			if (!isHorizontalSwipe(event)) return

			if (settle) clearTimeout(settle)
			else drag = { index: inView.current, travel: 0 }
			settle = setTimeout(rest, SWIPE_SETTLE)

			drag = spaceDragged({
				count,
				deltaX: event.deltaX,
				drag,
				width: node.clientWidth,
			})
			travelled.current(drag.travel)
		}

		node.addEventListener("wheel", onWheel, { passive: true })
		return () => {
			node.removeEventListener("wheel", onWheel)
			if (settle) clearTimeout(settle)
		}
	}, [target, isEnabled, count])
}
