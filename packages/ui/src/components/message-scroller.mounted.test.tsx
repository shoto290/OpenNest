// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	MessageScroller,
	type MessageScrollerHandle,
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
const JUMP_ROW_COUNT = 40
const JUMP_TARGET = "row-5#2"

type TargetFilter = (target: Element) => boolean

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

	flush(accepts: TargetFilter) {
		const flushed = [...this.targets].filter(accepts)
		if (flushed.length === 0) return

		this.callback(
			flushed.map((target) => ({
				target,
				borderBoxSize: [
					{ inlineSize: target.clientWidth, blockSize: target.clientHeight },
				],
			})),
		)
	}
}

const acceptsEveryTarget: TargetFilter = () => true

const flushResize = (accepts: TargetFilter = acceptsEveryTarget) => {
	for (const observer of [...observers]) observer.flush(accepts)
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
			const clamped = Math.max(
				0,
				Math.min(next, viewport.scrollHeight - viewportHeight()),
			)
			if (clamped === scrollTop) return

			scrollTop = clamped
			requestAnimationFrame(() => {
				viewport.dispatchEvent(new Event("scroll"))
			})
		},
	})
}

const jumpRows = (): MessageScrollerRow[] =>
	Array.from({ length: JUMP_ROW_COUNT }, (_, index) => ({
		key: `row-${index}`,
		messageIds: [`row-${index}`, `row-${index}#2`],
		render: () => (
			<div data-message-id={`row-${index}#2`}>{`Row ${index}`}</div>
		),
	}))

const MEASURED_PROPERTIES = ["clientHeight", "offsetHeight"] as const

const heldDescriptors = new Map<string, PropertyDescriptor | undefined>()

const stubRowMeasurement = () => {
	for (const property of MEASURED_PROPERTIES) {
		heldDescriptors.set(
			property,
			Object.getOwnPropertyDescriptor(HTMLElement.prototype, property),
		)
		Object.defineProperty(HTMLElement.prototype, property, {
			configurable: true,
			get(this: HTMLElement) {
				return this.dataset.slot === "message-scroller-row"
					? MEASURED_ROW_HEIGHT
					: 0
			},
		})
	}
}

const restoreRowMeasurement = () => {
	for (const [property, descriptor] of heldDescriptors) {
		if (descriptor)
			Object.defineProperty(HTMLElement.prototype, property, descriptor)
	}
	heldDescriptors.clear()
}

const stubRectTop = (element: HTMLElement, top: () => number) => {
	element.getBoundingClientRect = () => ({ top: top(), height: 0 }) as DOMRect
}

const startOfRow = (row: HTMLElement) =>
	Number.parseFloat(row.style.transform.replace(/[^\d.-]/g, "")) || 0

const nextFrame = () =>
	new Promise((resolve) => {
		requestAnimationFrame(resolve)
	})

const runFrames = async (viewport: HTMLElement, count: number) => {
	for (let index = 0; index < count; index += 1) {
		await act(async () => {
			fireEvent.scroll(viewport)
			await nextFrame()
		})
	}
}

const deliverMeasurements = async (viewport: HTMLElement) => {
	await act(async () => {
		flushResize()
		await nextFrame()
	})
	await runFrames(viewport, 2)
}

const settle = async (viewport: HTMLElement, rounds = 4) => {
	for (let index = 0; index < rounds; index += 1) {
		await runFrames(viewport, 3)
		await deliverMeasurements(viewport)
	}
}

const renderJumpScroller = () => {
	const scrollerRef = createRef<MessageScrollerHandle>()
	const onFollowChange = vi.fn()
	const view = render(
		<MessageScroller
			smooth={false}
			estimatedRowHeight={ESTIMATED_ROW_HEIGHT}
			onFollowChange={onFollowChange}
			rows={jumpRows()}
			scrollerRef={scrollerRef}
		/>,
	)
	const viewport = view.container.querySelector<HTMLElement>("section")
	const list = view.container.querySelector<HTMLElement>(
		'[data-slot="message-scroller-rows"]',
	)
	if (!viewport || !list) throw new Error("viewport never mounted")

	stubLayout(
		viewport,
		() => VIEWPORT_HEIGHT,
		() => Number.parseFloat(list.style.height) || 0,
	)
	stubRectTop(viewport, () => 0)
	stubRectTop(list, () => -viewport.scrollTop)
	return { onFollowChange, scrollerRef, viewport }
}

const rowAt = (viewport: HTMLElement, index: number) =>
	viewport.querySelector<HTMLElement>(
		`[data-slot="message-scroller-row"][data-index="${index}"]`,
	)

const isLastRowInViewport = (viewport: HTMLElement) => {
	const row = rowAt(viewport, JUMP_ROW_COUNT - 1)
	if (!row) return false

	const start = startOfRow(row)
	return (
		start < viewport.scrollTop + VIEWPORT_HEIGHT &&
		start + MEASURED_ROW_HEIGHT > viewport.scrollTop
	)
}

const queryJumpToLatest = () =>
	screen.queryByRole("button", { name: "Jump to latest" })

const MEASUREMENT_ROUNDS = 8

const settleMeasurements = async () => {
	for (let index = 0; index < MEASUREMENT_ROUNDS; index += 1) {
		await act(async () => {
			flushResize()
			await nextFrame()
		})
	}
}

const LANDING_FRAME_GAP_MS = 400

const MEASURED_BATCH_CUT = 20

const isInFirstBatch: TargetFilter = (target) => {
	const index = Number.parseInt((target as HTMLElement).dataset.index ?? "", 10)
	return Number.isNaN(index) || index < MEASURED_BATCH_CUT
}

const holdSlowClock = () => {
	let elapsed = 0
	vi.spyOn(performance, "now").mockImplementation(() => elapsed)
	return () => {
		elapsed += LANDING_FRAME_GAP_MS
	}
}

const deliverMeasurementBatch = async (
	accepts: TargetFilter,
	tick: () => void,
) => {
	for (let index = 0; index < MEASUREMENT_ROUNDS; index += 1) {
		await act(async () => {
			flushResize(accepts)
			tick()
			await nextFrame()
		})
	}
}

const distanceFromEndOf = (viewport: HTMLElement) =>
	viewport.scrollHeight - viewport.scrollTop - VIEWPORT_HEIGHT

const readerScrollsToTop = async (viewport: HTMLElement) => {
	await act(async () => {
		fireEvent.wheel(viewport)
		viewport.scrollTop = 0
		fireEvent.scroll(viewport)
	})
	await settleMeasurements()
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
		restoreRowMeasurement()
		vi.restoreAllMocks()
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

	it("comes to rest on the last row when a taller-than-estimated transcript mounts", async () => {
		stubRowMeasurement()
		const { viewport } = renderJumpScroller()

		await settleMeasurements()

		expect(isLastRowInViewport(viewport)).toBe(true)
	})

	it("reports following once the mounted transcript rests on the last row", async () => {
		stubRowMeasurement()
		const { onFollowChange, scrollerRef } = renderJumpScroller()

		await settleMeasurements()

		expect(scrollerRef.current?.isFollowing()).toBe(true)
		expect(onFollowChange).not.toHaveBeenCalledWith(false)
		expect(queryJumpToLatest()).toBeNull()
	})

	it("brings the last row back when the reader activates jump to latest", async () => {
		stubRowMeasurement()
		const { onFollowChange, viewport } = renderJumpScroller()
		await settleMeasurements()
		await readerScrollsToTop(viewport)
		expect(onFollowChange).toHaveBeenLastCalledWith(false)
		const jump = queryJumpToLatest()
		if (!jump) throw new Error("jump to latest never appeared")

		await act(async () => {
			fireEvent.click(jump)
		})
		await settleMeasurements()

		expect(isLastRowInViewport(viewport)).toBe(true)
		expect(onFollowChange).toHaveBeenLastCalledWith(true)
		await waitFor(() => expect(queryJumpToLatest()).toBeNull())
	})

	it("settles on the end when measurement grows the transcript batch after batch", async () => {
		stubRowMeasurement()
		const tick = holdSlowClock()
		const { scrollerRef, viewport } = renderJumpScroller()

		await deliverMeasurementBatch(isInFirstBatch, tick)
		await deliverMeasurementBatch(acceptsEveryTarget, tick)

		expect(distanceFromEndOf(viewport)).toBe(0)
		expect(scrollerRef.current?.isFollowing()).toBe(true)
	})

	it("lands on an unmounted bubble of a later block once its row is measured", async () => {
		stubRowMeasurement()
		const { scrollerRef, viewport } = renderJumpScroller()
		await settle(viewport)
		expect(
			viewport.querySelector(`[data-message-id="${JUMP_TARGET}"]`),
		).toBeNull()

		await act(async () => {
			expect(scrollerRef.current?.scrollToMessage(JUMP_TARGET)).toBe(true)
		})
		await settle(viewport)

		const anchor = viewport.querySelector<HTMLElement>(
			`[data-message-id="${JUMP_TARGET}"]`,
		)
		const row = anchor?.closest<HTMLElement>(
			'[data-slot="message-scroller-row"]',
		)
		if (!row) throw new Error("target row never mounted")

		const start = startOfRow(row)
		expect(start).toBeLessThan(viewport.scrollTop + VIEWPORT_HEIGHT)
		expect(start + MEASURED_ROW_HEIGHT).toBeGreaterThan(viewport.scrollTop)
		expect(scrollerRef.current?.isFollowing()).toBe(false)
	})
})
