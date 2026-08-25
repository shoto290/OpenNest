// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	SWIPE_SETTLE,
	useSpaceSwipe,
} from "@workspace/ui/hooks/use-space-swipe"

const PANEL_WIDTH = 300

const HALF_PANEL = PANEL_WIDTH / 2

const MOMENTUM_TICKS = 20

const listAreaOf = () => {
	const node = document.createElement("div")
	Object.defineProperty(node, "clientWidth", { value: PANEL_WIDTH })
	document.body.append(node)
	return node
}

const swipe = (node: HTMLElement, deltaX: number) => {
	node.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY: 0 }))
}

const scroll = (node: HTMLElement, deltaY: number) => {
	node.dispatchEvent(new WheelEvent("wheel", { deltaX: 0, deltaY }))
}

const gestureEnds = () => vi.advanceTimersByTime(SWIPE_SETTLE + 1)

type Swipe = Parameters<typeof useSpaceSwipe>[0]

const swipeOn =
	(target: Swipe["target"]) =>
	(onSettle: Swipe["onSettle"], onTravel: Swipe["onTravel"]): Swipe => ({
		count: 3,
		index: 1,
		isEnabled: true,
		onSettle,
		onTravel,
		target,
	})

const mountSwipe = (
	node: HTMLElement,
	onSettle: Swipe["onSettle"],
	onTravel: Swipe["onTravel"] = () => undefined,
) => {
	const propsFor = swipeOn({ current: node })
	const view = renderHook(useSpaceSwipe, {
		initialProps: propsFor(onSettle, onTravel),
	})
	return {
		rerenderWith: (later: Swipe["onSettle"]) =>
			view.rerender(propsFor(later, onTravel)),
	}
}

describe("useSpaceSwipe mounted", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		document.body.replaceChildren()
	})

	it("keeps the travel a gesture gathered when the consumer re-renders mid-gesture", () => {
		const node = listAreaOf()
		const firstSettle = vi.fn()
		const laterSettle = vi.fn()
		const view = mountSwipe(node, firstSettle)

		swipe(node, HALF_PANEL - 10)
		view.rerenderWith(laterSettle)
		swipe(node, 10)
		gestureEnds()

		expect(firstSettle).not.toHaveBeenCalled()
		expect(laterSettle).toHaveBeenCalledTimes(1)
		expect(laterSettle).toHaveBeenCalledWith(2)
	})

	it("follows the whole gesture and only magnetises once it is let go", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		const onTravel = vi.fn()
		mountSwipe(node, onSettle, onTravel)

		swipe(node, HALF_PANEL - 10)
		expect(onTravel).toHaveBeenLastCalledWith(HALF_PANEL - 10)
		expect(onSettle).not.toHaveBeenCalled()

		swipe(node, 20)
		expect(onTravel).toHaveBeenLastCalledWith(HALF_PANEL + 10)
		expect(onSettle).not.toHaveBeenCalled()

		gestureEnds()
		expect(onSettle).toHaveBeenCalledTimes(1)
		expect(onSettle).toHaveBeenCalledWith(2)
	})

	it("reaches the neighbour without waiting once the row can travel no further", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		const onTravel = vi.fn()
		mountSwipe(node, onSettle, onTravel)

		swipe(node, PANEL_WIDTH)
		expect(onSettle).toHaveBeenCalledTimes(1)
		expect(onSettle).toHaveBeenCalledWith(2)
		expect(onTravel).not.toHaveBeenCalled()
	})

	it("spends the gesture, so the momentum behind it cannot walk on to another space", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		swipe(node, PANEL_WIDTH)
		for (let tick = 0; tick < MOMENTUM_TICKS; tick += 1) swipe(node, 80)
		expect(onSettle).toHaveBeenCalledTimes(1)

		gestureEnds()
		expect(onSettle).toHaveBeenCalledTimes(1)

		swipe(node, PANEL_WIDTH)
		expect(onSettle).toHaveBeenCalledTimes(2)
	})

	it("hears the swipe that follows a flick instead of taking it for momentum", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		swipe(node, PANEL_WIDTH)
		for (let tick = 0; tick < MOMENTUM_TICKS; tick += 1) swipe(node, 80)
		swipe(node, 1)
		swipe(node, PANEL_WIDTH)

		expect(onSettle).toHaveBeenCalledTimes(2)
		expect(onSettle).toHaveBeenLastCalledWith(2)
	})

	it("hears a swipe back the other way while the flick is still coasting", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		swipe(node, PANEL_WIDTH)
		for (let tick = 0; tick < MOMENTUM_TICKS; tick += 1) swipe(node, 80)
		swipe(node, -80)
		swipe(node, -PANEL_WIDTH)

		expect(onSettle).toHaveBeenCalledTimes(2)
		expect(onSettle).toHaveBeenLastCalledWith(0)
	})

	it("holds that latch up for as long as the momentum keeps sending events", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		swipe(node, PANEL_WIDTH)
		for (let tick = 0; tick < MOMENTUM_TICKS; tick += 1) {
			vi.advanceTimersByTime(SWIPE_SETTLE - 20)
			swipe(node, 80)
		}

		expect(onSettle).toHaveBeenCalledTimes(1)
	})

	it("settles back on the space it started from short of half a panel", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		swipe(node, HALF_PANEL - 10)
		gestureEnds()

		expect(onSettle).toHaveBeenCalledTimes(1)
		expect(onSettle).toHaveBeenCalledWith(1)
	})

	it("says nothing at all when the reader only scrolls the list", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		const onTravel = vi.fn()
		mountSwipe(node, onSettle, onTravel)

		scroll(node, 400)
		gestureEnds()

		expect(onTravel).not.toHaveBeenCalled()
		expect(onSettle).not.toHaveBeenCalled()
	})
})
