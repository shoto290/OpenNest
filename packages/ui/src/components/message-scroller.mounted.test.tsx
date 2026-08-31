// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	MessageScroller,
	type MessageScrollerRow,
	type MessageScrollerTrace,
} from "@workspace/ui/components/message-scroller"

import "@workspace/ui/lib/i18n"

const VIEWPORT_HEIGHT = 300
const ROW_HEIGHT = 80
const COMPOSER_GROWTH = 84
const ANCHOR_DRIFT = 6
const ESTIMATED_ROW_HEIGHT = 120
const MEASURED_ROW_HEIGHT = 600
const TRACED_ROWS = 8

interface ResizeEntry {
	target: Element
	borderBoxSize: { inlineSize: number; blockSize: number }[]
}

const observers = new Set<TestResizeObserver>()

class TestResizeObserver {
	private readonly callback: (entries: ResizeEntry[]) => void
	private readonly targets = new Set<Element>()

	constructor(callback: (entries: ResizeEntry[]) => void) {
		this.callback = callback
		observers.add(this)
	}

	observe(target: Element) {
		this.targets.add(target)
	}

	unobserve(target: Element) {
		this.targets.delete(target)
	}

	disconnect() {
		this.targets.clear()
		observers.delete(this)
	}

	flush() {
		if (this.targets.size === 0) return

		this.callback(
			[...this.targets].map((target) => ({
				target,
				borderBoxSize: [
					{ inlineSize: target.clientWidth, blockSize: target.clientHeight },
				],
			})),
		)
	}
}

const flushResize = () => {
	for (const observer of [...observers]) observer.flush()
}

const rowsUpTo = (count: number): MessageScrollerRow[] =>
	Array.from({ length: count }, (_, index) => ({
		key: `row-${index}`,
		messageIds: [`row-${index}`],
		render: () => `Row ${index}`,
	}))

const stubLayout = (
	viewport: HTMLElement,
	viewportHeight: () => number,
	contentHeight: () => number,
) => {
	let scrollTop = 0
	Object.defineProperty(viewport, "clientHeight", {
		configurable: true,
		get: viewportHeight,
	})
	Object.defineProperty(viewport, "scrollHeight", {
		configurable: true,
		get: contentHeight,
	})
	Object.defineProperty(viewport, "scrollTop", {
		configurable: true,
		get: () => scrollTop,
		set: (next: number) => {
			scrollTop = Math.max(
				0,
				Math.min(next, viewport.scrollHeight - viewportHeight()),
			)
		},
	})
}

type ScrollerSetup = {
	estimatedRowHeight?: number
	onLandingTrace?: (event: MessageScrollerTrace) => void
}

const renderScroller = (count: number, setup: ScrollerSetup = {}) => {
	const estimatedRowHeight = setup.estimatedRowHeight ?? ROW_HEIGHT
	let mountedRows = count
	let viewportHeight = VIEWPORT_HEIGHT
	let rowHeight = estimatedRowHeight
	const onFollowChange = vi.fn()
	const scroller = (rowCount: number) => (
		<MessageScroller
			smooth={false}
			estimatedRowHeight={estimatedRowHeight}
			onFollowChange={onFollowChange}
			onLandingTrace={setup.onLandingTrace}
			rows={rowsUpTo(rowCount)}
		/>
	)

	const view = render(scroller(0))
	const viewport = view.container.querySelector<HTMLElement>("section")
	if (!viewport) throw new Error("viewport never mounted")

	stubLayout(
		viewport,
		() => viewportHeight,
		() => mountedRows * rowHeight,
	)
	const endOf = () => viewport.scrollHeight - viewportHeight
	const grow = (nextCount: number) =>
		act(() => {
			mountedRows = nextCount
			view.rerender(scroller(nextCount))
		})
	const loseHeight = (lost: number) =>
		act(() => {
			viewportHeight -= lost
			view.rerender(scroller(mountedRows))
			viewport.scrollTop -= ANCHOR_DRIFT
			fireEvent.scroll(viewport)
			flushResize()
		})

	const measureRows = (nextRowHeight: number) =>
		act(() => {
			rowHeight = nextRowHeight
			flushResize()
			fireEvent.scroll(viewport)
		})

	grow(count)
	return { viewport, endOf, grow, loseHeight, measureRows, onFollowChange }
}

const traceSink = () => vi.fn<(event: MessageScrollerTrace) => void>()

type TraceSink = ReturnType<typeof traceSink>

const tracedEvents = (trace: TraceSink) =>
	trace.mock.calls.map(([event]) => event)

const lastTrace = (trace: TraceSink) => {
	const last = tracedEvents(trace).at(-1)
	if (!last) throw new Error("no trace emitted")

	return last
}

const renderTracedScroller = () => {
	const trace = traceSink()
	return {
		trace,
		...renderScroller(TRACED_ROWS, {
			estimatedRowHeight: ESTIMATED_ROW_HEIGHT,
			onLandingTrace: trace,
		}),
	}
}

describe("MessageScroller mounted", () => {
	beforeEach(() => {
		observers.clear()
		vi.stubGlobal("ResizeObserver", TestResizeObserver)
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	it("holds the end when rows are added under a reader at the last message", () => {
		const { viewport, endOf, grow } = renderScroller(10)
		expect(viewport.scrollTop).toBe(endOf())

		grow(13)

		expect(viewport.scrollTop).toBe(endOf())
	})

	it("leaves the reading position still when rows are added under a reader up in the history", () => {
		const { viewport, grow } = renderScroller(10)
		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		grow(13)

		expect(viewport.scrollTop).toBe(0)
	})

	it("holds the end when the viewport loses height under a reader at the last message", () => {
		const { viewport, endOf, loseHeight } = renderScroller(10)
		expect(viewport.scrollTop).toBe(endOf())

		loseHeight(COMPOSER_GROWTH)

		expect(endOf() - viewport.scrollTop).toBeLessThanOrEqual(1)
	})

	it("reports no follow change when the viewport loses height under a reader at the last message", () => {
		const { loseHeight, onFollowChange } = renderScroller(10)

		loseHeight(COMPOSER_GROWTH)

		expect(onFollowChange).not.toHaveBeenCalledWith(false)
	})

	it("traces the gap left once rows measure taller than the estimate", () => {
		const { trace, measureRows } = renderTracedScroller()

		measureRows(MEASURED_ROW_HEIGHT)

		const last = lastTrace(trace)
		expect(last.scrollHeight).toBe(TRACED_ROWS * MEASURED_ROW_HEIGHT)
		expect(last.scrollHeight - last.scrollTop - VIEWPORT_HEIGHT).toBe(0)
	})

	it("stamps the landing traces with a rising sequence", () => {
		const { trace } = renderTracedScroller()

		const seen = tracedEvents(trace)
		expect(seen.map((event) => event.seq)).toEqual(
			seen.map((_, index) => index + 1),
		)
		expect(seen.every((event) => event.phase === "landing")).toBe(true)
	})

	it("traces the reader taking over as live", () => {
		const { trace, viewport } = renderTracedScroller()

		fireEvent.wheel(viewport)
		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		const readerScrolls = tracedEvents(trace).filter(
			(event) => event.type === "reader-scroll",
		)
		expect(readerScrolls.at(-1)).toMatchObject({
			phase: "live",
			scrollTop: 0,
			atLiveEdge: false,
		})
	})

	it("traces the requested end target when the transcript lands", () => {
		const { trace } = renderTracedScroller()

		const landing = tracedEvents(trace).find(
			(event) => event.type === "scroll-to-end",
		)
		expect(landing).toMatchObject({
			behavior: "auto",
			target: TRACED_ROWS * ESTIMATED_ROW_HEIGHT,
			phase: "landing",
		})
	})

	it("reports a follow change when the reader scrolls back past the threshold", () => {
		const { viewport, onFollowChange } = renderScroller(10)

		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		expect(onFollowChange).toHaveBeenCalledWith(false)
	})
})
