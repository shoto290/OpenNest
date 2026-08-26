import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useRef,
	useState,
} from "react"

import { capturePointer, releasePointer } from "@workspace/ui/lib/touch"

const LIFT_THRESHOLD = 4

const DROP_AREA_ATTRIBUTE = "data-roster-drop"

export const dropArea = (landing: string) => ({
	[DROP_AREA_ATTRIBUTE]: landing,
})

const landingAt = (x: number, y: number) =>
	document
		.elementFromPoint(x, y)
		?.closest(`[${DROP_AREA_ATTRIBUTE}]`)
		?.getAttribute(DROP_AREA_ATTRIBUTE) ?? null

interface Point {
	x: number
	y: number
}

interface Press extends Point {
	id: string
	isLifted: boolean
}

interface Lift {
	id: string
	landing: string | null
}

const place = (node: HTMLElement | null, at: Point, from: Point) => {
	if (!node) return
	node.style.setProperty("--lift-x", `${at.x}px`)
	node.style.setProperty("--lift-y", `${at.y}px`)
	node.style.setProperty("--lift-dy", `${at.y - from.y}px`)
}

export interface RosterLiftHandlers {
	onPointerCancel: () => void
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
	onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
	onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
}

export interface RosterLift {
	followRef: (node: HTMLElement | null) => void
	handlersFor: (id: string) => RosterLiftHandlers
	hasJustDropped: () => boolean
	lift: Lift | null
}

interface UseRosterLiftOptions {
	isEnabled: boolean
	onLand: (id: string, landing: string) => void
}

export const useRosterLift = ({
	isEnabled,
	onLand,
}: UseRosterLiftOptions): RosterLift => {
	const [lift, setLift] = useState<Lift | null>(null)
	const press = useRef<Press | null>(null)
	const at = useRef<Point>({ x: 0, y: 0 })
	const followed = useRef<HTMLElement | null>(null)
	const hasDropped = useRef(false)

	const followRef = useCallback((node: HTMLElement | null) => {
		followed.current = node
		if (press.current) place(node, at.current, press.current)
	}, [])

	const handlersFor = (id: string): RosterLiftHandlers => ({
		onPointerCancel: () => {
			press.current = null
			setLift(null)
		},
		onPointerDown: (event) => {
			hasDropped.current = false
			if (!isEnabled || event.button !== 0) return
			press.current = {
				id,
				isLifted: false,
				x: event.clientX,
				y: event.clientY,
			}
		},
		onPointerMove: (event) => {
			const pressed = press.current
			if (!pressed) return
			at.current = { x: event.clientX, y: event.clientY }
			if (!pressed.isLifted) {
				const travelled = Math.hypot(
					event.clientX - pressed.x,
					event.clientY - pressed.y,
				)
				if (travelled < LIFT_THRESHOLD) return
				pressed.isLifted = true
				capturePointer(event.currentTarget, event.pointerId)
			}
			place(followed.current, at.current, pressed)
			const landing = landingAt(event.clientX, event.clientY)
			setLift((held) =>
				held?.id === pressed.id && held.landing === landing
					? held
					: { id: pressed.id, landing },
			)
		},
		onPointerUp: (event) => {
			const pressed = press.current
			press.current = null
			if (!pressed?.isLifted) return
			releasePointer(event.currentTarget, event.pointerId)
			hasDropped.current = true
			setLift(null)
			const landing = landingAt(event.clientX, event.clientY)
			if (landing) onLand(pressed.id, landing)
		},
	})

	const hasJustDropped = () => {
		if (!hasDropped.current) return false
		hasDropped.current = false
		return true
	}

	return { followRef, handlersFor, hasJustDropped, lift }
}
