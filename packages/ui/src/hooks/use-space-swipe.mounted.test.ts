// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	SWIPE_SETTLE,
	useSpaceSwipe,
} from "@workspace/ui/hooks/use-space-swipe"

const PANEL_WIDTH = 300

const HALF_PANEL = PANEL_WIDTH / 2

const listAreaOf = () => {
	const node = document.createElement("div")
	Object.defineProperty(node, "clientWidth", { value: PANEL_WIDTH })
	document.body.append(node)
	return node
}

const swipe = (node: HTMLElement, deltaX: number) => {
	node.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY: 0 }))
}

const gestureEnds = () => vi.advanceTimersByTime(SWIPE_SETTLE + 1)

type Swipe = Parameters<typeof useSpaceSwipe>[0]

const swipeOn =
	(target: Swipe["target"]) =>
	(onSettle: Swipe["onSettle"]): Swipe => ({
		count: 3,
		index: 1,
		isEnabled: true,
		onSettle,
		onTravel: () => undefined,
		target,
	})

const mountSwipe = (node: HTMLElement, onSettle: Swipe["onSettle"]) => {
	const propsFor = swipeOn({ current: node })
	const view = renderHook(useSpaceSwipe, { initialProps: propsFor(onSettle) })
	return {
		rerenderWith: (later: Swipe["onSettle"]) => view.rerender(propsFor(later)),
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
		swipe(node, HALF_PANEL - 10)
		gestureEnds()

		expect(firstSettle).not.toHaveBeenCalled()
		expect(laterSettle).toHaveBeenCalledTimes(1)
		expect(laterSettle).toHaveBeenCalledWith(2)
	})

	it("settles once however many wheel events the gesture is made of", () => {
		const node = listAreaOf()
		const onSettle = vi.fn()
		mountSwipe(node, onSettle)

		for (let tick = 0; tick < 6; tick += 1) swipe(node, 40)
		expect(onSettle).not.toHaveBeenCalled()

		gestureEnds()
		expect(onSettle).toHaveBeenCalledTimes(1)
		expect(onSettle).toHaveBeenCalledWith(2)
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
})
