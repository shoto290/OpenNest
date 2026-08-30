// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	MessageScroller,
	type MessageScrollerRow,
} from "@workspace/ui/components/message-scroller"

import "@workspace/ui/lib/i18n"

const VIEWPORT_HEIGHT = 300
const ROW_HEIGHT = 80
const COMPOSER_GROWTH = 84
const ANCHOR_DRIFT = 6

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

const renderScroller = (count: number) => {
	let mountedRows = count
	let viewportHeight = VIEWPORT_HEIGHT
	const onFollowChange = vi.fn()
	const scroller = (rowCount: number) => (
		<MessageScroller
			smooth={false}
			estimatedRowHeight={ROW_HEIGHT}
			onFollowChange={onFollowChange}
			rows={rowsUpTo(rowCount)}
		/>
	)

	const view = render(scroller(0))
	const viewport = view.container.querySelector<HTMLElement>("section")
	if (!viewport) throw new Error("viewport never mounted")

	stubLayout(
		viewport,
		() => viewportHeight,
		() => mountedRows * ROW_HEIGHT,
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

	grow(count)
	return { viewport, endOf, grow, loseHeight, onFollowChange }
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

	it("reports a follow change when the reader scrolls back past the threshold", () => {
		const { viewport, onFollowChange } = renderScroller(10)

		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		expect(onFollowChange).toHaveBeenCalledWith(false)
	})
})
