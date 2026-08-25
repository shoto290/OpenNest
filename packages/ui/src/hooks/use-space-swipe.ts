import { type RefObject, useEffect, useRef } from "react"

export const SWIPE_SETTLE = 220

type SwipeDelta = {
	deltaX: number
	deltaY: number
}

export const isHorizontalSwipe = ({ deltaX, deltaY }: SwipeDelta) =>
	Math.abs(deltaX) > Math.abs(deltaY)

const COASTING_FLOOR = 2

export type SpaceDrag = {
	index: number
	travel: number
	coasting: number
}

export const spaceAtRest = (index: number): SpaceDrag => ({
	index,
	travel: 0,
	coasting: 0,
})

type SpaceCoasting = {
	drag: SpaceDrag
	deltaX: number
}

export const hasStoppedCoasting = ({ drag, deltaX }: SpaceCoasting) =>
	Math.abs(deltaX) < COASTING_FLOOR || Math.sign(deltaX) !== drag.coasting

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
		return { index: drag.index + step, travel: 0, coasting: step }
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

type SpaceGesture = {
	node: HTMLElement
	count: number
	indexInView: () => number
	onTravel: (travel: number) => void
	onSettle: (index: number) => void
}

const readSpaceGesture = ({
	node,
	count,
	indexInView,
	onTravel,
	onSettle,
}: SpaceGesture) => {
	let drag = spaceAtRest(indexInView())
	let quiet: ReturnType<typeof setTimeout> | null = null

	const goQuiet = () => {
		quiet = null
		const released = drag
		drag = spaceAtRest(indexInView())
		if (released.coasting === 0 && released.travel !== 0)
			onSettle(released.index)
	}

	const coast = (deltaX: number) => {
		if (hasStoppedCoasting({ deltaX, drag })) drag = spaceAtRest(indexInView())
	}

	const gather = (deltaX: number) => {
		if (drag.travel === 0) drag = spaceAtRest(indexInView())
		drag = spaceDragged({ count, deltaX, drag, width: node.clientWidth })
		if (drag.coasting === 0) onTravel(drag.travel)
		else onSettle(drag.index)
	}

	const onWheel = (event: WheelEvent) => {
		if (quiet) clearTimeout(quiet)
		quiet = setTimeout(goQuiet, SWIPE_SETTLE)

		if (drag.coasting !== 0) coast(event.deltaX)
		else if (isHorizontalSwipe(event)) gather(event.deltaX)
	}

	node.addEventListener("wheel", onWheel, { passive: true })
	return () => {
		node.removeEventListener("wheel", onWheel)
		if (quiet) clearTimeout(quiet)
	}
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

		return readSpaceGesture({
			count,
			indexInView: () => inView.current,
			node,
			onSettle: (settledOn) => settled.current(settledOn),
			onTravel: (travel) => travelled.current(travel),
		})
	}, [target, isEnabled, count])
}
